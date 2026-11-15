import { REQUIRED_MODEL_ID, verifyReturnedModelIdentity } from './modelIdentity.ts';
import { computeEvidenceHash, FROZEN_R01_EVIDENCE_HASH } from './packet.ts';
import {
  ENVELOPE_SCHEMA_VERSION,
  EXPORT_SCHEMA_VERSION,
  type EvidencePacket,
  type ModelErrorResponse,
  type ModelReviewEnvelope,
  type ReviewOutput,
  type SyntheticCampaign,
  type ValidationIssue,
  type ValidationResult,
} from './types.ts';
import { applyModelIdentityQuarantine, validateReviewOutput } from './validation.ts';

export const RECORDED_REVIEW_RELATIVE_URL = './recorded/carbon-review-R01.json' as const;
export const RECORDED_REVIEW_PUBLIC_ASSET_PATH = 'public/recorded/carbon-review-R01.json' as const;

export type RecordedReviewImportOutcome =
  | {
      outcome: 'loaded';
      envelope: ModelReviewEnvelope;
    }
  | {
      outcome: 'quarantined';
      envelope: ModelReviewEnvelope;
    }
  | {
      outcome: 'unavailable';
      error: ModelErrorResponse;
    }
  | {
      outcome: 'aborted';
    };

function isIsoTimestamp(val: unknown): val is string {
  if (typeof val !== 'string' || val.trim().length < 16) return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(val.trim())) {
    return false;
  }
  return Number.isFinite(Date.parse(val));
}

function buildQuarantinedRecordedEnvelope(args: {
  campaign: SyntheticCampaign;
  packet: EvidencePacket;
  issues: ValidationIssue[];
  returnedModelVersion: string | null;
  originalRuntimeTimestamp: string;
  recordedSourceExportedAt: string | null;
  rawResponseText: string;
  baseValidation?: ValidationResult;
  modelIdentityValid?: boolean;
}): ModelReviewEnvelope {
  const identity = verifyReturnedModelIdentity(args.returnedModelVersion);
  const baseChecks = args.baseValidation?.checks ?? {
    schemaValid: false,
    structuredAssertionsValid: false,
    allIdsValid: false,
    budgetValid: false,
    narrativeScreeningValid: false,
    auditRefutedValid: false,
    statisticalClaimGuardValid: false,
    modelIdentityValid: args.modelIdentityValid ?? identity.isCarbonVerified,
  };

  return {
    envelopeSchemaVersion: ENVELOPE_SCHEMA_VERSION,
    campaignId: args.campaign.id,
    packetId: args.packet.packetId,
    requestedModel: REQUIRED_MODEL_ID,
    returnedModelVersion: identity.normalizedVersion,
    returnedModelVersionReported: Boolean(identity.normalizedVersion),
    modelIdentityStatus: identity.status,
    runtimeAccessProven: false,
    originalRecordedRuntimeAccessProven: false,
    statusNote:
      'Recorded review artifact failed deterministic schema, provenance, hash, or grounding verification and has been quarantined.',
    timestamp: args.originalRuntimeTimestamp,
    originalRuntimeTimestamp: args.originalRuntimeTimestamp,
    recordedSourceExportedAt: args.recordedSourceExportedAt,
    responseStatus: 'validation_failed',
    httpStatus: 200,
    evidenceHash: FROZEN_R01_EVIDENCE_HASH,
    sourceImmutableVerified: true,
    validation: {
      valid: false,
      status: 'validation_failed',
      issues: args.issues,
      budgetUsed: args.baseValidation?.budgetUsed ?? 0,
      budgetLimit: args.packet.nextRoundBudgetSlots,
      checks: {
        ...baseChecks,
        modelIdentityValid: args.modelIdentityValid ?? baseChecks.modelIdentityValid,
      },
    },
    review: null,
    rawResponseText: args.rawResponseText.slice(0, 24_000),
    isRecorded: true,
  };
}

