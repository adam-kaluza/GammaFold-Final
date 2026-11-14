import { DEFAULT_CAMPAIGN_ID, getCampaignById } from './campaigns.ts';
import { FROZEN_R01_EVIDENCE_HASH } from './packet.ts';
import type {
  ModelErrorResponse,
  ModelReviewEnvelope,
  ReviewResponseStatus,
  SyntheticCampaign,
  SyntheticCampaignId,
} from './types.ts';

export interface CampaignReviewSlotState {
  readonly status: ReviewResponseStatus;
  readonly envelope: ModelReviewEnvelope | null;
  readonly errorState: ModelErrorResponse | null;
}

export interface InFlightReviewToken {
  readonly requestId: number;
  readonly sessionEpoch: number;
  readonly campaignId: SyntheticCampaignId;
  readonly expectedPacketId: string;
  readonly expectedEvidenceHash: string;
}

export interface CampaignSessionState {
  readonly selectedCampaignId: SyntheticCampaignId;
  readonly sessionEpoch: number;
  readonly nextRequestId: number;
  readonly activeRequest: InFlightReviewToken | null;
  readonly byCampaign: Readonly<Record<SyntheticCampaignId, CampaignReviewSlotState>>;
}

const EMPTY_SLOT: CampaignReviewSlotState = Object.freeze({
  status: 'idle',
  envelope: null,
  errorState: null,
});

// Process-wide monotonic watermarks ensure request IDs and session epochs never repeat,
// even if callers invoke resetCampaignSession() or createInitialCampaignSession() without prior state.
let monotonicRequestWatermark = 0;
let monotonicEpochWatermark = 0;

function allocateNextEpoch(minPreviousEpoch = 0): number {
  const nextEpoch = Math.max(minPreviousEpoch + 1, monotonicEpochWatermark + 1);
  monotonicEpochWatermark = nextEpoch;
  return nextEpoch;
}

export function createInitialCampaignSession(
  initialCampaignId: SyntheticCampaignId = DEFAULT_CAMPAIGN_ID,
): CampaignSessionState {
  const sessionEpoch = allocateNextEpoch(0);
  const nextRequestId = monotonicRequestWatermark + 1;
  return {
    selectedCampaignId: initialCampaignId,
    sessionEpoch,
    nextRequestId,
    activeRequest: null,
    byCampaign: {
      'CAMP-SYNTH-R01': EMPTY_SLOT,
      'CAMP-SYNTH-R02-GATE': EMPTY_SLOT,
    },
  };
}

export function getActiveCampaignSlot(state: CampaignSessionState): CampaignReviewSlotState {
  const campaign = getCampaignById(state.selectedCampaignId);
  if (!campaign || !campaign.reviewEligible) {
    return EMPTY_SLOT;
  }
  const slot = state.byCampaign[state.selectedCampaignId] ?? EMPTY_SLOT;
  if (
    slot.envelope &&
    (slot.envelope.campaignId !== campaign.id ||
      slot.envelope.packetId !== campaign.expectedPacketId ||
      slot.envelope.evidenceHash !== campaign.expectedEvidenceHash ||
      slot.envelope.evidenceHash !== FROZEN_R01_EVIDENCE_HASH)
  ) {
    return EMPTY_SLOT;
  }
  return slot;
}

export function verifyEnvelopeMatchesCampaign(
  envelope: ModelReviewEnvelope,
  campaign: SyntheticCampaign,
  expectedHash: string = FROZEN_R01_EVIDENCE_HASH,
): { ok: boolean; reason?: string } {
  if (!campaign.reviewEligible || !campaign.expectedPacketId || !campaign.expectedEvidenceHash) {
    return {
      ok: false,
      reason: `Campaign "${campaign.id}" is non-reviewable and cannot hold or export a model review.`,
    };
  }
  if (envelope.campaignId !== campaign.id) {
    return {
      ok: false,
      reason: `Review campaignId "${envelope.campaignId}" does not match active campaign "${campaign.id}".`,
    };
  }
  if (envelope.packetId !== campaign.expectedPacketId) {
    return {
      ok: false,
      reason: `Review packetId "${envelope.packetId}" does not match expected packet "${campaign.expectedPacketId}".`,
    };
  }
  if (
    envelope.evidenceHash !== expectedHash ||
    envelope.evidenceHash !== campaign.expectedEvidenceHash
  ) {
    return {
      ok: false,
      reason: `Review evidenceHash "${envelope.evidenceHash}" does not match frozen packet hash "${expectedHash}".`,
    };
  }
  if (!envelope.sourceImmutableVerified) {
    return {
      ok: false,
      reason: 'Review envelope indicates source packet immutability check failed.',
    };
  }
  return { ok: true };
}

