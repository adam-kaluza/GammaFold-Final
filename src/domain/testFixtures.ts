// [TEST FIXTURE ONLY — SIMULATED DATA FOR AUTOMATED TESTS; NEVER ACTUAL GEMINI-4-CARBON INFERENCE]
import { REQUIRED_AUDIT_CLAIM_ID, SYNTHETIC_EVIDENCE_PACKET } from './packet.ts';
import type { ReviewOutput } from './types.ts';

export function createValidTestReviewFixture(): ReviewOutput {
  return {
    summary:
      'Synthetic Round R01 produced 3 measured observations (O01 = 0.72 RFU, O02 = 0.00 RFU, O06 = 0.65 RFU), 1 failed QC (O03), 1 missing sample (O04), and 1 left-censored result (O05 < 0.10 RFU). Because replicates = 1, no p-value or confidence interval is supported.',
    evidenceFindings: [
      {
        assertions: [
          {
            recordId: 'O01',
            field: 'value',
            status: 'measured',
            qualifier: '=',
            value: 0.72,
            units: 'RFU',
          },
          {
            recordId: 'P01',
            field: 'value',
            status: 'prior_prediction',
            qualifier: '=',
            value: 0.68,
            units: 'RFU',
          },
        ],
        claim:
          'O01 (C01/S01) measured 0.72 RFU compared with prior synthetic prediction P01 of 0.68 RFU (+0.04 RFU delta).',
        sourceIds: ['O01', 'P01', 'C01', 'S01'],
      },
      {
        assertions: [
          {
            recordId: 'O02',
            field: 'value',
            status: 'measured',
            qualifier: '=',
            value: 0,
            units: 'RFU',
          },
          {
            recordId: 'P02',
            field: 'value',
            status: 'prior_prediction',
            qualifier: '=',
            value: 0.8,
            units: 'RFU',
          },
        ],
        claim:
          'O02 (C02/S02) measured a valid zero of 0.00 RFU, diverging by -0.80 RFU from prior synthetic prediction P02 (0.80 RFU).',
        sourceIds: ['O02', 'P02', 'C02', 'S02'],
      },
      {
        assertions: [
          {
            recordId: 'O03',
            field: 'value',
            status: 'failed',
            qualifier: 'none',
            value: null,
            units: 'RFU',
          },
          {
            recordId: 'P03',
            field: 'value',
            status: 'prior_prediction',
            qualifier: '=',
            value: 0.91,
            units: 'RFU',
          },
        ],
        claim:
          'O03 (C03/S03) failed due to instrument QC failure (null value); prior synthetic prediction P03 (0.91 RFU) is not a measurement.',
        sourceIds: ['O03', 'P03', 'C03', 'S03'],
      },
      {
        assertions: [
          {
            recordId: 'O04',
            field: 'value',
            status: 'missing',
            qualifier: 'none',
            value: null,
            units: 'RFU',
          },
          {
            recordId: 'O05',
            field: 'upperBound',
            status: 'censored',
            qualifier: '<',
            value: 0.1,
            units: 'RFU',
          },
        ],
        claim:
          'O04 (C04/S04) is missing (not received, null) and O05 (C05/S05) is left-censored below < 0.10 RFU with no point value.',
        sourceIds: ['O04', 'O05', 'C04', 'S04', 'C05', 'S05'],
      },
      {
        assertions: [
          {
            recordId: 'O06',
            field: 'value',
            status: 'measured',
            qualifier: '=',
            value: 0.65,
            units: 'RFU',
          },
          {
            recordId: 'P06',
            field: 'value',
            status: 'prior_prediction',
            qualifier: '=',
            value: 0.6,
            units: 'RFU',
          },
        ],
        claim:
          'O06 (C06/S06) measured 0.65 RFU compared with prior synthetic prediction P06 of 0.60 RFU (+0.05 RFU delta).',
        sourceIds: ['O06', 'P06', 'C06', 'S06'],
      },
    ],
    limitations: [
      {
        note:
          'Single synthetic pass (replicates = 1): p-values, confidence intervals, and statistical significance are unsupported.',
        sourceIds: ['R01'],
      },
      {
        note:
          'Non-measured outcomes (O03 failed, O04 missing, O05 censored < 0.10 RFU) cannot be coerced to 0.00 RFU or exact point values.',
        sourceIds: ['O03', 'O04', 'O05', 'O02'],
      },
    ],
    proposedActions: [
      {
        candidateId: 'C03',
        purpose:
          'Propose 2 follow-up slots after instrument QC remediation to obtain a first valid observation for C03 after O03 failed (prior P03 = 0.91 RFU); human review required.',
        assaySlots: 2,
        sourceIds: ['C03', 'O03', 'P03'],
      },
      {
        candidateId: 'C04',
        purpose:
          'Locate unreceived sample S04 (missing O04) and allocate 1 follow-up slot for C04 pending human sign-off.',
        assaySlots: 1,
        sourceIds: ['C04', 'S04', 'O04'],
      },
      {
        candidateId: 'C02',
        purpose:
          'Allocate 1 verification slot to confirm valid zero O02 (0.00 RFU) versus prior P02 (0.80 RFU) for C02 under human review.',
        assaySlots: 1,
        sourceIds: ['C02', 'O02', 'P02'],
      },
    ],
    unsupportedClaimAudit: {
      auditId: REQUIRED_AUDIT_CLAIM_ID,
      claimToCheck: SYNTHETIC_EVIDENCE_PACKET.claimToCheck,
      verdict: 'contradicted',
      assertions: [
        {
          recordId: 'O03',
          field: 'value',
          status: 'failed',
          qualifier: 'none',
          value: null,
          units: 'RFU',
        },
        {
          recordId: 'P03',
          field: 'value',
          status: 'prior_prediction',
          qualifier: '=',
          value: 0.91,
          units: 'RFU',
        },
        {
          recordId: 'O04',
          field: 'value',
          status: 'missing',
          qualifier: 'none',
          value: null,
          units: 'RFU',
        },
        {
          recordId: 'O05',
          field: 'upperBound',
          status: 'censored',
          qualifier: '<',
          value: 0.1,
          units: 'RFU',
        },
      ],
      correction:
        'False: 0.91 RFU is the pre-outcome synthetic prediction P03, not a measured score. O03 failed instrument QC (null), O04 was missing (not received, null), and O05 was censored (< 0.10 RFU), so only 3 of 6 candidates (O01, O02, O06) were measured.',
      sourceIds: ['R01', 'AUDIT-CLAIM-01', 'O03', 'P03', 'O04', 'O05', 'O01', 'O02', 'O06'],
    },
  };
}