export function verifyAndImportRecordedReview(
  rawPayload: unknown,
  campaign: SyntheticCampaign,
  packet: EvidencePacket,
): RecordedReviewImportOutcome {
  const recomputedPacketHash = computeEvidenceHash(packet);
  const fallbackNow = new Date().toISOString();

  if (!campaign.reviewEligible || !campaign.expectedPacketId || !campaign.expectedEvidenceHash) {
    return {
      outcome: 'unavailable',
      error: {
        errorCode: 'BAD_REQUEST',
        message: `Campaign "${campaign.id}" is held at the human gate and cannot load a Round R01 recorded review. Switch to CAMP-SYNTH-R01.`,
        requestedModel: REQUIRED_MODEL_ID,
        returnedModelVersion: null,
        runtimeAccessProven: false,
        statusNote: 'Recorded R01 review is restricted to CAMP-SYNTH-R01.',
        timestamp: fallbackNow,
        httpStatus: 400,
        evidenceHash: recomputedPacketHash,
      },
    };
  }

  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return {
      outcome: 'quarantined',
      envelope: buildQuarantinedRecordedEnvelope({
        campaign,
        packet,
        issues: [
          {
            code: 'RECORDING_SCHEMA_INVALID',
            message: 'Recorded review asset must be a JSON object.',
          },
        ],
        returnedModelVersion: null,
        originalRuntimeTimestamp: fallbackNow,
        recordedSourceExportedAt: null,
        rawResponseText: JSON.stringify(rawPayload ?? null),
        modelIdentityValid: false,
      }),
    };
  }

  const obj = rawPayload as Record<string, unknown>;
  const rawJsonString = JSON.stringify(rawPayload, null, 2);
  const issues: ValidationIssue[] = [];

  const isExportFormat = 'exportSchemaVersion' in obj;
  const isEnvelopeFormat = !isExportFormat && 'envelopeSchemaVersion' in obj;

  if (!isExportFormat && !isEnvelopeFormat) {
    issues.push({
      code: 'RECORDING_SCHEMA_VERSION_MISMATCH',
      message: `Recorded artifact is missing exportSchemaVersion="${EXPORT_SCHEMA_VERSION}" (or envelopeSchemaVersion="${ENVELOPE_SCHEMA_VERSION}"). Pre-correction or arbitrary JSON files cannot be loaded.`,
    });
  } else if (isExportFormat && obj.exportSchemaVersion !== EXPORT_SCHEMA_VERSION) {
    issues.push({
      code: 'RECORDING_SCHEMA_VERSION_MISMATCH',
      message: `Recorded exportSchemaVersion "${String(obj.exportSchemaVersion)}" is disallowed; static replay strictly requires post-correction schema "${EXPORT_SCHEMA_VERSION}".`,
    });
  } else if (isEnvelopeFormat && obj.envelopeSchemaVersion !== ENVELOPE_SCHEMA_VERSION) {
    issues.push({
      code: 'RECORDING_SCHEMA_VERSION_MISMATCH',
      message: `Recorded envelopeSchemaVersion "${String(obj.envelopeSchemaVersion)}" is disallowed; static replay strictly requires "${ENVELOPE_SCHEMA_VERSION}".`,
    });
  }

  // Extract metadata from ExportReviewPacket or ModelReviewEnvelope
  let recordCampaignId = '';
  let recordEvidenceHash = '';
  let recordRecomputedHash = '';
  let recordPacketId = '';
  let requestedModel = '';
  let returnedModelVersion: string | null = null;
  let originalRuntimeTimestamp = '';
  let recordedSourceExportedAt: string | null = null;
  let originalProvenFlag = false;
  let statusNoteText = '';
  let isSimulatedFlag = Boolean(obj.isSimulatedTestFixture);
  let candidateReviewOutput: unknown = null;

  if (isExportFormat) {
    // Preserve genuine recordings made before the permanent product rename.
    if (obj.application !== 'GammaFold' && obj.application !== 'GammaFold Final') {
      issues.push({
        code: 'RECORDING_APPLICATION_MISMATCH',
        message: 'Recorded export application must identify GammaFold or its legacy recorded name.',
      });
    }
    const campObj = obj.campaign as Record<string, unknown> | undefined;
    const integrityObj = obj.sourceIntegrity as Record<string, unknown> | undefined;
    const metaObj = obj.modelMetadata as Record<string, unknown> | undefined;

    recordCampaignId = typeof campObj?.campaignId === 'string' ? campObj.campaignId : '';
    recordEvidenceHash =
      typeof integrityObj?.evidenceHash === 'string' ? integrityObj.evidenceHash : '';
    recordRecomputedHash =
      typeof integrityObj?.recomputedEvidenceHash === 'string'
        ? integrityObj.recomputedEvidenceHash
        : '';
    recordPacketId =
      typeof integrityObj?.packetId === 'string'
        ? integrityObj.packetId
        : typeof (obj.sourcePacket as Record<string, unknown> | undefined)?.packetId === 'string'
          ? ((obj.sourcePacket as Record<string, unknown>).packetId as string)
          : '';

    if (obj.sourcePacket && typeof obj.sourcePacket === 'object') {
      const embeddedHash = computeEvidenceHash(obj.sourcePacket as EvidencePacket);
      if (embeddedHash !== FROZEN_R01_EVIDENCE_HASH) {
        issues.push({
          code: 'RECORDING_EMBEDDED_PACKET_MISMATCH',
          message: `Embedded sourcePacket SHA-256 (${embeddedHash}) does not match frozen R01 hash (${FROZEN_R01_EVIDENCE_HASH}).`,
        });
      }
    } else {
      issues.push({
        code: 'RECORDING_MISSING_SOURCE_PACKET',
        message: 'Recorded export packet is missing sourcePacket.',
      });
    }

    requestedModel = typeof metaObj?.requestedModel === 'string' ? metaObj.requestedModel : '';
    returnedModelVersion =
      typeof metaObj?.returnedModelVersion === 'string' ? metaObj.returnedModelVersion : null;
    originalRuntimeTimestamp =
      typeof metaObj?.originalRuntimeTimestamp === 'string'
        ? metaObj.originalRuntimeTimestamp
        : typeof metaObj?.timestamp === 'string'
          ? metaObj.timestamp
          : '';
    recordedSourceExportedAt = typeof obj.exportedAt === 'string' ? obj.exportedAt : null;
    originalProvenFlag = Boolean(
      metaObj?.runtimeAccessProven || metaObj?.originalRecordedRuntimeAccessProven,
    );
    statusNoteText = typeof metaObj?.statusNote === 'string' ? metaObj.statusNote : '';
    if (metaObj?.isSimulatedTestFixture === true) {
      isSimulatedFlag = true;
    }
    candidateReviewOutput = obj.modelOutput;

    if (!isIsoTimestamp(recordedSourceExportedAt)) {
      issues.push({
        code: 'RECORDING_EXPORT_TIMESTAMP_INVALID',
        message: 'Recorded export packet has a missing or invalid ISO-8601 exportedAt timestamp.',
      });
    }
  } else if (isEnvelopeFormat) {
    recordCampaignId = typeof obj.campaignId === 'string' ? obj.campaignId : '';
    recordPacketId = typeof obj.packetId === 'string' ? obj.packetId : '';
    recordEvidenceHash = typeof obj.evidenceHash === 'string' ? obj.evidenceHash : '';
    recordRecomputedHash = recordEvidenceHash;
    requestedModel = typeof obj.requestedModel === 'string' ? obj.requestedModel : '';
    returnedModelVersion =
      typeof obj.returnedModelVersion === 'string' ? obj.returnedModelVersion : null;
    originalRuntimeTimestamp =
      typeof obj.originalRuntimeTimestamp === 'string'
        ? obj.originalRuntimeTimestamp
        : typeof obj.timestamp === 'string'
          ? obj.timestamp
          : '';
    recordedSourceExportedAt =
      typeof obj.recordedSourceExportedAt === 'string' ? obj.recordedSourceExportedAt : null;
    originalProvenFlag = Boolean(
      obj.runtimeAccessProven || obj.originalRecordedRuntimeAccessProven,
    );
    statusNoteText = typeof obj.statusNote === 'string' ? obj.statusNote : '';
    candidateReviewOutput = obj.review;
  }

  if (isSimulatedFlag || /TEST FIXTURE|SIMULATED/i.test(statusNoteText)) {
    issues.push({
      code: 'RECORDING_TEST_FIXTURE_FORBIDDEN',
      message:
        'Simulated test fixtures are strictly forbidden in recorded-review replay. Supply a genuine gemini-4-carbon runtime export.',
    });
  }

  if (recordCampaignId !== campaign.id) {
    issues.push({
      code: 'RECORDING_CAMPAIGN_MISMATCH',
      message: `Recorded campaignId "${recordCampaignId}" does not match active campaign "${campaign.id}".`,
    });
  }

  if (recordPacketId !== packet.packetId) {
    issues.push({
      code: 'RECORDING_PACKET_ID_MISMATCH',
      message: `Recorded packetId "${recordPacketId}" does not match "${packet.packetId}".`,
    });
  }

  if (
    recordEvidenceHash !== FROZEN_R01_EVIDENCE_HASH ||
    recordRecomputedHash !== FROZEN_R01_EVIDENCE_HASH ||
    recomputedPacketHash !== FROZEN_R01_EVIDENCE_HASH
  ) {
    issues.push({
      code: 'RECORDING_HASH_MISMATCH',
      message: `Recorded evidenceHash ("${recordEvidenceHash}") does not match frozen packet SHA-256 ("${FROZEN_R01_EVIDENCE_HASH}").`,
    });
  }

  if (requestedModel !== REQUIRED_MODEL_ID) {
    issues.push({
      code: 'RECORDING_REQUESTED_MODEL_INVALID',
      message: `Recorded requestedModel "${requestedModel}" must equal "${REQUIRED_MODEL_ID}".`,
    });
  }

  const identity = verifyReturnedModelIdentity(returnedModelVersion);
  if (!identity.isCarbonVerified) {
    issues.push({
      code: 'RECORDING_MODEL_IDENTITY_INVALID',
      message: identity.isQuarantinedMismatch
        ? `Recorded returnedModelVersion "${returnedModelVersion}" is non-Carbon and quarantined.`
        : 'Recorded artifact lacks a provider-reported gemini-4-carbon modelVersion string.',
    });
  }

  if (!originalProvenFlag) {
    issues.push({
      code: 'RECORDING_PROVENANCE_UNVERIFIED',
      message: 'Recorded artifact does not carry original runtimeAccessProven=true provenance.',
    });
  }

  if (!isIsoTimestamp(originalRuntimeTimestamp)) {
    issues.push({
      code: 'RECORDING_TIMESTAMP_INVALID',
      message: 'Recorded artifact is missing a valid ISO-8601 original runtime timestamp.',
    });
  }

  const baseValidation = validateReviewOutput(candidateReviewOutput, packet);
  const combinedValidation = applyModelIdentityQuarantine(
    baseValidation,
    identity.normalizedVersion,
    !identity.isCarbonVerified,
  );

  const allIssues = [...issues, ...combinedValidation.issues];

  if (allIssues.length > 0 || !combinedValidation.valid) {
    return {
      outcome: 'quarantined',
      envelope: buildQuarantinedRecordedEnvelope({
        campaign,
        packet,
        issues: allIssues,
        returnedModelVersion: identity.normalizedVersion,
        originalRuntimeTimestamp: isIsoTimestamp(originalRuntimeTimestamp)
          ? originalRuntimeTimestamp
          : fallbackNow,
        recordedSourceExportedAt,
        rawResponseText: rawJsonString,
        baseValidation: combinedValidation,
        modelIdentityValid: identity.isCarbonVerified,
      }),
    };
  }

  const verifiedEnvelope: ModelReviewEnvelope = {
    envelopeSchemaVersion: ENVELOPE_SCHEMA_VERSION,
    campaignId: campaign.id,
    packetId: packet.packetId,
    requestedModel: REQUIRED_MODEL_ID,
    returnedModelVersion: identity.normalizedVersion,
    returnedModelVersionReported: true,
    modelIdentityStatus: 'verified_carbon',
    runtimeAccessProven: false,
    originalRecordedRuntimeAccessProven: true,
    statusNote: `Loaded verified static recorded ${REQUIRED_MODEL_ID} review originally executed at ${originalRuntimeTimestamp} (returned modelVersion "${identity.normalizedVersion}"). No live API call was made in this session.`,
    timestamp: originalRuntimeTimestamp,
    originalRuntimeTimestamp,
    recordedSourceExportedAt,
    responseStatus: 'validated',
    httpStatus: 200,
    evidenceHash: FROZEN_R01_EVIDENCE_HASH,
    sourceImmutableVerified: true,
    validation: combinedValidation,
    review: candidateReviewOutput as ReviewOutput,
    rawResponseText: rawJsonString.slice(0, 24_000),
    isRecorded: true,
  };

  return {
    outcome: 'loaded',
    envelope: verifiedEnvelope,
  };
}

