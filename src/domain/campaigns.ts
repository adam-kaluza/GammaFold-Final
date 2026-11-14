import { FROZEN_R01_EVIDENCE_HASH, SYNTHETIC_EVIDENCE_PACKET } from './packet.ts';
import type { SyntheticCampaign, SyntheticCampaignId } from './types.ts';

export const DEFAULT_CAMPAIGN_ID: SyntheticCampaignId = 'CAMP-SYNTH-R01';

export const SYNTHETIC_CAMPAIGNS: readonly SyntheticCampaign[] = Object.freeze([
  Object.freeze({
    id: 'CAMP-SYNTH-R01',
    title: 'Synthetic Solubility Screen — Round R01 (Active Demonstration)',
    packetId: SYNTHETIC_EVIDENCE_PACKET.packetId,
    expectedPacketId: SYNTHETIC_EVIDENCE_PACKET.packetId,
    expectedEvidenceHash: FROZEN_R01_EVIDENCE_HASH,
    roundId: SYNTHETIC_EVIDENCE_PACKET.roundId,
    stage: 'evidence_ready',
    stageLabel: 'Frozen Evidence Logged · Ready for Carbon Review',
    reviewEligible: true,
    candidateCount: SYNTHETIC_EVIDENCE_PACKET.candidates.length,
    budgetSlots: SYNTHETIC_EVIDENCE_PACKET.nextRoundBudgetSlots,
    referenceAnnotation:
      'PDB 1UBQ Schematic Topology (Benign Geometric Illustration Only — Not Candidate Sequence)',
    summary:
      'Immutable 6-candidate synthetic fluorescence solubility screen (C01–C06) containing 3 measured outcomes (O01 = 0.72 RFU, valid zero O02 = 0.00 RFU, O06 = 0.65 RFU), 1 failed QC (O03), 1 missing sample (O04), and 1 left-censored bound (O05 < 0.10 RFU).',
    gateNote:
      'Pre-outcome candidate IDs and prior predictions P01–P06 (RFU) were locked under SHA-256 before synthetic outcomes O01–O06 were recorded.',
  }),
  Object.freeze({
    id: 'CAMP-SYNTH-R02-GATE',
    title: 'Round R02 Follow-Up Allocation Envelope (Human Gate)',
    packetId: 'NONE-R02-GATE',
    expectedPacketId: null,
    expectedEvidenceHash: null,
    roundId: 'R02-PROPOSED',
    stage: 'human_gate_blocked',
    stageLabel: 'Proposal Queue · Held Pending Human Review',
    reviewEligible: false,
    candidateCount: 0,
    budgetSlots: SYNTHETIC_EVIDENCE_PACKET.nextRoundBudgetSlots,
    referenceAnnotation:
      'Linked to CAMP-SYNTH-R01 (<= 4 proposed follow-up slots; no automatic execution)',
    summary:
      'Organizational placeholder demonstrating that model-proposed follow-up slots from Round R01 remain unexecuted proposals until reviewed by a human. Round R01 reviews never carry over or export under R02.',
    gateNote:
      'No observations exist in R02, and R02 cannot inherit or export an R01 review. Select CAMP-SYNTH-R01 to inspect the six synthetic observations and review or export R01.',
  }),
]);

export function getCampaignById(id: string | undefined): SyntheticCampaign | undefined {
  if (!id) return SYNTHETIC_CAMPAIGNS[0];
  return SYNTHETIC_CAMPAIGNS.find((c) => c.id === id);
}
