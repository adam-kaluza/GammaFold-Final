// [TEST SUITE — DETERMINISTIC DOMAIN, CAMPAIGN SESSION, RECORDED REPLAY & VALIDATION TESTS]
// No live gemini-4-carbon provider calls are executed in this file.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { clearPersistedLocalState, loadPersistedLocalState, savePersistedLocalState, LOCAL_STORAGE_KEY, LEGACY_LOCAL_STORAGE_KEY } from './localState.ts';
import {
  beginCampaignRequest,
  createInitialCampaignSession,
  getActiveCampaignSlot,
  resetCampaignSession,
  selectCampaignInSession,
  settleCampaignEnvelope,
  settleCampaignError,
} from './campaignSession.ts';
import { getCampaignById, SYNTHETIC_CAMPAIGNS } from './campaigns.ts';
import {
  computeDeterministicSummary,
  formatObservationValue,
  renderFactAssertion,
  resolveSourceItems,
} from './checks.ts';
import { buildExportReviewPacket, ExportBindingError } from './exportPacket.ts';
import { verifyReturnedModelIdentity } from './modelIdentity.ts';
import {
  computeEvidenceHash,
  FROZEN_R01_EVIDENCE_HASH,
  REQUIRED_AUDIT_CLAIM_ID,
  SYNTHETIC_EVIDENCE_PACKET,
  verifyFrozenPacketIntegrity,
} from './packet.ts';
import {
  loadRecordedReviewFromUrl,
  RECORDED_REVIEW_RELATIVE_URL,
  verifyAndImportRecordedReview,
} from './recordedReview.ts';
import {
  BENIGN_REFERENCE_METADATA,
  projectTopologyNodes,
  SCHEMATIC_1UBQ_NODES,
} from './reference1ubq.ts';
import { createValidTestReviewFixture } from './testFixtures.ts';
import {
  ENVELOPE_SCHEMA_VERSION,
  EXPORT_SCHEMA_VERSION,
  type EvidencePacket,
  type ExportReviewPacket,
  type ModelReviewEnvelope,
} from './types.ts';
import { applyModelIdentityQuarantine, validateReviewOutput } from './validation.ts';