function isAbortFailure(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
    return true;
  }
  return err instanceof Error && err.name === 'AbortError';
}

export async function loadRecordedReviewFromUrl(
  campaign: SyntheticCampaign,
  packet: EvidencePacket,
  url: string = RECORDED_REVIEW_RELATIVE_URL,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<RecordedReviewImportOutcome> {
  if (signal?.aborted) {
    return { outcome: 'aborted' };
  }

  const now = new Date().toISOString();
  const evidenceHash = computeEvidenceHash(packet);

  if (!campaign.reviewEligible) {
    return {
      outcome: 'unavailable',
      error: {
        errorCode: 'BAD_REQUEST',
        message: `Campaign "${campaign.id}" is held at the human gate. Select CAMP-SYNTH-R01 to load a recorded Round R01 Carbon review.`,
        requestedModel: REQUIRED_MODEL_ID,
        returnedModelVersion: null,
        runtimeAccessProven: false,
        statusNote: 'Recorded R01 review requires active campaign CAMP-SYNTH-R01.',
        timestamp: now,
        httpStatus: 400,
        evidenceHash,
      },
    };
  }

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    });
  } catch (err: unknown) {
    if (isAbortFailure(err, signal)) {
      return { outcome: 'aborted' };
    }
    return {
      outcome: 'unavailable',
      error: {
        errorCode: 'RECORDED_REVIEW_UNAVAILABLE',
        message: `No recorded Carbon review artifact could be fetched from "${url}". Frozen packet inspection, deterministic checks, 1UBQ schematic, campaign navigation, and packet export remain available.`,
        requestedModel: REQUIRED_MODEL_ID,
        returnedModelVersion: null,
        runtimeAccessProven: false,
        statusNote: 'Recorded Carbon review asset is not present in this static bundle.',
        timestamp: now,
        httpStatus: 404,
        evidenceHash,
      },
    };
  }

  if (signal?.aborted) {
    return { outcome: 'aborted' };
  }

  if (response.status === 404 || !response.ok) {
    return {
      outcome: 'unavailable',
      error: {
        errorCode: 'RECORDED_REVIEW_UNAVAILABLE',
        message: `Recorded Carbon review artifact is not bundled at "${url}" (HTTP ${response.status}). Copy a verified post-correction 3.0.0 runtime export to ${RECORDED_REVIEW_PUBLIC_ASSET_PATH} and rebuild static assets.`,
        requestedModel: REQUIRED_MODEL_ID,
        returnedModelVersion: null,
        runtimeAccessProven: false,
        statusNote: `No recorded review file present at ${url}; test fixtures are never substituted.`,
        timestamp: now,
        httpStatus: response.status,
        evidenceHash,
      },
    };
  }

  let rawText: string;
  try {
    rawText = (await response.text()).trim();
  } catch (err: unknown) {
    if (isAbortFailure(err, signal)) {
      return { outcome: 'aborted' };
    }
    return {
      outcome: 'unavailable',
      error: {
        errorCode: 'RECORDED_REVIEW_UNAVAILABLE',
        message: `No recorded Carbon review artifact could be read from "${url}".`,
        requestedModel: REQUIRED_MODEL_ID,
        returnedModelVersion: null,
        runtimeAccessProven: false,
        statusNote: 'Recorded Carbon review asset stream read failed.',
        timestamp: now,
        httpStatus: 500,
        evidenceHash,
      },
    };
  }

  if (signal?.aborted) {
    return { outcome: 'aborted' };
  }

  if (!rawText || /^<!doctype\s+html|^<html/i.test(rawText)) {
    return {
      outcome: 'unavailable',
      error: {
        errorCode: 'RECORDED_REVIEW_UNAVAILABLE',
        message: `Recorded Carbon review artifact is not bundled at "${url}". Copy a verified post-correction 3.0.0 runtime export to ${RECORDED_REVIEW_PUBLIC_ASSET_PATH} and rebuild static assets.`,
        requestedModel: REQUIRED_MODEL_ID,
        returnedModelVersion: null,
        runtimeAccessProven: false,
        statusNote: `No recorded review file present at ${url}; test fixtures are never substituted.`,
        timestamp: now,
        httpStatus: 404,
        evidenceHash,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      outcome: 'quarantined',
      envelope: buildQuarantinedRecordedEnvelope({
        campaign,
        packet,
        issues: [
          {
            code: 'RECORDING_MALFORMED_JSON',
            message: `Recorded review file at "${url}" is not valid JSON and has been quarantined.`,
          },
        ],
        returnedModelVersion: null,
        originalRuntimeTimestamp: now,
        recordedSourceExportedAt: null,
        rawResponseText: rawText,
        modelIdentityValid: false,
      }),
    };
  }

  return verifyAndImportRecordedReview(parsed, campaign, packet);
}
