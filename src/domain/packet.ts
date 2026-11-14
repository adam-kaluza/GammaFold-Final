import { canonicalJson, sha256Hex } from './hash.ts';
import type { EvidencePacket } from './types.ts';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

export const SYNTHETIC_EVIDENCE_PACKET: EvidencePacket = deepFreeze({
  packetId: 'SYNTH-PKT-R01',
  roundId: 'R01',
  title: 'Fictional Protein-Solubility Assay Round R01',
  assayName: 'Synthetic Solubility Fluorescence Screen (Teaching Dataset)',
  units: 'RFU',
  synthetic: true,
  frozenBeforeOutcomes: true,
  replicates: 1,
  nextRoundBudgetSlots: 4,
  claimToCheck:
    'C03 achieved a measured score of 0.91 and all six candidates were successfully measured.',
  candidates: [
    {
      id: 'C01',
      label: 'SYN-SOL-01',
      sampleId: 'S01',
      observationId: 'O01',
      predictionId: 'P01',
      constructClass: 'Synthetic variant alpha-1 (fictional)',
    },
    {
      id: 'C02',
      label: 'SYN-SOL-02',
      sampleId: 'S02',
      observationId: 'O02',
      predictionId: 'P02',
      constructClass: 'Synthetic variant alpha-2 (fictional)',
    },
    {
      id: 'C03',
      label: 'SYN-SOL-03',
      sampleId: 'S03',
      observationId: 'O03',
      predictionId: 'P03',
      constructClass: 'Synthetic variant beta-1 (fictional)',
    },
    {
      id: 'C04',
      label: 'SYN-SOL-04',
      sampleId: 'S04',
      observationId: 'O04',
      predictionId: 'P04',
      constructClass: 'Synthetic variant beta-2 (fictional)',
    },
    {
      id: 'C05',
      label: 'SYN-SOL-05',
      sampleId: 'S05',
      observationId: 'O05',
      predictionId: 'P05',
      constructClass: 'Synthetic variant gamma-1 (fictional)',
    },
    {
      id: 'C06',
      label: 'SYN-SOL-06',
      sampleId: 'S06',
      observationId: 'O06',
      predictionId: 'P06',
      constructClass: 'Synthetic variant gamma-2 (fictional)',
    },
  ],
  observations: [
    {
      id: 'O01',
      candidateId: 'C01',
      sampleId: 'S01',
      value: 0.72,
      qualifier: '=',
      upperBound: null,
      units: 'RFU',
      status: 'measured',
      reason: null,
    },
    {
      id: 'O02',
      candidateId: 'C02',
      sampleId: 'S02',
      value: 0.0,
      qualifier: '=',
      upperBound: null,
      units: 'RFU',
      status: 'measured',
      reason: null,
      note: 'Zero (0.00 RFU) is a valid measured value, not missing data.',
    },
    {
      id: 'O03',
      candidateId: 'C03',
      sampleId: 'S03',
      value: null,
      qualifier: null,
      upperBound: null,
      units: 'RFU',
      status: 'failed',
      reason: 'Instrument QC failure',
    },
    {
      id: 'O04',
      candidateId: 'C04',
      sampleId: 'S04',
      value: null,
      qualifier: null,
      upperBound: null,
      units: 'RFU',
      status: 'missing',
      reason: 'Not received',
    },
    {
      id: 'O05',
      candidateId: 'C05',
      sampleId: 'S05',
      value: null,
      qualifier: '<',
      upperBound: 0.1,
      units: 'RFU',
      status: 'censored',
      reason: 'Left-censored below upper bound (< 0.10 RFU); no point value',
    },
    {
      id: 'O06',
      candidateId: 'C06',
      sampleId: 'S06',
      value: 0.65,
      qualifier: '=',
      upperBound: null,
      units: 'RFU',
      status: 'measured',
      reason: null,
    },
  ],
  predictions: [
    {
      id: 'P01',
      candidateId: 'C01',
      value: 0.68,
      units: 'RFU',
      isSynthetic: true,
      isPriorPrediction: true,
      context: 'Synthetic prior pre-outcome score for C01 (frozen before R01; not a measurement)',
    },
    {
      id: 'P02',
      candidateId: 'C02',
      value: 0.8,
      units: 'RFU',
      isSynthetic: true,
      isPriorPrediction: true,
      context: 'Synthetic prior pre-outcome score for C02 (frozen before R01; not a measurement)',
    },
    {
      id: 'P03',
      candidateId: 'C03',
      value: 0.91,
      units: 'RFU',
      isSynthetic: true,
      isPriorPrediction: true,
      context: 'Synthetic prior pre-outcome score for C03 (frozen before R01; not a measurement)',
    },
    {
      id: 'P04',
      candidateId: 'C04',
      value: 0.74,
      units: 'RFU',
      isSynthetic: true,
      isPriorPrediction: true,
      context: 'Synthetic prior pre-outcome score for C04 (frozen before R01; not a measurement)',
    },
    {
      id: 'P05',
      candidateId: 'C05',
      value: 0.25,
      units: 'RFU',
      isSynthetic: true,
      isPriorPrediction: true,
      context: 'Synthetic prior pre-outcome score for C05 (frozen before R01; not a measurement)',
    },
    {
      id: 'P06',
      candidateId: 'C06',
      value: 0.6,
      units: 'RFU',
      isSynthetic: true,
      isPriorPrediction: true,
      context: 'Synthetic prior pre-outcome score for C06 (frozen before R01; not a measurement)',
    },
  ],
});

export const REQUIRED_AUDIT_CLAIM_ID = 'AUDIT-CLAIM-01' as const;

export const FROZEN_R01_EVIDENCE_HASH =
  'cdb881a51245d8065c2b22a14e6c9cc8ee21d2375f8e0c0c0be2ccc7a7494bff';

export function computeEvidenceHash(packet: EvidencePacket = SYNTHETIC_EVIDENCE_PACKET): string {
  return sha256Hex(canonicalJson(packet));
}

export function verifyFrozenPacketIntegrity(packet: EvidencePacket = SYNTHETIC_EVIDENCE_PACKET): boolean {
  return computeEvidenceHash(packet) === FROZEN_R01_EVIDENCE_HASH;
}

export const KNOWN_SOURCE_IDS: ReadonlySet<string> = new Set([
  SYNTHETIC_EVIDENCE_PACKET.roundId,
  REQUIRED_AUDIT_CLAIM_ID,
  ...SYNTHETIC_EVIDENCE_PACKET.candidates.map((c) => c.id),
  ...SYNTHETIC_EVIDENCE_PACKET.candidates.map((c) => c.sampleId),
  ...SYNTHETIC_EVIDENCE_PACKET.observations.map((o) => o.id),
  ...SYNTHETIC_EVIDENCE_PACKET.predictions.map((p) => p.id),
]);

export const CANDIDATE_IDS: ReadonlySet<string> = new Set(
  SYNTHETIC_EVIDENCE_PACKET.candidates.map((c) => c.id),
);
