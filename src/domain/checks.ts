import { REQUIRED_AUDIT_CLAIM_ID } from './packet.ts';
import type {
  CandidateComparison,
  DeterministicSummary,
  EvidencePacket,
  FactAssertion,
  ObservationRecord,
  PredictionRecord,
} from './types.ts';

export function formatObservationValue(obs: ObservationRecord): string {
  if (obs.status === 'measured' && obs.value !== null) {
    return `${obs.value.toFixed(2)} ${obs.units}`;
  }
  if (obs.status === 'censored' && obs.upperBound !== null) {
    return `${obs.qualifier ?? '<'} ${obs.upperBound.toFixed(2)} ${obs.units} (censored)`;
  }
  if (obs.status === 'failed') {
    return `null (failed: ${obs.reason ?? 'unspecified'})`;
  }
  return `null (missing: ${obs.reason ?? 'unspecified'})`;
}

export function renderFactAssertion(assertion: FactAssertion, packet: EvidencePacket): string {
  const obs = packet.observations.find((o) => o.id === assertion.recordId);
  if (obs) {
    if (obs.status === 'measured' && obs.value !== null) {
      const zeroNote = obs.value === 0 ? ' (valid measured zero)' : '';
      return `${obs.id}.${assertion.field} [${obs.status}]: = ${obs.value.toFixed(2)} ${obs.units}${zeroNote}`;
    }
    if (obs.status === 'censored' && obs.upperBound !== null) {
      return `${obs.id}.${assertion.field} [${obs.status}]: < ${obs.upperBound.toFixed(2)} ${obs.units} (upper bound; no point value)`;
    }
    return `${obs.id}.${assertion.field} [${obs.status}]: null (${obs.reason ?? 'unmeasured'})`;
  }

  const pred = packet.predictions.find((p) => p.id === assertion.recordId);
  if (pred) {
    return `${pred.id}.${assertion.field} [prior_prediction]: = ${pred.value.toFixed(2)} ${pred.units} (pre-outcome score; not measured)`;
  }

  return `${assertion.recordId}.${assertion.field} [${assertion.status}]: unverified`;
}

export function computeDeterministicSummary(packet: EvidencePacket): DeterministicSummary {
  let measured = 0;
  let failed = 0;
  let missing = 0;
  let censored = 0;
  let validZeroCount = 0;

  const obsByCandidate = new Map<string, ObservationRecord>();
  for (const obs of packet.observations) {
    obsByCandidate.set(obs.candidateId, obs);
    if (obs.status === 'measured') {
      measured += 1;
      if (obs.value === 0) {
        validZeroCount += 1;
      }
    } else if (obs.status === 'failed') {
      failed += 1;
    } else if (obs.status === 'missing') {
      missing += 1;
    } else if (obs.status === 'censored') {
      censored += 1;
    }
  }

  const predByCandidate = new Map<string, PredictionRecord>();
  for (const pred of packet.predictions) {
    predByCandidate.set(pred.candidateId, pred);
  }

  const comparisons: CandidateComparison[] = packet.candidates.map((candidate) => {
    const obs = obsByCandidate.get(candidate.id);
    const pred = predByCandidate.get(candidate.id);
    if (!obs || !pred) {
      throw new Error(`Incomplete packet record for candidate ${candidate.id}`);
    }

    const comparable = obs.status === 'measured' && obs.value !== null;
    const delta =
      comparable && obs.value !== null
        ? Number((obs.value - pred.value).toFixed(2))
        : null;

    return {
      candidateId: candidate.id,
      sampleId: candidate.sampleId,
      observationId: obs.id,
      predictionId: pred.id,
      status: obs.status,
      observedDisplay: formatObservationValue(obs),
      observedNumeric: obs.status === 'measured' ? obs.value : null,
      upperBound: obs.status === 'censored' ? obs.upperBound : null,
      predictionValue: pred.value,
      delta,
      comparable,
      reason: obs.reason,
    };
  });

  return {
    totalCandidates: packet.candidates.length,
    measured,
    failed,
    missing,
    censored,
    nonMeasured: failed + missing + censored,
    validZeroCount,
    replicates: packet.replicates,
    statisticalSignificanceSupported: false,
    statisticalNote:
      'Single synthetic pass (replicates = 1): p-values, confidence intervals, and statistical significance are unsupported.',
    budgetSlots: packet.nextRoundBudgetSlots,
    comparisons,
  };
}

export interface ReferencedSourceItem {
  id: string;
  kind: 'round' | 'audit' | 'candidate' | 'sample' | 'observation' | 'prediction';
  candidateId: string | null;
  summary: string;
}

export function resolveSourceItems(
  packet: EvidencePacket,
  sourceIds: readonly string[],
): ReferencedSourceItem[] {
  const seen = new Set<string>();
  const items: ReferencedSourceItem[] = [];

  for (const rawId of sourceIds) {
    const id = rawId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    if (id === packet.roundId) {
      items.push({
        id,
        kind: 'round',
        candidateId: null,
        summary: `Frozen round ${packet.roundId} (${packet.candidates.length} candidates, replicates = ${packet.replicates}, ${packet.nextRoundBudgetSlots} next-round slots)`,
      });
      continue;
    }

    if (id === REQUIRED_AUDIT_CLAIM_ID) {
      items.push({
        id,
        kind: 'audit',
        candidateId: 'C03',
        summary: `Supplied false claim under audit: "${packet.claimToCheck}"`,
      });
      continue;
    }

    const obs = packet.observations.find((o) => o.id === id);
    if (obs) {
      items.push({
        id,
        kind: 'observation',
        candidateId: obs.candidateId,
        summary: `${obs.id} (${obs.candidateId}/${obs.sampleId}): ${formatObservationValue(obs)}`,
      });
      continue;
    }

    const pred = packet.predictions.find((p) => p.id === id);
    if (pred) {
      items.push({
        id,
        kind: 'prediction',
        candidateId: pred.candidateId,
        summary: `${pred.id} (${pred.candidateId} prior synthetic prediction): ${pred.value.toFixed(2)} ${pred.units}`,
      });
      continue;
    }

    const cand = packet.candidates.find((c) => c.id === id);
    if (cand) {
      items.push({
        id,
        kind: 'candidate',
        candidateId: cand.id,
        summary: `${cand.id} (${cand.label}, ${cand.sampleId} / ${cand.observationId} / ${cand.predictionId})`,
      });
      continue;
    }

    const sampleCand = packet.candidates.find((c) => c.sampleId === id);
    if (sampleCand) {
      items.push({
        id,
        kind: 'sample',
        candidateId: sampleCand.id,
        summary: `${id} -> ${sampleCand.id} / ${sampleCand.observationId}`,
      });
    }
  }

  return items;
}
