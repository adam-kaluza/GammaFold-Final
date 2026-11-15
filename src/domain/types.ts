export const EXPORT_SCHEMA_VERSION = '3.0.0' as const;
export const ENVELOPE_SCHEMA_VERSION = '3.0.0' as const;

export type ObservationStatus = 'measured' | 'failed' | 'missing' | 'censored';

export type EpistemicClass =
  | 'synthetic_measurement'
  | 'prior_prediction'
  | 'reference_annotation'
  | 'model_interpretation'
  | 'proposed_action';

export type SyntheticCampaignId = 'CAMP-SYNTH-R01' | 'CAMP-SYNTH-R02-GATE';

export interface CandidateRecord {
  readonly id: string;
  readonly label: string;
  readonly sampleId: string;
  readonly observationId: string;
  readonly predictionId: string;
  readonly constructClass: string;
}

export interface ObservationRecord {
  readonly id: string;
  readonly candidateId: string;
  readonly sampleId: string;
  readonly value: number | null;
  readonly qualifier: '=' | '<' | null;
  readonly upperBound: number | null;
  readonly units: string;
  readonly status: ObservationStatus;
  readonly reason: string | null;
  readonly note?: string;
}

export interface PredictionRecord {
  readonly id: string;
  readonly candidateId: string;
  readonly value: number;
  readonly units: string;
  readonly isSynthetic: true;
  readonly isPriorPrediction: true;
  readonly context: string;
}

export interface EvidencePacket {
  readonly packetId: string;
  readonly roundId: string;
  readonly title: string;
  readonly assayName: string;
  readonly units: string;
  readonly synthetic: true;
  readonly frozenBeforeOutcomes: true;
  readonly replicates: number;
  readonly nextRoundBudgetSlots: number;
  readonly claimToCheck: string;
  readonly candidates: readonly CandidateRecord[];
  readonly observations: readonly ObservationRecord[];
  readonly predictions: readonly PredictionRecord[];
}

export interface SyntheticCampaign {
  readonly id: SyntheticCampaignId;
  readonly title: string;
  readonly packetId: string;
  readonly expectedPacketId: string | null;
  readonly expectedEvidenceHash: string | null;
  readonly roundId: string;
  readonly stage: 'evidence_ready' | 'human_gate_blocked';
  readonly stageLabel: string;
  readonly reviewEligible: boolean;
  readonly candidateCount: number;
  readonly budgetSlots: number;
  readonly referenceAnnotation: string;
  readonly summary: string;
  readonly gateNote: string;
}

export interface CandidateComparison {
  readonly candidateId: string;
  readonly sampleId: string;
  readonly observationId: string;
  readonly predictionId: string;
  readonly status: ObservationStatus;
  readonly observedDisplay: string;
  readonly observedNumeric: number | null;
  readonly upperBound: number | null;
  readonly predictionValue: number;
  readonly delta: number | null;
  readonly comparable: boolean;
  readonly reason: string | null;
}

export interface DeterministicSummary {
  readonly totalCandidates: number;
  readonly measured: number;
  readonly failed: number;
  readonly missing: number;
  readonly censored: number;
  readonly nonMeasured: number;
  readonly validZeroCount: number;
  readonly replicates: number;
  readonly statisticalSignificanceSupported: false;
  readonly statisticalNote: string;
  readonly budgetSlots: number;
  readonly comparisons: readonly CandidateComparison[];
}

export type FactAssertionField = 'value' | 'upperBound';

export type FactAssertionStatus =
  | 'measured'
  | 'failed'
  | 'missing'
  | 'censored'
  | 'prior_prediction';

export type FactAssertionQualifier = '=' | '<' | 'none' | null;

export interface FactAssertion {
  recordId: string;
  field: FactAssertionField;
  status: FactAssertionStatus;
  qualifier: FactAssertionQualifier;
  value: number | null;
  units: string;
}

export interface EvidenceFinding {
  assertions: FactAssertion[];
  claim: string;
  sourceIds: string[];
}

export interface ReviewLimitation {
  note: string;
  sourceIds: string[];
}

export interface ProposedAction {
  candidateId: string;
  purpose: string;
  assaySlots: number;
  sourceIds: string[];
}

export interface UnsupportedClaimAudit {
  auditId: string;
  claimToCheck: string;
  verdict: 'unsupported' | 'contradicted';
  assertions: FactAssertion[];
  correction: string;
  sourceIds: string[];
}

export interface ReviewOutput {
  summary: string;
  evidenceFindings: EvidenceFinding[];
  limitations: ReviewLimitation[];
  proposedActions: ProposedAction[];
  unsupportedClaimAudit: UnsupportedClaimAudit;
}

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  valid: boolean;
  status: 'validated' | 'validation_failed';
  issues: ValidationIssue[];
  budgetUsed: number;
  budgetLimit: number;
  checks: {
    schemaValid: boolean;
    structuredAssertionsValid: boolean;
    allIdsValid: boolean;
    budgetValid: boolean;
    narrativeScreeningValid: boolean;
    auditRefutedValid: boolean;
    statisticalClaimGuardValid: boolean;
    modelIdentityValid: boolean;
  };
}