export function selectCampaignInSession(
  state: CampaignSessionState,
  nextCampaignId: SyntheticCampaignId,
): { state: CampaignSessionState; abortedRequest: InFlightReviewToken | null } {
  if (state.selectedCampaignId === nextCampaignId) {
    return { state, abortedRequest: null };
  }

  // If switching away while a request is in flight, cancel the active request cleanly,
  // advance the session epoch, and restore the originating campaign slot from 'loading' back to 'idle'.
  const abortedRequest = state.activeRequest;
  const nextByCampaign = { ...state.byCampaign };

  if (abortedRequest) {
    const prevSlot = nextByCampaign[abortedRequest.campaignId];
    if (prevSlot.status === 'loading') {
      nextByCampaign[abortedRequest.campaignId] = EMPTY_SLOT;
    }
  }

  // Non-eligible gate campaigns never retain review envelopes.
  const targetCampaign = getCampaignById(nextCampaignId);
  if (!targetCampaign?.reviewEligible) {
    nextByCampaign[nextCampaignId] = EMPTY_SLOT;
  }

  const nextEpoch = abortedRequest ? allocateNextEpoch(state.sessionEpoch) : state.sessionEpoch;
  const minNextRequestId = Math.max(
    state.nextRequestId,
    abortedRequest ? abortedRequest.requestId + 1 : 1,
    monotonicRequestWatermark + 1,
  );
  monotonicRequestWatermark = Math.max(monotonicRequestWatermark, minNextRequestId - 1);

  return {
    abortedRequest,
    state: {
      ...state,
      selectedCampaignId: nextCampaignId,
      sessionEpoch: nextEpoch,
      nextRequestId: minNextRequestId,
      activeRequest: null,
      byCampaign: nextByCampaign,
    },
  };
}

export function beginCampaignRequest(
  state: CampaignSessionState,
  campaign: SyntheticCampaign,
  evidenceHash: string,
): { state: CampaignSessionState; token: InFlightReviewToken | null } {
  if (state.activeRequest !== null) {
    return { state, token: null };
  }
  if (
    !campaign.reviewEligible ||
    !campaign.expectedPacketId ||
    !campaign.expectedEvidenceHash ||
    campaign.expectedEvidenceHash !== evidenceHash
  ) {
    return { state, token: null };
  }

  const requestId = Math.max(state.nextRequestId, monotonicRequestWatermark + 1);
  monotonicRequestWatermark = requestId;

  const token: InFlightReviewToken = Object.freeze({
    requestId,
    sessionEpoch: state.sessionEpoch,
    campaignId: campaign.id,
    expectedPacketId: campaign.expectedPacketId,
    expectedEvidenceHash: evidenceHash,
  });

  return {
    token,
    state: {
      ...state,
      nextRequestId: requestId + 1,
      activeRequest: token,
      byCampaign: {
        ...state.byCampaign,
        [campaign.id]: {
          status: 'loading',
          envelope: null,
          errorState: null,
        },
      },
    },
  };
}

function matchesActiveRequest(
  state: CampaignSessionState,
  requestOrToken: number | InFlightReviewToken,
): boolean {
  const active = state.activeRequest;
  if (!active) return false;
  if (active.sessionEpoch !== state.sessionEpoch) return false;
  if (typeof requestOrToken === 'number') {
    return active.requestId === requestOrToken;
  }
  return (
    active.requestId === requestOrToken.requestId &&
    active.sessionEpoch === requestOrToken.sessionEpoch &&
    active.campaignId === requestOrToken.campaignId &&
    active.expectedPacketId === requestOrToken.expectedPacketId &&
    active.expectedEvidenceHash === requestOrToken.expectedEvidenceHash
  );
}

