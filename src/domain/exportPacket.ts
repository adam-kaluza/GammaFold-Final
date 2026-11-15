import { verifyEnvelopeMatchesCampaign } from './campaignSession.ts';
import { computeDeterministicSummary } from './checks.ts';
import { REQUIRED_MODEL_ID } from './modelIdentity.ts';
import { computeEvidenceHash, FROZEN_R01_EVIDENCE_HASH } from './packet.ts';
import {
  EXPORT_SCHEMA_VERSION,
  type EvidencePacket,
  type ExportExecutionMode,
  type ExportReviewPacket,
  type ModelErrorResponse,
  type ModelIdentityStatus,
  type ModelReviewEnvelope,
  type ModelStatusSnapshot,
  type ReviewResponseStatus,
  type SyntheticCampaign,
} from './types.ts';

export type ExportBindingErrorCode =
  | 'CAMPAIGN_NOT_EXPORTABLE'
  | 'CAMPAIGN_PACKET_MISMATCH'
  | 'SOURCE_HASH_MISMATCH'
  | 'REVIEW_CAMPAIGN_MISMATCH'
  | 'REVIEW_HASH_MISMATCH';

export class ExportBindingError extends Error {
  readonly code: ExportBindingErrorCode;

  constructor(code: ExportBindingErrorCode, message: string) {
    super(message);
    this.name = 'ExportBindingError';
    this.code = code;
  }
}

export interface BuildExportPacketInput {
  packet: EvidencePacket;
  campaign: SyntheticCampaign;
  reviewerNotes: string;
  status: ReviewResponseStatus;
  modelStatus: ModelStatusSnapshot | null;
  envelope: ModelReviewEnvelope | null;
  errorState: ModelErrorResponse | null;
  exportedAt?: string;
}

