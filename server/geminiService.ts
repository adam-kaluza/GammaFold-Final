import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { DEFAULT_CAMPAIGN_ID, getCampaignById } from '../src/domain/campaigns.ts';
import { verifyReturnedModelIdentity } from '../src/domain/modelIdentity.ts';
import {
  computeEvidenceHash,
  SYNTHETIC_EVIDENCE_PACKET,
  verifyFrozenPacketIntegrity,
} from '../src/domain/packet.ts';
import { buildReviewSystemInstruction, buildReviewUserPrompt } from '../src/domain/prompt.ts';
import {
  ENVELOPE_SCHEMA_VERSION,
  type ModelErrorResponse,
  type ModelReviewEnvelope,
  type ModelStatusSnapshot,
  type ReviewOutput,
  type SyntheticCampaignId,
} from '../src/domain/types.ts';
import { applyModelIdentityQuarantine, validateReviewOutput } from '../src/domain/validation.ts';
import {
  isLiveModeEnabled,
  isUsableApiKey,
  MAX_OUTPUT_CHARS,
  redactConfiguredSecrets,
  REQUEST_TIMEOUT_MS,
  REQUIRED_CARBON_MODEL_ID,
  resolveCooldownMs,
  resolveMaxLiveRequests,
  resolveServerModelConfig,
} from './config.ts';

const FACT_ASSERTION_ITEM_SCHEMA = {
  type: Type.OBJECT,
  required: ['recordId', 'field', 'status', 'qualifier', 'value', 'units'],
  properties: {
    recordId: {
      type: Type.STRING,
      enum: [
        'O01',
        'O02',
        'O03',
        'O04',
        'O05',
        'O06',
        'P01',
        'P02',
        'P03',
        'P04',
        'P05',
        'P06',
      ],
    },
    field: {
      type: Type.STRING,
      enum: ['value', 'upperBound'],
    },
    status: {
      type: Type.STRING,
      enum: ['measured', 'failed', 'missing', 'censored', 'prior_prediction'],
    },
    qualifier: {
      type: Type.STRING,
      enum: ['=', '<', 'none'],
    },
    value: {
      type: Type.NUMBER,
      nullable: true,
    },
    units: {
      type: Type.STRING,
      enum: ['RFU'],
    },
  },
};

export const REVIEW_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  required: [
    'summary',
    'evidenceFindings',
    'limitations',
    'proposedActions',
    'unsupportedClaimAudit',
  ],
  properties: {
    summary: {
      type: Type.STRING,
      description: 'Concise factual summary strictly grounded in the synthetic packet.',
    },
    evidenceFindings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['assertions', 'claim', 'sourceIds'],
        properties: {
          assertions: {
            type: Type.ARRAY,
            items: FACT_ASSERTION_ITEM_SCHEMA,
          },
          claim: { type: Type.STRING },
          sourceIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
      },
    },
    limitations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['note', 'sourceIds'],
        properties: {
          note: { type: Type.STRING },
          sourceIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
      },
    },
    proposedActions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['candidateId', 'purpose', 'assaySlots', 'sourceIds'],
        properties: {
          candidateId: { type: Type.STRING },
          purpose: { type: Type.STRING },
          assaySlots: { type: Type.INTEGER },
          sourceIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
      },
    },
    unsupportedClaimAudit: {
      type: Type.OBJECT,
      required: ['auditId', 'claimToCheck', 'verdict', 'assertions', 'correction', 'sourceIds'],
      properties: {
        auditId: {
          type: Type.STRING,
          enum: ['AUDIT-CLAIM-01'],
        },
        claimToCheck: { type: Type.STRING },
        verdict: {
          type: Type.STRING,
          enum: ['contradicted', 'unsupported'],
        },
        assertions: {
          type: Type.ARRAY,
          items: FACT_ASSERTION_ITEM_SCHEMA,
        },
        correction: { type: Type.STRING },
        sourceIds: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
    },
  },
};

export interface ProviderGenerateArgs {
  apiKey: string;
  model: string;
  systemInstruction: string;
  userPrompt: string;
  abortSignal: AbortSignal;
}

export interface ProviderGenerateResult {
  text: string | undefined;
  modelVersion?: string | undefined;
}