export function settleCampaignEnvelope(
  state: CampaignSessionState,
  requestOrToken: number | InFlightReviewToken,
  envelope: ModelReviewEnvelope,
  statusOverride?: 'validated' | 'validation_failed' | 'recorded',
): { state: CampaignSessionState; applied: boolean; reason?: string } {
  if (!matchesActiveRequest(state, requestOrToken) || !state.activeRequest) {
    return {
      state,
      applied: false,
      reason: 'Stale or superseded request completion discarded.',
    };
  }

  const activeToken = state.activeRequest;
  if (state.selectedCampaignId !== activeToken.campaignId) {
    return {
      state: { ...state, activeRequest: null },
      applied: false,
      reason: 'Active campaign changed before request settled; stale completion discarded.',
    };
  }

  const campaign = getCampaignById(activeToken.campaignId);
  if (!campaign) {
    return {
      state: { ...state, activeRequest: null },
      applied: false,
      reason: 'Unknown campaign on settlement.',
    };
  }

  const binding = verifyEnvelopeMatchesCampaign(
    envelope,
    campaign,
    activeToken.expectedEvidenceHash,
  );
  if (!binding.ok) {
    const bindingErr: ModelErrorResponse = {
      errorCode: 'SOURCE_INTEGRITY_ERROR',
      message:
        binding.reason ??
        'Returned review envelope failed campaign or packet SHA-256 binding verification.',
      requestedModel: envelope.requestedModel,
      returnedModelVersion: null,
      runtimeAccessProven: false,
      statusNote: 'Quarantined mismatched campaign/hash response.',
      timestamp: new Date().toISOString(),
      httpStatus: 502,
      evidenceHash: activeToken.expectedEvidenceHash,
    };

    return {
      applied: false,
      reason: binding.reason,
      state: {
        ...state,
        activeRequest: null,
        byCampaign: {
          ...state.byCampaign,
          [activeToken.campaignId]: {
            status: 'error',
            envelope: null,
            errorState: bindingErr,
          },
        },
      },
    };
  }

  const nextStatus: ReviewResponseStatus =
    statusOverride ??
    (envelope.isRecorded && envelope.responseStatus === 'validated'
      ? 'recorded'
      : envelope.responseStatus);

  return {
    applied: true,
    state: {
      ...state,
      activeRequest: null,
      byCampaign: {
        ...state.byCampaign,
        [activeToken.campaignId]: {
          status: nextStatus,
          envelope,
          errorState: null,
        },
      },
    },
  };
}

export function settleCampaignError(
  state: CampaignSessionState,
  requestOrToken: number | InFlightReviewToken,
  errorState: ModelErrorResponse,
): { state: CampaignSessionState; applied: boolean } {
  if (!matchesActiveRequest(state, requestOrToken) || !state.activeRequest) {
    return { state, applied: false };
  }

  const activeToken = state.activeRequest;
  if (state.selectedCampaignId !== activeToken.campaignId) {
    return {
      state: { ...state, activeRequest: null },
      applied: false,
    };
  }

  return {
    applied: true,
    state: {
      ...state,
      activeRequest: null,
      byCampaign: {
        ...state.byCampaign,
        [activeToken.campaignId]: {
          status: 'error',
          envelope: null,
          errorState,
        },
      },
    },
  };
}

export function resetCampaignSession(
  previousState?: CampaignSessionState,
  initialCampaignId: SyntheticCampaignId = DEFAULT_CAMPAIGN_ID,
): CampaignSessionState {
  const nextEpoch = allocateNextEpoch(previousState?.sessionEpoch ?? 0);
  const nextRequestId = Math.max(
    previousState ? previousState.nextRequestId : 1,
    previousState?.activeRequest ? previousState.activeRequest.requestId + 1 : 1,
    monotonicRequestWatermark + 1,
  );
  monotonicRequestWatermark = Math.max(monotonicRequestWatermark, nextRequestId - 1);

  return {
    selectedCampaignId: initialCampaignId,
    sessionEpoch: nextEpoch,
    nextRequestId,
    activeRequest: null,
    byCampaign: {
      'CAMP-SYNTH-R01': EMPTY_SLOT,
      'CAMP-SYNTH-R02-GATE': EMPTY_SLOT,
    },
  };
}