export type ReviewResponseStatus =
  | 'idle'
  | 'loading'
  | 'validated'
  | 'validation_failed'
  | 'error'
  | 'recorded';

export type ModelIdentityStatus =
  | 'verified_carbon'
  | 'unreported'
  | 'non_carbon_mismatch'
  | 'not_invoked';

export interface ModelStatusSnapshot {
  hasApiKey: boolean;
  liveModeEnabled: boolean;
  listenHostPolicy: 'loopback_only';
  sessionRequestsUsed: number;
  sessionMaxRequests: number;
  cooldownMs: number;
  cooldownRemainingMs: number;
  requestedModel: string;
  configuredEnvModel: string;
  modelPolicyValid: boolean;
  fallbackDisabled: true;
  runtimeAccessProven: boolean;
  lastReturnedModelVersion: string | null;
  lastRuntimeCheckAt: string | null;
  statusNote: string;
  evidenceHash: string;
  checkedAt: string;
}

export interface ModelReviewEnvelope {
  envelopeSchemaVersion: typeof ENVELOPE_SCHEMA_VERSION;
  campaignId: SyntheticCampaignId;
  packetId: string;
  requestedModel: string;
  returnedModelVersion: string | null;
  returnedModelVersionReported: boolean;
  modelIdentityStatus: ModelIdentityStatus;
  runtimeAccessProven: boolean;
  originalRecordedRuntimeAccessProven?: boolean;
  statusNote: string;
  timestamp: string;
  originalRuntimeTimestamp: string;
  recordedSourceExportedAt: string | null;
  responseStatus: 'validated' | 'validation_failed';
  httpStatus: number;
  evidenceHash: string;
  sourceImmutableVerified: boolean;
  validation: ValidationResult;
  review: ReviewOutput | null;
  rawResponseText: string;
  isRecorded: boolean;
  isSimulatedTestFixture?: boolean;
}

export type ModelErrorCode =
  | 'MISSING_API_KEY'
  | 'LIVE_MODE_DISABLED'
  | 'UNSAFE_HOST_BINDING'
  | 'FORBIDDEN_ORIGIN'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INVALID_SERVER_MODEL_CONFIG'
  | 'MODEL_POLICY_VIOLATION'
  | 'PERMISSION_DENIED'
  | 'MODEL_UNAVAILABLE'
  | 'QUOTA_EXCEEDED'
  | 'COOLDOWN_ACTIVE'
  | 'SESSION_BUDGET_EXHAUSTED'
  | 'TIMEOUT'
  | 'MALFORMED_RESPONSE'
  | 'REQUEST_IN_FLIGHT'
  | 'BAD_REQUEST'
  | 'SOURCE_INTEGRITY_ERROR'
  | 'RECORDED_REVIEW_UNAVAILABLE'
  | 'RECORDED_REVIEW_INVALID'
  | 'INTERNAL_ERROR';

export interface ModelErrorResponse {
  errorCode: ModelErrorCode;
  message: string;
  requestedModel: string;
  returnedModelVersion: null;
  runtimeAccessProven: false;
  statusNote: string;
  timestamp: string;
  httpStatus: number;
  evidenceHash: string;
  rawResponseText?: string;
}

export type ExportExecutionMode =
  | 'live_server'
  | 'static_recorded_replay'
  | 'offline_no_review';

export interface ExportReviewPacket {
  exportSchemaVersion: typeof EXPORT_SCHEMA_VERSION;
  application: 'GammaFold';
  executionMode: ExportExecutionMode;
  exportedAt: string;
  prototypeDisclosure: string;
  deltaFoldRelationship: string;
  syntheticDataDisclosure: string;
  validationDisclosure: string;
  provenanceSummary: {
    basePrototypesAuthoringModel: 'gemini-4-hydrogen';
    finalIntegrationAuthoringModel: 'gemini-4-carbon';
    finalIntegrationHarness: 'Antigravity';
    runtimePolicy: 'Local loopback gemini-4-carbon only in live mode; credential-free recorded replay in static mode; silent fallback disabled';
  };
  campaign: {
    campaignId: SyntheticCampaignId;
    title: string;
    stage: string;
    reviewerNotes: string;
  };
  sourceIntegrity: {
    packetId: string;
    evidenceHash: string;
    recomputedEvidenceHash: string;
    immutableVerified: boolean;
  };
  sourcePacket: EvidencePacket;
  deterministicChecks: DeterministicSummary;
  modelMetadata: {
    requestedModel: string;
    returnedModelVersion: string | null;
    returnedModelVersionReported: boolean;
    modelIdentityStatus: ModelIdentityStatus;
    runtimeAccessProven: boolean;
    originalRecordedRuntimeAccessProven: boolean;
    statusNote: string;
    timestamp: string | null;
    originalRuntimeTimestamp: string | null;
    recordedSourceExportedAt: string | null;
    responseStatus: ReviewResponseStatus;
    isRecorded: boolean;
  };
  validation: ValidationResult | null;
  modelOutput: ReviewOutput | null;
  errorState: {
    errorCode: string;
    httpStatus: number;
    message: string;
  } | null;
}