export function buildExportReviewPacket(input: BuildExportPacketInput): ExportReviewPacket {
  const { packet, campaign, reviewerNotes, status, modelStatus, envelope, errorState } = input;
  const recomputedHash = computeEvidenceHash(packet);

  if (recomputedHash !== FROZEN_R01_EVIDENCE_HASH) {
    throw new ExportBindingError(
      'SOURCE_HASH_MISMATCH',
      `Cannot export: recomputed packet SHA-256 (${recomputedHash}) does not match frozen R01 hash (${FROZEN_R01_EVIDENCE_HASH}).`,
    );
  }

  if (!campaign.reviewEligible || !campaign.expectedPacketId || !campaign.expectedEvidenceHash) {
    throw new ExportBindingError(
      'CAMPAIGN_NOT_EXPORTABLE',
      `Cannot export evidence review packet under non-reviewable campaign "${campaign.id}". Select CAMP-SYNTH-R01 to export frozen R01 evidence.`,
    );
  }

  if (
    campaign.expectedPacketId !== packet.packetId ||
    campaign.expectedEvidenceHash !== recomputedHash
  ) {
    throw new ExportBindingError(
      'CAMPAIGN_PACKET_MISMATCH',
      `Cannot export: campaign "${campaign.id}" binding (${campaign.expectedPacketId} / ${campaign.expectedEvidenceHash}) does not match packet "${packet.packetId}" (${recomputedHash}).`,
    );
  }

  if (envelope) {
    if (envelope.campaignId !== campaign.id) {
      throw new ExportBindingError(
        'REVIEW_CAMPAIGN_MISMATCH',
        `Cannot export: review envelope belongs to "${envelope.campaignId}", not active campaign "${campaign.id}".`,
      );
    }
    const binding = verifyEnvelopeMatchesCampaign(envelope, campaign, recomputedHash);
    if (!binding.ok) {
      throw new ExportBindingError(
        'REVIEW_HASH_MISMATCH',
        binding.reason ?? 'Review envelope failed campaign/packet SHA-256 verification.',
      );
    }
  }

  const deterministicChecks = computeDeterministicSummary(packet);

  const requestedModel =
    envelope?.requestedModel ??
    errorState?.requestedModel ??
    modelStatus?.requestedModel ??
    REQUIRED_MODEL_ID;

  const isRecorded = Boolean(envelope?.isRecorded);
  const returnedModelVersion = envelope?.returnedModelVersion ?? null;
  const modelIdentityStatus: ModelIdentityStatus =
    envelope?.modelIdentityStatus ?? 'not_invoked';

  // Live runtimeAccessProven is true ONLY for an in-session verified Carbon call, never for static recorded replay or offline exports.
  const runtimeAccessProven = isRecorded ? false : Boolean(envelope?.runtimeAccessProven);
  const originalRecordedRuntimeAccessProven = isRecorded
    ? Boolean(envelope?.originalRecordedRuntimeAccessProven)
    : runtimeAccessProven;

  const executionMode: ExportExecutionMode = isRecorded
    ? 'static_recorded_replay'
    : envelope
      ? 'live_server'
      : 'offline_no_review';

  const statusNote =
    envelope?.statusNote ??
    errorState?.statusNote ??
    modelStatus?.statusNote ??
    'No live gemini-4-carbon runtime review executed prior to export.';

  const modelValidated =
    envelope !== null &&
    envelope.responseStatus === 'validated' &&
    envelope.validation.valid &&
    envelope.modelIdentityStatus !== 'non_carbon_mismatch' &&
    envelope.review !== null;

  return {
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    application: 'GammaFold',
    executionMode,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    prototypeDisclosure:
      'GammaFold — isolated hackathon software demonstration; not a production DeltaFold feature and not a biological design or laboratory execution tool.',
    deltaFoldRelationship:
      'DeltaFold is Adam Kaluza\'s preexisting protein research workbench. GammaFold is a separate, newly integrated hackathon prototype that shares no runtime state, user accounts, or source imports with production DeltaFold.',
    syntheticDataDisclosure:
      '100% synthetic teaching dataset (Round R01, C01–C06, units RFU). Contains no real protein sequences, no atomic coordinates, no wet-lab measurements, no clinical claims, and no validated efficacy or cost-savings claims.',
    validationDisclosure:
      'Structured record/field/status/qualifier/value/unit assertions are checked deterministically against frozen packet SYNTH-PKT-R01, and narrative prose is screened for uncited IDs, precision, integer/slot conflicts, and uncalibrated statistical claims. Narrative text remains model interpretation and requires human review.',
    provenanceSummary: {
      basePrototypesAuthoringModel: 'gemini-4-hydrogen',
      finalIntegrationAuthoringModel: 'gemini-4-carbon',
      finalIntegrationHarness: 'Antigravity',
      runtimePolicy:
        'Local loopback gemini-4-carbon only in live mode; credential-free recorded replay in static mode; silent fallback disabled',
    },
    campaign: {
      campaignId: campaign.id,
      title: campaign.title,
      stage: campaign.stageLabel,
      reviewerNotes: reviewerNotes.slice(0, 1000),
    },
    sourceIntegrity: {
      packetId: packet.packetId,
      evidenceHash: FROZEN_R01_EVIDENCE_HASH,
      recomputedEvidenceHash: recomputedHash,
      immutableVerified: recomputedHash === FROZEN_R01_EVIDENCE_HASH,
    },
    sourcePacket: packet,
    deterministicChecks,
    modelMetadata: {
      requestedModel,
      returnedModelVersion,
      returnedModelVersionReported: Boolean(returnedModelVersion),
      modelIdentityStatus,
      runtimeAccessProven,
      originalRecordedRuntimeAccessProven,
      statusNote,
      timestamp: envelope?.originalRuntimeTimestamp ?? envelope?.timestamp ?? errorState?.timestamp ?? null,
      originalRuntimeTimestamp: envelope?.originalRuntimeTimestamp ?? envelope?.timestamp ?? null,
      recordedSourceExportedAt: isRecorded ? (envelope?.recordedSourceExportedAt ?? null) : null,
      responseStatus: status,
      isRecorded,
    },
    validation: envelope?.validation ?? null,
    modelOutput: modelValidated ? envelope!.review : null,
    errorState: errorState
      ? {
          errorCode: errorState.errorCode,
          httpStatus: errorState.httpStatus,
          message: errorState.message,
        }
      : null,
  };
}