export interface ReviewServiceDependencies {
  getApiKey?: () => string | undefined;
  getEnvModel?: () => string | undefined;
  getLiveModeEnabled?: () => boolean;
  maxLiveRequests?: number;
  cooldownMs?: number;
  nowMs?: () => number;
  timeoutMs?: number;
  maxOutputChars?: number;
  isSimulatedTestFixture?: boolean;
  onLocalDiagnostic?: (redactedMessage: string) => void;
  generateReview?: (args: ProviderGenerateArgs) => Promise<ProviderGenerateResult>;
}

export interface ExecuteReviewRequest {
  campaignId?: string;
  modelId?: string;
}

export interface ReviewService {
  getModelStatus: () => ModelStatusSnapshot;
  isReviewInFlight: () => boolean;
  executeEvidenceReview: (req?: ExecuteReviewRequest) => Promise<{
    status: number;
    body: ModelReviewEnvelope | ModelErrorResponse;
  }>;
}

function extractStatusCode(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const record = err as Record<string, unknown>;
  if (typeof record.status === 'number') return record.status;
  if (typeof record.code === 'number') return record.code;
  return undefined;
}

async function defaultGoogleGenAIGenerate(
  args: ProviderGenerateArgs,
): Promise<ProviderGenerateResult> {
  const ai = new GoogleGenAI({
    apiKey: args.apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'gammafold-final-local-loopback',
      },
    },
  });

  const response = await ai.models.generateContent({
    model: args.model,
    contents: args.userPrompt,
    config: {
      systemInstruction: args.systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: REVIEW_RESPONSE_SCHEMA,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      abortSignal: args.abortSignal,
    },
  });

  return {
    text: response.text,
    modelVersion: response.modelVersion,
  };
}