test('frozen synthetic packet is deeply immutable and matches pinned SHA-256 hash', () => {
  assert.equal(Object.isFrozen(SYNTHETIC_EVIDENCE_PACKET), true);
  assert.equal(Object.isFrozen(SYNTHETIC_EVIDENCE_PACKET.observations), true);
  assert.equal(Object.isFrozen(SYNTHETIC_EVIDENCE_PACKET.observations[0]), true);

  assert.throws(() => {
    (SYNTHETIC_EVIDENCE_PACKET.observations[0] as { value: number | null }).value = 0.99;
  }, TypeError);

  const hashA = computeEvidenceHash(SYNTHETIC_EVIDENCE_PACKET);
  const hashB = computeEvidenceHash(SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(hashA, hashB);
  assert.equal(
    hashA,
    'cdb881a51245d8065c2b22a14e6c9cc8ee21d2375f8e0c0c0be2ccc7a7494bff',
  );
  assert.equal(hashA, FROZEN_R01_EVIDENCE_HASH);
  assert.equal(verifyFrozenPacketIntegrity(), true);
});

test('deterministic checks and renderFactAssertion preserve measured, valid zero, failed, missing, censored, and prediction semantics', () => {
  const summary = computeDeterministicSummary(SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(summary.totalCandidates, 6);
  assert.equal(summary.measured, 3);
  assert.equal(summary.failed, 1);
  assert.equal(summary.missing, 1);
  assert.equal(summary.censored, 1);
  assert.equal(summary.nonMeasured, 3);
  assert.equal(summary.validZeroCount, 1);
  assert.equal(summary.replicates, 1);
  assert.equal(summary.statisticalSignificanceSupported, false);
  assert.equal(summary.budgetSlots, 4);

  const c02 = summary.comparisons.find((c) => c.candidateId === 'C02')!;
  assert.equal(c02.status, 'measured');
  assert.equal(c02.observedNumeric, 0);
  assert.equal(c02.comparable, true);
  assert.equal(c02.delta, -0.8);

  const c03 = summary.comparisons.find((c) => c.candidateId === 'C03')!;
  assert.equal(c03.status, 'failed');
  assert.equal(c03.observedNumeric, null);
  assert.equal(c03.comparable, false);
  assert.equal(c03.delta, null);

  const c05 = summary.comparisons.find((c) => c.candidateId === 'C05')!;
  assert.equal(c05.status, 'censored');
  assert.equal(c05.observedNumeric, null);
  assert.equal(c05.upperBound, 0.1);
  assert.equal(c05.comparable, false);
  assert.equal(c05.delta, null);

  const o02 = SYNTHETIC_EVIDENCE_PACKET.observations.find((o) => o.id === 'O02')!;
  const o05 = SYNTHETIC_EVIDENCE_PACKET.observations.find((o) => o.id === 'O05')!;
  assert.equal(formatObservationValue(o02), '0.00 RFU');
  assert.equal(formatObservationValue(o05), '< 0.10 RFU (censored)');

  assert.match(
    renderFactAssertion(
      { recordId: 'O02', field: 'value', status: 'measured', qualifier: '=', value: 0, units: 'RFU' },
      SYNTHETIC_EVIDENCE_PACKET,
    ),
    /O02\.value \[measured\]: = 0\.00 RFU \(valid measured zero\)/,
  );
  assert.match(
    renderFactAssertion(
      { recordId: 'O05', field: 'upperBound', status: 'censored', qualifier: '<', value: 0.1, units: 'RFU' },
      SYNTHETIC_EVIDENCE_PACKET,
    ),
    /O05\.upperBound \[censored\]: < 0\.10 RFU \(upper bound; no point value\)/,
  );
  assert.match(
    renderFactAssertion(
      { recordId: 'P03', field: 'value', status: 'prior_prediction', qualifier: '=', value: 0.91, units: 'RFU' },
      SYNTHETIC_EVIDENCE_PACKET,
    ),
    /P03\.value \[prior_prediction\]: = 0\.91 RFU \(pre-outcome score; not measured\)/,
  );

  const items = resolveSourceItems(SYNTHETIC_EVIDENCE_PACKET, [
    'O02',
    'P03',
    'O05',
    'R01',
    REQUIRED_AUDIT_CLAIM_ID,
  ]);
  assert.equal(items.length, 5);
  assert.ok(items.some((i) => i.id === REQUIRED_AUDIT_CLAIM_ID && i.kind === 'audit'));

  assert.equal(SCHEMATIC_1UBQ_NODES.length, 76);
  assert.equal(BENIGN_REFERENCE_METADATA.epistemicClass, 'reference_annotation');
  const projected = projectTopologyNodes(SCHEMATIC_1UBQ_NODES, 30, 15);
  assert.equal(projected.length, 76);
});

test('validation accepts grounded 3.0.0 test fixture with all 8 deterministic check flags true', () => {
  const fixture = createValidTestReviewFixture();
  const result = validateReviewOutput(fixture, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(result.valid, true);
  assert.equal(result.status, 'validated');
  assert.equal(result.budgetUsed, 4);
  assert.equal(result.budgetLimit, 4);
  assert.equal(result.issues.length, 0);
  assert.deepEqual(result.checks, {
    schemaValid: true,
    structuredAssertionsValid: true,
    allIdsValid: true,
    budgetValid: true,
    narrativeScreeningValid: true,
    auditRefutedValid: true,
    statisticalClaimGuardValid: true,
    modelIdentityValid: true,
  });
});

test('Regression Bypass #1: rejects sibling prediction value leakage ("O01 measured 0.68 RFU." citing O01 or O01+P01)', () => {
  // Variant A: citing only O01
  const vA = createValidTestReviewFixture();
  vA.evidenceFindings[0] = {
    assertions: [
      { recordId: 'O01', field: 'value', status: 'measured', qualifier: '=', value: 0.72, units: 'RFU' },
    ],
    claim: 'O01 measured 0.68 RFU.',
    sourceIds: ['O01'],
  };
  const resA = validateReviewOutput(vA, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(resA.valid, false);
  assert.equal(resA.checks.narrativeScreeningValid, false);
  assert.ok(
    resA.issues.some(
      (i) => i.code === 'UNGROUNDED_NUMERIC_CLAIM' || i.code === 'RECORD_VALUE_MISMATCH',
    ),
  );

  // Variant B: even when P01 is also cited in sourceIds, attributing 0.68 to O01 is rejected
  const vB = createValidTestReviewFixture();
  vB.evidenceFindings[0].claim = 'O01 measured 0.68 RFU.';
  vB.evidenceFindings[0].sourceIds = ['O01', 'P01'];
  const resB = validateReviewOutput(vB, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(resB.valid, false);
  assert.ok(resB.issues.some((i) => i.code === 'RECORD_VALUE_MISMATCH'));
});

test('Regression Bypass #2: rejects fabricated integer values and replicate counts ("O01 measured 999 RFU across 600 replicates.")', () => {
  const f = createValidTestReviewFixture();
  f.evidenceFindings[0].claim = 'O01 measured 999 RFU across 600 replicates.';
  f.evidenceFindings[0].sourceIds = ['O01'];
  f.evidenceFindings[0].assertions = [
    { recordId: 'O01', field: 'value', status: 'measured', qualifier: '=', value: 0.72, units: 'RFU' },
  ];
  const res = validateReviewOutput(f, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(res.valid, false);
  assert.equal(res.checks.narrativeScreeningValid, false);
  assert.ok(res.issues.some((i) => i.code === 'UNGROUNDED_NUMERIC_CLAIM'));
  assert.ok(res.issues.some((i) => i.code === 'UNSUPPORTED_REPLICATE_CLAIM'));
});

test('Regression Bypass #3: rejects extra decimal precision without rounding ("O01 measured 0.724 RFU.")', () => {
  const f = createValidTestReviewFixture();
  f.evidenceFindings[0].claim = 'O01 measured 0.724 RFU.';
  f.evidenceFindings[0].sourceIds = ['O01'];
  f.evidenceFindings[0].assertions = [
    { recordId: 'O01', field: 'value', status: 'measured', qualifier: '=', value: 0.72, units: 'RFU' },
  ];
  const res = validateReviewOutput(f, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(res.valid, false);
  assert.equal(res.checks.narrativeScreeningValid, false);
  assert.ok(res.issues.some((i) => i.code === 'UNSUPPORTED_NUMERIC_PRECISION'));
});

test('Regression Bypass #4: rejects mismatched claimToCheck and non-substantive audit correction ("Everything is fine.")', () => {
  const f = createValidTestReviewFixture();
  f.unsupportedClaimAudit.claimToCheck = 'Some unrelated benign claim.';
  f.unsupportedClaimAudit.correction = 'Everything is fine.';
  const res = validateReviewOutput(f, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(res.valid, false);
  assert.equal(res.checks.auditRefutedValid, false);
  assert.ok(res.issues.some((i) => i.code === 'AUDIT_CLAIM_MISMATCH'));
  assert.ok(res.issues.some((i) => i.code === 'AUDIT_CORRECTION_INSUFFICIENT'));
});

test('Regression Bypass #5: rejects proposedAction prose slot conflict ("Allocate 99 synthetic slots to C03." when assaySlots = 2)', () => {
  const f = createValidTestReviewFixture();
  f.proposedActions[0].assaySlots = 2;
  f.proposedActions[0].purpose = 'Allocate 99 synthetic slots to C03.';
  f.proposedActions[0].sourceIds = ['C03'];
  const res = validateReviewOutput(f, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(res.valid, false);
  assert.equal(res.checks.budgetValid, false);
  assert.equal(res.checks.narrativeScreeningValid, false);
  assert.ok(res.issues.some((i) => i.code === 'ACTION_SLOT_PROSE_CONFLICT'));
  assert.ok(res.issues.some((i) => i.code === 'UNGROUNDED_NUMERIC_CLAIM'));
});

test('Regression Bypass #6: rejects non-measured-as-measured and uncited record mentions in limitations ("O03 measured 0.91 RFU." citing P03)', () => {
  // Variant A: citing only P03 while mentioning O03
  const vA = createValidTestReviewFixture();
  vA.limitations[0] = {
    note: 'O03 measured 0.91 RFU.',
    sourceIds: ['P03'],
  };
  const resA = validateReviewOutput(vA, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(resA.valid, false);
  assert.equal(resA.checks.narrativeScreeningValid, false);
  assert.ok(resA.issues.some((i) => i.code === 'UNCITED_RECORD_REFERENCE'));
  assert.ok(resA.issues.some((i) => i.code === 'NON_MEASURED_AS_MEASURED'));
  assert.ok(resA.issues.some((i) => i.code === 'RECORD_VALUE_MISMATCH'));

  // Variant B: citing both O03 and P03 in limitations still rejects "O03 measured 0.91 RFU."
  const vB = createValidTestReviewFixture();
  vB.limitations[0] = {
    note: 'O03 measured 0.91 RFU.',
    sourceIds: ['O03', 'P03'],
  };
  const resB = validateReviewOutput(vB, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(resB.valid, false);
  assert.ok(resB.issues.some((i) => i.code === 'NON_MEASURED_AS_MEASURED'));
  assert.ok(resB.issues.some((i) => i.code === 'RECORD_VALUE_MISMATCH'));
});

test('Regression Bypass #7: rejects statistical overclaim masked by unrelated status negation ("O01 is not missing and is statistically significant.")', () => {
  const f = createValidTestReviewFixture();
  f.evidenceFindings[0] = {
    assertions: [
      { recordId: 'O01', field: 'value', status: 'measured', qualifier: '=', value: 0.72, units: 'RFU' },
    ],
    claim: 'O01 is not missing and is statistically significant.',
    sourceIds: ['O01'],
  };
  const res = validateReviewOutput(f, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(res.valid, false);
  assert.equal(res.checks.statisticalClaimGuardValid, false);
  assert.ok(res.issues.some((i) => i.code === 'UNSUPPORTED_STATISTICS'));
});

test('structured FactAssertion validator rejects wrong status, censored-to-point, wrong units, and non-null failed/missing values', () => {
  const censoredAsPoint = createValidTestReviewFixture();
  censoredAsPoint.evidenceFindings[3].assertions[1] = {
    recordId: 'O05',
    field: 'value',
    status: 'censored',
    qualifier: '=',
    value: 0.1,
    units: 'RFU',
  };
  const res1 = validateReviewOutput(censoredAsPoint, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(res1.valid, false);
  assert.equal(res1.checks.structuredAssertionsValid, false);
  assert.ok(res1.issues.some((i) => i.code === 'CENSORED_AS_POINT_VALUE'));

  const predAsMeasured = createValidTestReviewFixture();
  predAsMeasured.evidenceFindings[2].assertions[1] = {
    recordId: 'P03',
    field: 'value',
    status: 'measured',
    qualifier: '=',
    value: 0.91,
    units: 'RFU',
  };
  const res2 = validateReviewOutput(predAsMeasured, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(res2.valid, false);
  assert.ok(res2.issues.some((i) => i.code === 'ASSERTION_STATUS_MISMATCH'));

  const badUnits = createValidTestReviewFixture();
  badUnits.evidenceFindings[0].assertions[0].units = 'uM';
  badUnits.evidenceFindings[0].claim = 'O01 measured 0.72 uM.';
  badUnits.evidenceFindings[0].sourceIds = ['O01', 'P01'];
  const res3 = validateReviewOutput(badUnits, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(res3.valid, false);
  assert.ok(res3.issues.some((i) => i.code === 'ASSERTION_UNITS_MISMATCH'));
  assert.ok(res3.issues.some((i) => i.code === 'INVALID_UNITS'));

  const nonNullMissing = createValidTestReviewFixture();
  nonNullMissing.evidenceFindings[3].assertions[0].value = 0;
  const res4 = validateReviewOutput(nonNullMissing, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(res4.valid, false);
  assert.ok(res4.issues.some((i) => i.code === 'NON_MEASURED_AS_MEASURED'));
});

function createSampleValidatedEnvelope(
  overrides: Partial<ModelReviewEnvelope> = {},
): ModelReviewEnvelope {
  const fixture = createValidTestReviewFixture();
  const validation = validateReviewOutput(fixture, SYNTHETIC_EVIDENCE_PACKET);
  return {
    envelopeSchemaVersion: ENVELOPE_SCHEMA_VERSION,
    campaignId: 'CAMP-SYNTH-R01',
    packetId: SYNTHETIC_EVIDENCE_PACKET.packetId,
    requestedModel: 'gemini-4-carbon',
    returnedModelVersion: 'gemini-4-carbon',
    returnedModelVersionReported: true,
    modelIdentityStatus: 'verified_carbon',
    runtimeAccessProven: true,
    statusNote: 'Live gemini-4-carbon call completed (verified modelVersion "gemini-4-carbon").',
    timestamp: '2026-11-14T11:15:00.000Z',
    originalRuntimeTimestamp: '2026-11-14T11:15:00.000Z',
    recordedSourceExportedAt: null,
    responseStatus: 'validated',
    httpStatus: 200,
    evidenceHash: FROZEN_R01_EVIDENCE_HASH,
    sourceImmutableVerified: true,
    validation,
    review: fixture,
    rawResponseText: JSON.stringify(fixture),
    isRecorded: false,
    ...overrides,
  };
}

test('campaign session isolates R01 vs R02-GATE, cancels in-flight request on switch, rejects stale async completions, and blocks mismatched exports', () => {
  const r01 = getCampaignById('CAMP-SYNTH-R01')!;
  const r02Gate = getCampaignById('CAMP-SYNTH-R02-GATE')!;

  let session = createInitialCampaignSession('CAMP-SYNTH-R01');
  const started1 = beginCampaignRequest(session, r01, FROZEN_R01_EVIDENCE_HASH);
  assert.ok(started1.token);
  session = started1.state;
  assert.equal(getActiveCampaignSlot(session).status, 'loading');

  // Switch to CAMP-SYNTH-R02-GATE while R01 request #1 is in flight
  const switched = selectCampaignInSession(session, 'CAMP-SYNTH-R02-GATE');
  assert.ok(switched.abortedRequest);
  assert.equal(switched.abortedRequest?.requestId, started1.token!.requestId);
  session = switched.state;

  // R02-GATE slot must be idle/empty, and R01 loading slot was cleared on abort
  assert.equal(getActiveCampaignSlot(session).status, 'idle');
  assert.equal(getActiveCampaignSlot(session).envelope, null);
  assert.equal(session.byCampaign['CAMP-SYNTH-R01'].status, 'idle');

  // Stale completion of request #1 must be discarded and never overwrite R02-GATE or R01
  const env = createSampleValidatedEnvelope();
  const staleSettlement = settleCampaignEnvelope(session, started1.token!.requestId, env);
  assert.equal(staleSettlement.applied, false);
  assert.equal(getActiveCampaignSlot(staleSettlement.state).envelope, null);

  // Starting a request on non-eligible R02-GATE is refused
  const blockedStart = beginCampaignRequest(session, r02Gate, FROZEN_R01_EVIDENCE_HASH);
  assert.equal(blockedStart.token, null);

  // Switch back to R01, run request #2 to completion, then verify switching to R02-GATE hides R01 review
  session = selectCampaignInSession(session, 'CAMP-SYNTH-R01').state;
  const started2 = beginCampaignRequest(session, r01, FROZEN_R01_EVIDENCE_HASH);
  assert.ok(started2.token);
  const settled2 = settleCampaignEnvelope(started2.state, started2.token!.requestId, env);
  assert.equal(settled2.applied, true);
  session = settled2.state;
  assert.equal(getActiveCampaignSlot(session).status, 'validated');
  assert.ok(getActiveCampaignSlot(session).envelope);

  const onGateAgain = selectCampaignInSession(session, 'CAMP-SYNTH-R02-GATE').state;
  assert.equal(getActiveCampaignSlot(onGateAgain).status, 'idle');
  assert.equal(getActiveCampaignSlot(onGateAgain).envelope, null);

  // Export under CAMP-SYNTH-R02-GATE must throw ExportBindingError even if caller passes an R01 envelope directly
  assert.throws(
    () =>
      buildExportReviewPacket({
        packet: SYNTHETIC_EVIDENCE_PACKET,
        campaign: r02Gate,
        reviewerNotes: '',
        status: 'validated',
        modelStatus: null,
        envelope: env,
        errorState: null,
      }),
    (err: unknown) =>
      err instanceof ExportBindingError && err.code === 'CAMPAIGN_NOT_EXPORTABLE',
  );

  // Export with mutated packet SHA-256 must throw SOURCE_HASH_MISMATCH
  const mutatedPacket: EvidencePacket = {
    ...SYNTHETIC_EVIDENCE_PACKET,
    title: 'Tampered Title',
  };
  assert.throws(
    () =>
      buildExportReviewPacket({
        packet: mutatedPacket,
        campaign: r01,
        reviewerNotes: '',
        status: 'idle',
        modelStatus: null,
        envelope: null,
        errorState: null,
      }),
    (err: unknown) => err instanceof ExportBindingError && err.code === 'SOURCE_HASH_MISMATCH',
  );

  // Reset clears session cleanly
  const reset = resetCampaignSession();
  assert.equal(getActiveCampaignSlot(reset).status, 'idle');
  assert.equal(getActiveCampaignSlot(reset).envelope, null);

  // Stale error is also ignored
  const staleErr = settleCampaignError(reset, 999, {
    errorCode: 'TIMEOUT',
    message: 'late',
    requestedModel: 'gemini-4-carbon',
    returnedModelVersion: null,
    runtimeAccessProven: false,
    statusNote: 'late',
    timestamp: '2026-11-14T11:20:00.000Z',
    httpStatus: 504,
    evidenceHash: FROZEN_R01_EVIDENCE_HASH,
  });
  assert.equal(staleErr.applied, false);
});

test('Regression GF-V3-RESET-STALE-REQUEST: reset and campaign switches preserve monotonic generation, abort recorded fetches, and reject both stale success and stale failure', async () => {
  const r01 = getCampaignById('CAMP-SYNTH-R01')!;

  // 1. Start R01 request #1, reset (testing both state-passing and zero-arg reset), then start R01 request #2
  const initial = createInitialCampaignSession('CAMP-SYNTH-R01');
  const firstRun = beginCampaignRequest(initial, r01, FROZEN_R01_EVIDENCE_HASH);
  assert.ok(firstRun.token);
  const oldToken = firstRun.token!;

  const afterResetWithState = resetCampaignSession(firstRun.state);
  assert.ok(afterResetWithState.nextRequestId > oldToken.requestId);
  assert.ok(afterResetWithState.sessionEpoch > oldToken.sessionEpoch);

  // Even a zero-argument resetCampaignSession() call must never rewind requestId back to oldToken.requestId
  const afterZeroArgReset = resetCampaignSession();
  assert.ok(afterZeroArgReset.nextRequestId > oldToken.requestId);
  assert.ok(afterZeroArgReset.sessionEpoch > afterResetWithState.sessionEpoch);

  const secondRun = beginCampaignRequest(afterZeroArgReset, r01, FROZEN_R01_EVIDENCE_HASH);
  assert.ok(secondRun.token);
  const newToken = secondRun.token!;
  assert.notEqual(newToken.requestId, oldToken.requestId);
  assert.ok(newToken.requestId > oldToken.requestId);
  assert.ok(newToken.sessionEpoch > oldToken.sessionEpoch);

  const staleLiveEnvelope = createSampleValidatedEnvelope({
    statusNote: '[TEST FIXTURE] Stale pre-reset live completion',
  });
  const staleRecordedEnvelope = createSampleValidatedEnvelope({
    isRecorded: true,
    runtimeAccessProven: false,
    originalRecordedRuntimeAccessProven: true,
    statusNote: '[TEST FIXTURE] Stale pre-reset recorded completion',
  });
  const staleFailure = {
    errorCode: 'RECORDED_REVIEW_UNAVAILABLE' as const,
    message: 'OLD_RESULT',
    requestedModel: 'gemini-4-carbon',
    returnedModelVersion: null,
    runtimeAccessProven: false as const,
    statusNote: 'Stale error before reset',
    timestamp: '2026-11-14T12:15:00.000Z',
    httpStatus: 404,
    evidenceHash: FROZEN_R01_EVIDENCE_HASH,
  };

  // Old recorded/live success (by numeric requestId or full token) must be rejected while new request is loading
  const oldLiveById = settleCampaignEnvelope(
    secondRun.state,
    oldToken.requestId,
    staleLiveEnvelope,
  );
  assert.equal(oldLiveById.applied, false);
  assert.equal(getActiveCampaignSlot(oldLiveById.state).status, 'loading');
  assert.equal(getActiveCampaignSlot(oldLiveById.state).envelope, null);

  const oldRecordedByToken = settleCampaignEnvelope(
    secondRun.state,
    oldToken,
    staleRecordedEnvelope,
    'recorded',
  );
  assert.equal(oldRecordedByToken.applied, false);
  assert.equal(getActiveCampaignSlot(oldRecordedByToken.state).status, 'loading');
  assert.equal(getActiveCampaignSlot(oldRecordedByToken.state).envelope, null);

  // Old failure (by numeric requestId or full token) must also be rejected without cancelling new loading state
  const oldErrById = settleCampaignError(secondRun.state, oldToken.requestId, staleFailure);
  assert.equal(oldErrById.applied, false);
  assert.equal(getActiveCampaignSlot(oldErrById.state).status, 'loading');
  assert.equal(getActiveCampaignSlot(oldErrById.state).errorState, null);

  const oldErrByToken = settleCampaignError(secondRun.state, oldToken, staleFailure);
  assert.equal(oldErrByToken.applied, false);
  assert.equal(getActiveCampaignSlot(oldErrByToken.state).status, 'loading');

  // New request settles cleanly and late old completions still fail to overwrite it
  const freshEnvelope = createSampleValidatedEnvelope({
    timestamp: '2026-11-14T12:20:00.000Z',
    originalRuntimeTimestamp: '2026-11-14T12:20:00.000Z',
  });
  const settledNew = settleCampaignEnvelope(secondRun.state, newToken, freshEnvelope);
  assert.equal(settledNew.applied, true);
  assert.equal(getActiveCampaignSlot(settledNew.state).status, 'validated');
  assert.equal(getActiveCampaignSlot(settledNew.state).envelope?.timestamp, '2026-11-14T12:20:00.000Z');

  assert.equal(settleCampaignError(settledNew.state, oldToken, staleFailure).applied, false);
  assert.equal(
    settleCampaignEnvelope(settledNew.state, oldToken, staleRecordedEnvelope, 'recorded').applied,
    false,
  );

  // 2. Campaign switch round-trip (R01 -> R02-GATE -> R01 + new request) rejects both old success and old failure
  const runBeforeSwitch = beginCampaignRequest(settledNew.state, r01, FROZEN_R01_EVIDENCE_HASH);
  assert.ok(runBeforeSwitch.token);
  const switchOldToken = runBeforeSwitch.token!;

  const switchedToGate = selectCampaignInSession(runBeforeSwitch.state, 'CAMP-SYNTH-R02-GATE');
  assert.equal(switchedToGate.abortedRequest?.requestId, switchOldToken.requestId);
  const switchedBackToR01 = selectCampaignInSession(switchedToGate.state, 'CAMP-SYNTH-R01');
  const runAfterSwitch = beginCampaignRequest(
    switchedBackToR01.state,
    r01,
    FROZEN_R01_EVIDENCE_HASH,
  );
  assert.ok(runAfterSwitch.token);
  assert.ok(runAfterSwitch.token!.requestId > switchOldToken.requestId);
  assert.ok(runAfterSwitch.token!.sessionEpoch > switchOldToken.sessionEpoch);

  assert.equal(
    settleCampaignEnvelope(runAfterSwitch.state, switchOldToken, staleRecordedEnvelope, 'recorded')
      .applied,
    false,
  );
  assert.equal(
    settleCampaignError(runAfterSwitch.state, switchOldToken, staleFailure).applied,
    false,
  );
  assert.equal(getActiveCampaignSlot(runAfterSwitch.state).status, 'loading');

  // 3. Recorded fetch honors AbortSignal and returns outcome='aborted' when cancelled by reset or switch
  const abortController = new AbortController();
  let observedSignalAborted = false;
  const pendingRecordedPromise = loadRecordedReviewFromUrl(
    r01,
    SYNTHETIC_EVIDENCE_PACKET,
    RECORDED_REVIEW_RELATIVE_URL,
    async (_url, init) => {
      const sig = init?.signal;
      assert.ok(sig, 'loadRecordedReviewFromUrl must forward AbortSignal to fetch');
      return await new Promise<Response>((_resolve, reject) => {
        sig.addEventListener('abort', () => {
          observedSignalAborted = sig.aborted;
          const abortErr = new Error('The operation was aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      });
    },
    abortController.signal,
  );

  abortController.abort();
  const abortedOutcome = await pendingRecordedPromise;
  assert.equal(observedSignalAborted, true);
  assert.equal(abortedOutcome.outcome, 'aborted');
});

test('model identity verifier distinguishes verified Carbon, unreported null, and non-Carbon mismatch', () => {
  const verified = verifyReturnedModelIdentity('gemini-4-carbon');
  assert.equal(verified.status, 'verified_carbon');
  assert.equal(verified.isCarbonVerified, true);
  assert.equal(verified.isQuarantinedMismatch, false);

  const prefixed = verifyReturnedModelIdentity('models/gemini-4-carbon-001');
  assert.equal(prefixed.status, 'verified_carbon');
  assert.equal(prefixed.isCarbonVerified, true);

  const unreported = verifyReturnedModelIdentity(undefined);
  assert.equal(unreported.status, 'unreported');
  assert.equal(unreported.normalizedVersion, null);
  assert.equal(unreported.isCarbonVerified, false);
  assert.equal(unreported.isQuarantinedMismatch, false);

  for (const disallowed of [
    'gemini-4-hydrogen',
    'gemini-2.5-flash',
    'gemini-4-carbon-test-fixture-v0',
    'gpt-5',
  ]) {
    const mismatch = verifyReturnedModelIdentity(disallowed);
    assert.equal(mismatch.status, 'non_carbon_mismatch');
    assert.equal(mismatch.isCarbonVerified, false);
    assert.equal(mismatch.isQuarantinedMismatch, true);

    const baseVal = validateReviewOutput(createValidTestReviewFixture(), SYNTHETIC_EVIDENCE_PACKET);
    const quarantinedVal = applyModelIdentityQuarantine(baseVal, disallowed, true);
    assert.equal(quarantinedVal.valid, false);
    assert.equal(quarantinedVal.checks.modelIdentityValid, false);
    assert.ok(quarantinedVal.issues.some((i) => i.code === 'MODEL_IDENTITY_MISMATCH'));
  }
});

test('recorded review importer handles unavailable (404/HTML), rejects 2.0.0/fixtures/tampering, and preserves timestamps on valid 3.0.0 replay & re-export', async () => {
  const r01 = SYNTHETIC_CAMPAIGNS[0];

  // 1. Missing recording (404) -> honest unavailable state, no test fixture loaded
  const missingRes = await loadRecordedReviewFromUrl(
    r01,
    SYNTHETIC_EVIDENCE_PACKET,
    RECORDED_REVIEW_RELATIVE_URL,
    async () => new Response('Not Found', { status: 404 }),
  );
  assert.equal(missingRes.outcome, 'unavailable');
  assert.equal(missingRes.error.errorCode, 'RECORDED_REVIEW_UNAVAILABLE');

  // 2. SPA HTML fallback -> honest unavailable state
  const htmlFallbackRes = await loadRecordedReviewFromUrl(
    r01,
    SYNTHETIC_EVIDENCE_PACKET,
    RECORDED_REVIEW_RELATIVE_URL,
    async () => new Response('<!doctype html><html><body></body></html>', { status: 200 }),
  );
  assert.equal(htmlFallbackRes.outcome, 'unavailable');
  assert.equal(htmlFallbackRes.error.errorCode, 'RECORDED_REVIEW_UNAVAILABLE');

  // 3. Malformed JSON -> quarantined
  const malformedRes = await loadRecordedReviewFromUrl(
    r01,
    SYNTHETIC_EVIDENCE_PACKET,
    RECORDED_REVIEW_RELATIVE_URL,
    async () => new Response('{not-json', { status: 200 }),
  );
  assert.equal(malformedRes.outcome, 'quarantined');
  assert.equal(malformedRes.envelope.review, null);
  assert.ok(
    malformedRes.envelope.validation.issues.some((i) => i.code === 'RECORDING_MALFORMED_JSON'),
  );

  // Build a valid 3.0.0 ExportReviewPacket representing a verified Carbon run
  const validLiveEnv = createSampleValidatedEnvelope({
    timestamp: '2026-11-14T11:30:00.000Z',
    originalRuntimeTimestamp: '2026-11-14T11:30:00.000Z',
  });
  const validExportPacket: ExportReviewPacket = buildExportReviewPacket({
    packet: SYNTHETIC_EVIDENCE_PACKET,
    campaign: r01,
    reviewerNotes: 'Original live export',
    status: 'validated',
    modelStatus: null,
    envelope: validLiveEnv,
    errorState: null,
    exportedAt: '2026-11-14T11:31:00.000Z',
  });
  assert.equal(validExportPacket.exportSchemaVersion, EXPORT_SCHEMA_VERSION);
  assert.equal(validExportPacket.executionMode, 'live_server');

  // 4. Pre-correction 2.0.0 schema must be quarantined and never relabeled
  const legacy200 = {
    ...validExportPacket,
    exportSchemaVersion: '2.0.0',
  };
  const legacyImport = verifyAndImportRecordedReview(legacy200, r01, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(legacyImport.outcome, 'quarantined');
  assert.equal(legacyImport.envelope.review, null);
  assert.ok(
    legacyImport.envelope.validation.issues.some(
      (i) => i.code === 'RECORDING_SCHEMA_VERSION_MISMATCH',
    ),
  );

  // 5. Simulated test fixture export must be rejected in recorded replay
  const simulatedExport = {
    ...validExportPacket,
    modelMetadata: {
      ...validExportPacket.modelMetadata,
      statusNote: '[TEST FIXTURE] Simulated response',
    },
  };
  const simImport = verifyAndImportRecordedReview(simulatedExport, r01, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(simImport.outcome, 'quarantined');
  assert.ok(
    simImport.envelope.validation.issues.some(
      (i) => i.code === 'RECORDING_TEST_FIXTURE_FORBIDDEN',
    ),
  );

  // 6. Tampered modelOutput prose inside a 3.0.0 export is caught by re-validation and quarantined
  const tamperedExport: ExportReviewPacket = JSON.parse(JSON.stringify(validExportPacket));
  tamperedExport.modelOutput!.evidenceFindings[0].claim = 'O01 measured 0.68 RFU.';
  const tamperedImport = verifyAndImportRecordedReview(
    tamperedExport,
    r01,
    SYNTHETIC_EVIDENCE_PACKET,
  );
  assert.equal(tamperedImport.outcome, 'quarantined');
  assert.equal(tamperedImport.envelope.review, null);

  // 7. Valid 3.0.0 export loads cleanly, preserves originalRuntimeTimestamp & recordedSourceExportedAt,
  //    sets session runtimeAccessProven=false while recording originalRecordedRuntimeAccessProven=true,
  //    and writes a fresh exportedAt when re-exported
  const loaded = await loadRecordedReviewFromUrl(
    r01,
    SYNTHETIC_EVIDENCE_PACKET,
    RECORDED_REVIEW_RELATIVE_URL,
    async () => new Response(JSON.stringify(validExportPacket), { status: 200 }),
  );
  assert.equal(loaded.outcome, 'loaded');
  assert.equal(loaded.envelope.isRecorded, true);
  assert.equal(loaded.envelope.runtimeAccessProven, false);
  assert.equal(loaded.envelope.originalRecordedRuntimeAccessProven, true);
  assert.equal(loaded.envelope.originalRuntimeTimestamp, '2026-11-14T11:30:00.000Z');
  assert.equal(loaded.envelope.recordedSourceExportedAt, '2026-11-14T11:31:00.000Z');
  assert.ok(loaded.envelope.review);

  const reExported = buildExportReviewPacket({
    packet: SYNTHETIC_EVIDENCE_PACKET,
    campaign: r01,
    reviewerNotes: 'Static reviewer note',
    status: 'recorded',
    modelStatus: null,
    envelope: loaded.envelope,
    errorState: null,
    exportedAt: '2026-11-14T14:00:00.000Z',
  });
  assert.equal(reExported.executionMode, 'static_recorded_replay');
  assert.equal(reExported.exportedAt, '2026-11-14T14:00:00.000Z');
  assert.equal(reExported.modelMetadata.originalRuntimeTimestamp, '2026-11-14T11:30:00.000Z');
  assert.equal(reExported.modelMetadata.recordedSourceExportedAt, '2026-11-14T11:31:00.000Z');
  assert.equal(reExported.modelMetadata.runtimeAccessProven, false);
  assert.equal(reExported.modelMetadata.originalRecordedRuntimeAccessProven, true);
  assert.equal(reExported.modelMetadata.isRecorded, true);
});

test('natural Carbon prose patterns with 3.0.0 assertions pass validation without false positives', () => {
  const naturalCarbonOutput = {
    summary:
      'Review of synthetic solubility assay round R01 covering six candidates (C01-C06) with single-replicate observations (O01-O06) and frozen prior predictions (P01-P06). Three candidates yielded exact measured values: C01 (O01 = 0.72 RFU), C06 (O06 = 0.65 RFU), and C02 (O02 = 0.00 RFU, a valid measured zero). Three candidates lack exact point measurements: C03 failed QC (O03), C04 was missing (O04), and C05 was left-censored (< 0.10 RFU, O05).',
    evidenceFindings: [
      {
        assertions: [
          { recordId: 'O01', field: 'value', status: 'measured', qualifier: '=', value: 0.72, units: 'RFU' },
          { recordId: 'P01', field: 'value', status: 'prior_prediction', qualifier: '=', value: 0.68, units: 'RFU' },
        ],
        claim:
          'Candidate C01 (sample S01) yielded a measured observation O01 of 0.72 RFU, compared to its frozen prior prediction P01 of 0.68 RFU.',
        sourceIds: ['R01', 'C01', 'S01', 'O01', 'P01'],
      },
      {
        assertions: [
          { recordId: 'O02', field: 'value', status: 'measured', qualifier: '=', value: 0, units: 'RFU' },
          { recordId: 'P02', field: 'value', status: 'prior_prediction', qualifier: '=', value: 0.8, units: 'RFU' },
        ],
        claim:
          'Candidate C02 (sample S02) recorded a valid measured zero in observation O02 (0.00 RFU), contrasting with its prior prediction P02 of 0.8 RFU.',
        sourceIds: ['R01', 'C02', 'S02', 'O02', 'P02'],
      },
      {
        assertions: [
          { recordId: 'O05', field: 'upperBound', status: 'censored', qualifier: '<', value: 0.1, units: 'RFU' },
          { recordId: 'P05', field: 'value', status: 'prior_prediction', qualifier: '=', value: 0.25, units: 'RFU' },
        ],
        claim:
          'Candidate C05 (sample S05) resulted in a left-censored observation O05 (< 0.10 RFU upper bound, no point value), whereas its prior prediction P05 was 0.25 RFU.',
        sourceIds: ['R01', 'C05', 'S05', 'O05', 'P05'],
      },
      {
        assertions: [
          { recordId: 'O03', field: 'value', status: 'failed', qualifier: 'none', value: null, units: 'RFU' },
          { recordId: 'P03', field: 'value', status: 'prior_prediction', qualifier: '=', value: 0.91, units: 'RFU' },
          { recordId: 'O04', field: 'value', status: 'missing', qualifier: 'none', value: null, units: 'RFU' },
          { recordId: 'P04', field: 'value', status: 'prior_prediction', qualifier: '=', value: 0.74, units: 'RFU' },
        ],
        claim:
          'Candidates C03 (S03, O03 failed due to Instrument QC failure) and C04 (S04, O04 missing as Not received) have null observations; their prior predictions P03 (0.91 RFU) and P04 (0.74 RFU) are non-measurement pre-outcome scores.',
        sourceIds: ['R01', 'C03', 'S03', 'O03', 'P03', 'C04', 'S04', 'O04', 'P04'],
      },
      {
        assertions: [
          { recordId: 'O06', field: 'value', status: 'measured', qualifier: '=', value: 0.65, units: 'RFU' },
          { recordId: 'P06', field: 'value', status: 'prior_prediction', qualifier: '=', value: 0.6, units: 'RFU' },
        ],
        claim:
          'Candidate C06 (sample S06) yielded a measured observation O06 of 0.65 RFU, compared to its frozen prior prediction P06 of 0.6 RFU.',
        sourceIds: ['R01', 'C06', 'S06', 'O06', 'P06'],
      },
    ],
    limitations: [
      {
        note:
          'Round R01 includes only 1 replicate per candidate across C01, C02, C03, C04, C05, and C06, preventing variance estimation across O01, O02, O03, O04, O05, and O06.',
        sourceIds: ['R01', 'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'O01', 'O02', 'O03', 'O04', 'O05', 'O06'],
      },
      {
        note:
          'Observation O05 for candidate C05 (sample S05) is left-censored (< 0.10 RFU) with no exact point value and must not be coerced to zero or a point estimate.',
        sourceIds: ['C05', 'S05', 'O05'],
      },
    ],
    proposedActions: [
      {
        candidateId: 'C03',
        purpose:
          'Re-assay sample S03 to obtain an experimental measurement after O03 failed due to Instrument QC failure (prior prediction P03 was 0.91 RFU). Human review is required before execution.',
        assaySlots: 2,
        sourceIds: ['R01', 'C03', 'S03', 'O03', 'P03'],
      },
      {
        candidateId: 'C04',
        purpose:
          'Acquire and assay sample S04 to resolve missing observation O04 (Not received; prior prediction P04 was 0.74 RFU). Human review is required before execution.',
        assaySlots: 2,
        sourceIds: ['R01', 'C04', 'S04', 'O04', 'P04'],
      },
    ],
    unsupportedClaimAudit: {
      auditId: 'AUDIT-CLAIM-01',
      claimToCheck:
        'C03 achieved a measured score of 0.91 and all six candidates were successfully measured.',
      verdict: 'contradicted',
      assertions: [
        { recordId: 'O03', field: 'value', status: 'failed', qualifier: 'none', value: null, units: 'RFU' },
        { recordId: 'P03', field: 'value', status: 'prior_prediction', qualifier: '=', value: 0.91, units: 'RFU' },
        { recordId: 'O04', field: 'value', status: 'missing', qualifier: 'none', value: null, units: 'RFU' },
        { recordId: 'O05', field: 'upperBound', status: 'censored', qualifier: '<', value: 0.1, units: 'RFU' },
      ],
      correction:
        'The claim conflates a prior prediction with a measurement and misstates assay completion in R01. For C03 (S03), 0.91 RFU is the frozen prior prediction P03, whereas actual observation O03 has status failed (null value due to Instrument QC failure). Furthermore, only three of the six candidates (C01 via O01, C02 via O02, and C06 via O06) were measured; C03 failed (O03), C04 was missing (O04, Not received), and C05 was left-censored (< 0.10 RFU in O05 with no point value).',
      sourceIds: [
        'R01',
        'AUDIT-CLAIM-01',
        'C01',
        'C02',
        'C03',
        'C04',
        'C05',
        'C06',
        'S03',
        'O01',
        'O02',
        'O03',
        'O04',
        'O05',
        'O06',
        'P03',
      ],
    },
  };

  const res = validateReviewOutput(naturalCarbonOutput, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(res.valid, true, `Unexpected issues: ${JSON.stringify(res.issues)}`);
  assert.equal(res.budgetUsed, 4);
});


test('permanent rename preserves the original recording and re-exports with the current name', () => {
  const bytes = readFileSync(new URL('../../public/recorded/carbon-review-R01.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'b9e76479f3ba828225dea51a0ea9b2f790c5107f69a34729932be1afdbc5c051');
  const original = JSON.parse(bytes.toString('utf8'));
  assert.equal(original.application, 'GammaFold Final');
  const campaign = SYNTHETIC_CAMPAIGNS[0];
  const imported = verifyAndImportRecordedReview(original, campaign, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(imported.outcome, 'loaded');
  if (imported.outcome !== 'loaded') throw new Error('Original recording did not load');
  const current = buildExportReviewPacket({
    packet: SYNTHETIC_EVIDENCE_PACKET, campaign, reviewerNotes: '', status: 'recorded',
    modelStatus: null, envelope: imported.envelope, errorState: null,
  });
  assert.equal(current.application, 'GammaFold');
  assert.equal(current.modelMetadata.originalRuntimeTimestamp, original.modelMetadata.originalRuntimeTimestamp);
  assert.equal(current.modelMetadata.recordedSourceExportedAt, original.exportedAt);
  assert.equal(current.modelMetadata.runtimeAccessProven, false);
  assert.equal(verifyAndImportRecordedReview(current, campaign, SYNTHETIC_EVIDENCE_PACKET).outcome, 'loaded');
  const unrelated = verifyAndImportRecordedReview({ ...current, application: 'Unrelated app' }, campaign, SYNTHETIC_EVIDENCE_PACKET);
  assert.equal(unrelated.outcome, 'quarantined');
  assert.ok(unrelated.envelope.validation.issues.some((issue) => issue.code === 'RECORDING_APPLICATION_MISMATCH'));
});

test('permanent rename migrates saved reviewer notes without resurrecting them after reset', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const previous = { campaignId: SYNTHETIC_CAMPAIGNS[1].id, reviewerNotes: 'Keep my local review notes' };
  values.set(LEGACY_LOCAL_STORAGE_KEY, JSON.stringify(previous));
  const loaded = loadPersistedLocalState(storage);
  assert.deepEqual(loaded, previous);
  savePersistedLocalState(storage, loaded);
  assert.equal(values.has(LEGACY_LOCAL_STORAGE_KEY), false);
  assert.deepEqual(loadPersistedLocalState(storage), previous);
  values.set(LEGACY_LOCAL_STORAGE_KEY, JSON.stringify({ ...previous, reviewerNotes: 'stale' }));
  assert.deepEqual(loadPersistedLocalState(storage), previous);
  clearPersistedLocalState(storage);
  assert.equal(values.has(LOCAL_STORAGE_KEY), false);
  assert.equal(values.has(LEGACY_LOCAL_STORAGE_KEY), false);
  assert.equal(loadPersistedLocalState(storage).reviewerNotes, '');
  values.set(LEGACY_LOCAL_STORAGE_KEY, JSON.stringify(previous));
  assert.throws(() => savePersistedLocalState({ ...storage, setItem: () => { throw new Error('Quota'); } }, previous));
  assert.equal(values.has(LEGACY_LOCAL_STORAGE_KEY), true);
  assert.equal(loadPersistedLocalState(() => { throw new Error('Storage disabled'); }).reviewerNotes, '');
});