export function createReviewService(deps: ReviewServiceDependencies = {}): ReviewService {
  const getApiKey = deps.getApiKey ?? (() => process.env.GEMINI_API_KEY);
  const getEnvModel = deps.getEnvModel ?? (() => process.env.GEMINI_MODEL);
  const getLiveModeEnabled = deps.getLiveModeEnabled ?? (() => isLiveModeEnabled());
  const maxLiveRequests = deps.maxLiveRequests ?? resolveMaxLiveRequests();
  const cooldownMs = deps.cooldownMs ?? resolveCooldownMs();
  const nowMs = deps.nowMs ?? (() => Date.now());
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxOutputChars = deps.maxOutputChars ?? MAX_OUTPUT_CHARS;
  const isSimulatedTestFixture = Boolean(deps.isSimulatedTestFixture);
  const onLocalDiagnostic = deps.onLocalDiagnostic;
  const generateReview = deps.generateReview ?? defaultGoogleGenAIGenerate;

  let activeReviewInFlight = false;
  let sessionRequestsUsed = 0;
  let lastAttemptAtMs: number | null = null;
  let runtimeReceipt: {
    proven: boolean;
    returnedModelVersion: string | null;
    checkedAt: string;
    note: string;
  } | null = null;

  function emitRedactedDiagnostic(rawDiag: string): void {
    if (!onLocalDiagnostic) return;
    const redacted = redactConfiguredSecrets(rawDiag, [getApiKey(), getEnvModel()]);
    onLocalDiagnostic(redacted);
  }

  function getCooldownRemainingMs(currentMs: number): number {
    if (lastAttemptAtMs === null || cooldownMs <= 0) return 0;
    return Math.max(0, cooldownMs - (currentMs - lastAttemptAtMs));
  }

  function getModelStatus(): ModelStatusSnapshot {
    const rawKey = getApiKey();
    const hasApiKey = isUsableApiKey(rawKey);
    const liveModeEnabled = getLiveModeEnabled();
    const modelCfg = resolveServerModelConfig(getEnvModel());
    const evidenceHash = computeEvidenceHash(SYNTHETIC_EVIDENCE_PACKET);
    const currentMs = nowMs();
    const nowIso = new Date(currentMs).toISOString();
    const cooldownRemainingMs = getCooldownRemainingMs(currentMs);

    const safeConfiguredModel = modelCfg.modelPolicyValid
      ? REQUIRED_CARBON_MODEL_ID
      : '[DISALLOWED_MODEL_CONFIG]';

    if (!modelCfg.modelPolicyValid) {
      return {
        hasApiKey,
        liveModeEnabled,
        listenHostPolicy: 'loopback_only',
        sessionRequestsUsed,
        sessionMaxRequests: maxLiveRequests,
        cooldownMs,
        cooldownRemainingMs,
        requestedModel: REQUIRED_CARBON_MODEL_ID,
        configuredEnvModel: safeConfiguredModel,
        modelPolicyValid: false,
        fallbackDisabled: true,
        runtimeAccessProven: false,
        lastReturnedModelVersion: null,
        lastRuntimeCheckAt: runtimeReceipt?.checkedAt ?? null,
        statusNote: `Server GEMINI_MODEL configuration violates policy. GammaFold Final strictly requires ${REQUIRED_CARBON_MODEL_ID} and disables silent fallback.`,
        evidenceHash,
        checkedAt: nowIso,
      };
    }

    if (!liveModeEnabled) {
      return {
        hasApiKey,
        liveModeEnabled: false,
        listenHostPolicy: 'loopback_only',
        sessionRequestsUsed,
        sessionMaxRequests: maxLiveRequests,
        cooldownMs,
        cooldownRemainingMs,
        requestedModel: REQUIRED_CARBON_MODEL_ID,
        configuredEnvModel: REQUIRED_CARBON_MODEL_ID,
        modelPolicyValid: true,
        fallbackDisabled: true,
        runtimeAccessProven: false,
        lastReturnedModelVersion: null,
        lastRuntimeCheckAt: null,
        statusNote:
          'Local live mode is disabled by default (set GAMMAFOLD_LIVE_MODE=true locally to enable temporary loopback Carbon inference). Frozen packet inspection, deterministic checks, recorded replay, and JSON export remain active.',
        evidenceHash,
        checkedAt: nowIso,
      };
    }

    if (!hasApiKey) {
      return {
        hasApiKey: false,
        liveModeEnabled: true,
        listenHostPolicy: 'loopback_only',
        sessionRequestsUsed,
        sessionMaxRequests: maxLiveRequests,
        cooldownMs,
        cooldownRemainingMs,
        requestedModel: REQUIRED_CARBON_MODEL_ID,
        configuredEnvModel: REQUIRED_CARBON_MODEL_ID,
        modelPolicyValid: true,
        fallbackDisabled: true,
        runtimeAccessProven: false,
        lastReturnedModelVersion: null,
        lastRuntimeCheckAt: null,
        statusNote:
          'Server GEMINI_API_KEY is not configured. Live gemini-4-carbon inference is unavailable until secure local credentials are supplied; frozen packet inspection, deterministic checks, and JSON export remain active.',
        evidenceHash,
        checkedAt: nowIso,
      };
    }

    if (runtimeReceipt) {
      return {
        hasApiKey: true,
        liveModeEnabled: true,
        listenHostPolicy: 'loopback_only',
        sessionRequestsUsed,
        sessionMaxRequests: maxLiveRequests,
        cooldownMs,
        cooldownRemainingMs,
        requestedModel: REQUIRED_CARBON_MODEL_ID,
        configuredEnvModel: REQUIRED_CARBON_MODEL_ID,
        modelPolicyValid: true,
        fallbackDisabled: true,
        runtimeAccessProven: runtimeReceipt.proven,
        lastReturnedModelVersion: runtimeReceipt.returnedModelVersion,
        lastRuntimeCheckAt: runtimeReceipt.checkedAt,
        statusNote: runtimeReceipt.note,
        evidenceHash,
        checkedAt: nowIso,
      };
    }

    return {
      hasApiKey: true,
      liveModeEnabled: true,
      listenHostPolicy: 'loopback_only',
      sessionRequestsUsed,
      sessionMaxRequests: maxLiveRequests,
      cooldownMs,
      cooldownRemainingMs,
      requestedModel: REQUIRED_CARBON_MODEL_ID,
      configuredEnvModel: REQUIRED_CARBON_MODEL_ID,
      modelPolicyValid: true,
      fallbackDisabled: true,
      runtimeAccessProven: false,
      lastReturnedModelVersion: null,
      lastRuntimeCheckAt: null,
      statusNote: `Local loopback live mode active (${sessionRequestsUsed}/${maxLiveRequests} session requests used). App-runtime access to ${REQUIRED_CARBON_MODEL_ID} has not yet been executed in this session (silent fallback disabled).`,
      evidenceHash,
      checkedAt: nowIso,
    };
  }

  function isReviewInFlight(): boolean {
    return activeReviewInFlight;
  }

  async function executeEvidenceReview(req: ExecuteReviewRequest = {}): Promise<{
    status: number;
    body: ModelReviewEnvelope | ModelErrorResponse;
  }> {
    const startMs = nowMs();
    const timestamp = new Date(startMs).toISOString();
    const evidenceHash = computeEvidenceHash(SYNTHETIC_EVIDENCE_PACKET);

    if (!verifyFrozenPacketIntegrity(SYNTHETIC_EVIDENCE_PACKET)) {
      return {
        status: 500,
        body: {
          errorCode: 'SOURCE_INTEGRITY_ERROR',
          message: 'Frozen synthetic evidence packet SHA-256 integrity check failed.',
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: 'Aborted before inference due to source hash mismatch.',
          timestamp,
          httpStatus: 500,
          evidenceHash,
        },
      };
    }

    const modelCfg = resolveServerModelConfig(getEnvModel());
    if (!modelCfg.modelPolicyValid) {
      emitRedactedDiagnostic(`Blocked invalid GEMINI_MODEL configuration: ${modelCfg.configuredEnvModel}`);
      return {
        status: 503,
        body: {
          errorCode: 'INVALID_SERVER_MODEL_CONFIG',
          message: `Server GEMINI_MODEL configuration violates policy. GammaFold Final strictly requires "${REQUIRED_CARBON_MODEL_ID}" and refuses fallback to Hydrogen or Flash.`,
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: 'Blocked non-Carbon server model configuration.',
          timestamp,
          httpStatus: 503,
          evidenceHash,
        },
      };
    }

    if (req.modelId !== undefined) {
      const trimmedModel = req.modelId.trim();
      if (trimmedModel.length > 0 && trimmedModel !== REQUIRED_CARBON_MODEL_ID) {
        return {
          status: 400,
          body: {
            errorCode: 'MODEL_POLICY_VIOLATION',
            message: `Requested model override is disallowed. GammaFold Final strictly executes "${REQUIRED_CARBON_MODEL_ID}" with no fallback to Hydrogen or Flash.`,
            requestedModel: REQUIRED_CARBON_MODEL_ID,
            returnedModelVersion: null,
            runtimeAccessProven: false,
            statusNote: 'Rejected non-Carbon client model override.',
            timestamp,
            httpStatus: 400,
            evidenceHash,
          },
        };
      }
    }

    const rawCampaignId = req.campaignId?.trim() || DEFAULT_CAMPAIGN_ID;
    if (rawCampaignId.length > 64) {
      return {
        status: 400,
        body: {
          errorCode: 'BAD_REQUEST',
          message: 'Invalid campaignId length.',
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: 'Rejected invalid campaign identifier.',
          timestamp,
          httpStatus: 400,
          evidenceHash,
        },
      };
    }

    const campaign = getCampaignById(rawCampaignId);
    if (!campaign || campaign.id !== rawCampaignId) {
      return {
        status: 400,
        body: {
          errorCode: 'BAD_REQUEST',
          message: 'Unknown synthetic campaign identifier.',
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: 'Rejected unknown campaign ID.',
          timestamp,
          httpStatus: 400,
          evidenceHash,
        },
      };
    }

    if (!campaign.reviewEligible) {
      return {
        status: 400,
        body: {
          errorCode: 'BAD_REQUEST',
          message:
            'Selected campaign is a non-executable human-gate proposal envelope with zero recorded observations. Select CAMP-SYNTH-R01 to review frozen synthetic Round R01.',
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: 'Selected campaign is held behind the human review gate.',
          timestamp,
          httpStatus: 400,
          evidenceHash,
        },
      };
    }

    if (!getLiveModeEnabled()) {
      return {
        status: 503,
        body: {
          errorCode: 'LIVE_MODE_DISABLED',
          message:
            'Local live inference mode is disabled. Set GAMMAFOLD_LIVE_MODE=true alongside a local GEMINI_API_KEY on loopback (127.0.0.1) to execute a live gemini-4-carbon review.',
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: `Live ${REQUIRED_CARBON_MODEL_ID} inference blocked: GAMMAFOLD_LIVE_MODE is not enabled.`,
          timestamp,
          httpStatus: 503,
          evidenceHash,
        },
      };
    }

    if (activeReviewInFlight) {
      return {
        status: 409,
        body: {
          errorCode: 'REQUEST_IN_FLIGHT',
          message:
            'A gemini-4-carbon evidence review request is already in flight. Please wait for the active request to complete.',
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: `Concurrent request blocked while ${REQUIRED_CARBON_MODEL_ID} call is in flight.`,
          timestamp,
          httpStatus: 409,
          evidenceHash,
        },
      };
    }

    const rawKey = getApiKey();
    if (!isUsableApiKey(rawKey)) {
      return {
        status: 503,
        body: {
          errorCode: 'MISSING_API_KEY',
          message:
            'Server GEMINI_API_KEY is not configured. Supply a valid local server-side GEMINI_API_KEY to run live gemini-4-carbon inference. Frozen source inspection, deterministic checks, and packet export remain available.',
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: `Live ${REQUIRED_CARBON_MODEL_ID} inference unavailable: server GEMINI_API_KEY missing.`,
          timestamp,
          httpStatus: 503,
          evidenceHash,
        },
      };
    }

    if (sessionRequestsUsed >= maxLiveRequests) {
      return {
        status: 429,
        body: {
          errorCode: 'SESSION_BUDGET_EXHAUSTED',
          message: `Local event session request budget (${maxLiveRequests} requests) has been reached. Restart the local server if additional deliberate runs are authorized.`,
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: `Session request budget (${sessionRequestsUsed}/${maxLiveRequests}) exhausted.`,
          timestamp,
          httpStatus: 429,
          evidenceHash,
        },
      };
    }

    const cooldownRemaining = getCooldownRemainingMs(startMs);
    if (cooldownRemaining > 0) {
      const waitSec = Math.max(1, Math.ceil(cooldownRemaining / 1000));
      return {
        status: 429,
        body: {
          errorCode: 'COOLDOWN_ACTIVE',
          message: `Request cooldown active (${waitSec}s remaining) to protect temporary event quota. Please wait before issuing another deliberate request.`,
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: `Cooldown active (${waitSec}s remaining).`,
          timestamp,
          httpStatus: 429,
          evidenceHash,
        },
      };
    }

    activeReviewInFlight = true;
    sessionRequestsUsed += 1;
    lastAttemptAtMs = startMs;

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const apiKey = rawKey!.trim();
      const response = await generateReview({
        apiKey,
        model: REQUIRED_CARBON_MODEL_ID,
        systemInstruction: buildReviewSystemInstruction(),
        userPrompt: buildReviewUserPrompt(SYNTHETIC_EVIDENCE_PACKET),
        abortSignal: controller.signal,
      });

      const completedAt = new Date(nowMs()).toISOString();
      const rawText = (response.text ?? '').trim().slice(0, maxOutputChars);
      const identity = verifyReturnedModelIdentity(response.modelVersion);
      const returnedModelVersion = identity.normalizedVersion;
      const sourceImmutableVerified = verifyFrozenPacketIntegrity(SYNTHETIC_EVIDENCE_PACKET);

      if (!rawText) {
        if (!isSimulatedTestFixture) {
          runtimeReceipt = {
            proven: false,
            returnedModelVersion: null,
            checkedAt: completedAt,
            note: `${REQUIRED_CARBON_MODEL_ID} returned an empty response body.`,
          };
        }
        return {
          status: 502,
          body: {
            errorCode: 'MALFORMED_RESPONSE',
            message: `${REQUIRED_CARBON_MODEL_ID} returned an empty response body.`,
            requestedModel: REQUIRED_CARBON_MODEL_ID,
            returnedModelVersion: null,
            runtimeAccessProven: false,
            statusNote: `${REQUIRED_CARBON_MODEL_ID} returned empty output.`,
            timestamp: completedAt,
            httpStatus: 502,
            evidenceHash,
            rawResponseText: '',
          },
        };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        if (!isSimulatedTestFixture) {
          runtimeReceipt = {
            proven: false,
            returnedModelVersion: null,
            checkedAt: completedAt,
            note: `${REQUIRED_CARBON_MODEL_ID} returned non-JSON output.`,
          };
        }
        return {
          status: 502,
          body: {
            errorCode: 'MALFORMED_RESPONSE',
            message: `${REQUIRED_CARBON_MODEL_ID} response could not be parsed as valid JSON.`,
            requestedModel: REQUIRED_CARBON_MODEL_ID,
            returnedModelVersion: null,
            runtimeAccessProven: false,
            statusNote: `${REQUIRED_CARBON_MODEL_ID} returned malformed JSON.`,
            timestamp: completedAt,
            httpStatus: 502,
            evidenceHash,
            rawResponseText: rawText,
          },
        };
      }

      const baseValidation = validateReviewOutput(parsed, SYNTHETIC_EVIDENCE_PACKET);
      const validation = applyModelIdentityQuarantine(
        baseValidation,
        returnedModelVersion,
        identity.isQuarantinedMismatch,
      );

      // runtimeAccessProven is true ONLY when a real (non-simulated) call reports a verified gemini-4-carbon modelVersion.
      const runtimeAccessProven = !isSimulatedTestFixture && identity.isCarbonVerified;

      let statusNote: string;
      if (isSimulatedTestFixture) {
        statusNote = identity.isQuarantinedMismatch
          ? `[TEST FIXTURE — NOT ACTUAL CARBON INFERENCE] Simulated response quarantined due to non-Carbon modelVersion "${returnedModelVersion}".`
          : identity.isCarbonVerified
            ? `[TEST FIXTURE — NOT ACTUAL CARBON INFERENCE] Simulated response processed (modelVersion "${returnedModelVersion}").`
            : '[TEST FIXTURE — NOT ACTUAL CARBON INFERENCE] Simulated response processed without reported modelVersion (returnedModelVersion: null).';
      } else if (identity.isQuarantinedMismatch) {
        statusNote = `Provider reported non-Carbon modelVersion "${returnedModelVersion}"; output quarantined and runtimeAccessProven set to false.`;
      } else if (!identity.isCarbonVerified) {
        statusNote = `Request sent to ${REQUIRED_CARBON_MODEL_ID}, but provider did not report a modelVersion string (returnedModelVersion: null; runtimeAccessProven remains false).`;
      } else {
        statusNote = `Live ${REQUIRED_CARBON_MODEL_ID} call completed (verified modelVersion "${returnedModelVersion}").`;
      }

      if (!isSimulatedTestFixture) {
        runtimeReceipt = {
          proven: runtimeAccessProven,
          returnedModelVersion,
          checkedAt: completedAt,
          note: statusNote,
        };
      }

      const envelope: ModelReviewEnvelope = {
        envelopeSchemaVersion: ENVELOPE_SCHEMA_VERSION,
        campaignId: campaign.id as SyntheticCampaignId,
        packetId: SYNTHETIC_EVIDENCE_PACKET.packetId,
        requestedModel: REQUIRED_CARBON_MODEL_ID,
        returnedModelVersion,
        returnedModelVersionReported: Boolean(returnedModelVersion),
        modelIdentityStatus: identity.status,
        runtimeAccessProven,
        statusNote,
        timestamp: completedAt,
        originalRuntimeTimestamp: completedAt,
        recordedSourceExportedAt: null,
        responseStatus: validation.valid ? 'validated' : 'validation_failed',
        httpStatus: 200,
        evidenceHash,
        sourceImmutableVerified,
        validation,
        review: validation.valid ? (parsed as ReviewOutput) : null,
        rawResponseText: rawText,
        isRecorded: false,
        ...(isSimulatedTestFixture ? { isSimulatedTestFixture: true } : {}),
      };

      return { status: 200, body: envelope };
    } catch (err: unknown) {
      const failedAt = new Date(nowMs()).toISOString();
      const errName = err instanceof Error ? err.name : '';
      const rawErrString = err instanceof Error ? err.message : String(err);
      emitRedactedDiagnostic(`Provider error during ${REQUIRED_CARBON_MODEL_ID} call: ${rawErrString}`);
      const statusCode = extractStatusCode(err);

      if (controller.signal.aborted || errName === 'AbortError' || /\babort/i.test(rawErrString)) {
        const note = `Request to ${REQUIRED_CARBON_MODEL_ID} timed out after ${Math.round(timeoutMs / 1000)}s.`;
        if (!isSimulatedTestFixture) {
          runtimeReceipt = { proven: false, returnedModelVersion: null, checkedAt: failedAt, note };
        }
        return {
          status: 504,
          body: {
            errorCode: 'TIMEOUT',
            message: `${REQUIRED_CARBON_MODEL_ID} inference exceeded the ${Math.round(timeoutMs / 1000)}-second server timeout. No automatic retry or fallback was performed; you may deliberately retry.`,
            requestedModel: REQUIRED_CARBON_MODEL_ID,
            returnedModelVersion: null,
            runtimeAccessProven: false,
            statusNote: note,
            timestamp: failedAt,
            httpStatus: 504,
            evidenceHash,
          },
        };
      }

      if (statusCode === 429 || /RESOURCE_EXHAUSTED|\b429\b|quota/i.test(rawErrString)) {
        const note = `${REQUIRED_CARBON_MODEL_ID} quota or rate limit exhausted (HTTP 429); silent fallback disabled.`;
        if (!isSimulatedTestFixture) {
          runtimeReceipt = { proven: false, returnedModelVersion: null, checkedAt: failedAt, note };
        }
        return {
          status: 429,
          body: {
            errorCode: 'QUOTA_EXCEEDED',
            message: `${REQUIRED_CARBON_MODEL_ID} returned a quota or rate-limit refusal (HTTP 429). GammaFold Final never falls back silently to Hydrogen or Flash.`,
            requestedModel: REQUIRED_CARBON_MODEL_ID,
            returnedModelVersion: null,
            runtimeAccessProven: false,
            statusNote: note,
            timestamp: failedAt,
            httpStatus: 429,
            evidenceHash,
          },
        };
      }

      if (statusCode === 403 || /PERMISSION_DENIED|API_KEY_INVALID|\b403\b/i.test(rawErrString)) {
        const note = `${REQUIRED_CARBON_MODEL_ID} access denied (HTTP 403) on supplied server key.`;
        if (!isSimulatedTestFixture) {
          runtimeReceipt = { proven: false, returnedModelVersion: null, checkedAt: failedAt, note };
        }
        return {
          status: 403,
          body: {
            errorCode: 'PERMISSION_DENIED',
            message: `${REQUIRED_CARBON_MODEL_ID} permission denied (HTTP 403) on the configured server credential. Silent fallback is disabled.`,
            requestedModel: REQUIRED_CARBON_MODEL_ID,
            returnedModelVersion: null,
            runtimeAccessProven: false,
            statusNote: note,
            timestamp: failedAt,
            httpStatus: 403,
            evidenceHash,
          },
        };
      }

      if (statusCode === 404 || /NOT_FOUND|not found|invalid model|\b404\b/i.test(rawErrString)) {
        const note = `${REQUIRED_CARBON_MODEL_ID} unavailable (HTTP 404) on configured endpoint.`;
        if (!isSimulatedTestFixture) {
          runtimeReceipt = { proven: false, returnedModelVersion: null, checkedAt: failedAt, note };
        }
        return {
          status: 404,
          body: {
            errorCode: 'MODEL_UNAVAILABLE',
            message: `Requested model "${REQUIRED_CARBON_MODEL_ID}" is unavailable (HTTP 404) on the configured endpoint. Silent fallback to Hydrogen or Flash is disabled.`,
            requestedModel: REQUIRED_CARBON_MODEL_ID,
            returnedModelVersion: null,
            runtimeAccessProven: false,
            statusNote: note,
            timestamp: failedAt,
            httpStatus: 404,
            evidenceHash,
          },
        };
      }

      // Fixed safe message for all unexpected upstream/provider errors: never echoes provider text or secrets.
      const note = `Request to ${REQUIRED_CARBON_MODEL_ID} failed due to an upstream or internal server error.`;
      if (!isSimulatedTestFixture) {
        runtimeReceipt = { proven: false, returnedModelVersion: null, checkedAt: failedAt, note };
      }
      return {
        status: 500,
        body: {
          errorCode: 'INTERNAL_ERROR',
          message:
            'Upstream provider request failed. Detailed provider diagnostics are withheld from public responses to protect temporary event credentials.',
          requestedModel: REQUIRED_CARBON_MODEL_ID,
          returnedModelVersion: null,
          runtimeAccessProven: false,
          statusNote: note,
          timestamp: failedAt,
          httpStatus: 500,
          evidenceHash,
        },
      };
    } finally {
      clearTimeout(timeoutHandle);
      activeReviewInFlight = false;
    }
  }

  return {
    getModelStatus,
    isReviewInFlight,
    executeEvidenceReview,
  };
}

export const defaultReviewService: ReviewService = createReviewService();
