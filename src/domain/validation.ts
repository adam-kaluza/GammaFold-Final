import { computeDeterministicSummary } from './checks.ts';
import { REQUIRED_AUDIT_CLAIM_ID } from './packet.ts';
import type {
  EvidencePacket,
  FactAssertion,
  ReviewOutput,
  ValidationIssue,
  ValidationResult,
} from './types.ts';

function isNonEmptyString(val: unknown, maxLen = 2000): val is string {
  return typeof val === 'string' && val.trim().length > 0 && val.length <= maxLen;
}

function normalizeIdArray(val: unknown): string[] | null {
  if (!Array.isArray(val)) return null;
  const out: string[] = [];
  for (const item of val) {
    if (typeof item !== 'string' || item.trim().length === 0) return null;
    out.push(item.trim());
  }
  return out;
}

function getKnownIds(packet: EvidencePacket): Set<string> {
  return new Set([
    packet.roundId,
    REQUIRED_AUDIT_CLAIM_ID,
    ...packet.candidates.map((c) => c.id),
    ...packet.candidates.map((c) => c.sampleId),
    ...packet.observations.map((o) => o.id),
    ...packet.predictions.map((p) => p.id),
  ]);
}

function exactNumberEqual(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a === b;
}

export function validateFactAssertion(
  rawAssertion: unknown,
  packet: EvidencePacket,
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!rawAssertion || typeof rawAssertion !== 'object' || Array.isArray(rawAssertion)) {
    issues.push({
      code: 'ASSERTION_SCHEMA_INVALID',
      path,
      message: `${path} must be a structured assertion object.`,
    });
    return issues;
  }

  const a = rawAssertion as Record<string, unknown>;
  const recordId = typeof a.recordId === 'string' ? a.recordId.trim() : '';
  const field = a.field;
  const status = a.status;
  const qualifier = a.qualifier === 'none' ? null : a.qualifier;
  const value = a.value;
  const units = typeof a.units === 'string' ? a.units.trim() : '';

  if (field !== 'value' && field !== 'upperBound') {
    issues.push({
      code: 'ASSERTION_FIELD_INVALID',
      path,
      message: `${path}.field must be "value" or "upperBound".`,
    });
  }

  if (qualifier !== '=' && qualifier !== '<' && qualifier !== null) {
    issues.push({
      code: 'ASSERTION_QUALIFIER_INVALID',
      path,
      message: `${path}.qualifier must be "=", "<", "none", or null.`,
    });
  }

  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    issues.push({
      code: 'ASSERTION_VALUE_TYPE_INVALID',
      path,
      message: `${path}.value must be a finite number or null.`,
    });
  }

  const obs = packet.observations.find((o) => o.id === recordId);
  const pred = packet.predictions.find((p) => p.id === recordId);

  if (!obs && !pred) {
    issues.push({
      code: 'ASSERTION_UNKNOWN_RECORD',
      path,
      message: `${path}.recordId "${recordId}" must reference an exact observation (O01-O06) or prediction (P01-P06) record.`,
    });
    return issues;
  }

  if (obs) {
    if (status !== obs.status) {
      issues.push({
        code: 'ASSERTION_STATUS_MISMATCH',
        path,
        message: `${path} asserts status "${String(status)}" for ${obs.id}, but frozen record status is "${obs.status}".`,
      });
    }
    if (units !== obs.units) {
      issues.push({
        code: 'ASSERTION_UNITS_MISMATCH',
        path,
        message: `${path} asserts units "${units}" for ${obs.id}, expected "${obs.units}".`,
      });
    }

    if (obs.status === 'measured') {
      if (field !== 'value') {
        issues.push({
          code: 'ASSERTION_FIELD_MISMATCH',
          path,
          message: `Measured observation ${obs.id} must assert field "value".`,
        });
      }
      if (qualifier !== '=') {
        issues.push({
          code: 'ASSERTION_QUALIFIER_MISMATCH',
          path,
          message: `Measured observation ${obs.id} must assert qualifier "=".`,
        });
      }
      if (typeof value !== 'number' || obs.value === null || !exactNumberEqual(value, obs.value)) {
        issues.push({
          code: 'ASSERTION_VALUE_MISMATCH',
          path,
          message: `${path} asserts value ${String(value)} for ${obs.id}, but frozen ${obs.id}.value is ${String(obs.value)}.`,
        });
      }
    } else if (obs.status === 'censored') {
      if (field !== 'upperBound') {
        issues.push({
          code: 'CENSORED_AS_POINT_VALUE',
          path,
          message: `Censored observation ${obs.id} must assert field "upperBound", never exact point "value".`,
        });
      }
      if (qualifier !== '<') {
        issues.push({
          code: 'CENSORED_AS_POINT_VALUE',
          path,
          message: `Censored observation ${obs.id} must assert qualifier "<", never point equality.`,
        });
      }
      if (
        typeof value !== 'number' ||
        obs.upperBound === null ||
        !exactNumberEqual(value, obs.upperBound)
      ) {
        issues.push({
          code: 'ASSERTION_VALUE_MISMATCH',
          path,
          message: `${path} asserts upperBound ${String(value)} for ${obs.id}, expected ${String(obs.upperBound)}.`,
        });
      }
    } else {
      // failed or missing
      if (field !== 'value') {
        issues.push({
          code: 'ASSERTION_FIELD_MISMATCH',
          path,
          message: `Non-measured observation ${obs.id} (${obs.status}) must assert field "value" with null.`,
        });
      }
      if (qualifier !== null) {
        issues.push({
          code: 'NON_MEASURED_AS_MEASURED',
          path,
          message: `Non-measured observation ${obs.id} (${obs.status}) must have null/"none" qualifier.`,
        });
      }
      if (value !== null) {
        issues.push({
          code: 'NON_MEASURED_AS_MEASURED',
          path,
          message: `Non-measured observation ${obs.id} (${obs.status}) has null value, not ${String(value)}.`,
        });
      }
    }
  } else if (pred) {
    if (status !== 'prior_prediction') {
      issues.push({
        code: 'ASSERTION_STATUS_MISMATCH',
        path,
        message: `Prediction record ${pred.id} must assert status "prior_prediction", never "${String(status)}".`,
      });
    }
    if (field !== 'value') {
      issues.push({
        code: 'ASSERTION_FIELD_MISMATCH',
        path,
        message: `Prediction record ${pred.id} must assert field "value".`,
      });
    }
    if (qualifier !== '=') {
      issues.push({
        code: 'ASSERTION_QUALIFIER_MISMATCH',
        path,
        message: `Prediction record ${pred.id} must assert qualifier "=".`,
      });
    }
    if (units !== pred.units) {
      issues.push({
        code: 'ASSERTION_UNITS_MISMATCH',
        path,
        message: `${path} asserts units "${units}" for ${pred.id}, expected "${pred.units}".`,
      });
    }
    if (typeof value !== 'number' || !exactNumberEqual(value, pred.value)) {
      issues.push({
        code: 'ASSERTION_VALUE_MISMATCH',
        path,
        message: `${path} asserts value ${String(value)} for ${pred.id}, but frozen ${pred.id}.value is ${String(pred.value)}.`,
      });
    }
  }

  return issues;
}

/**
 * Computes strictly source-scoped allowed RFU numeric values and allowed count integers.
 * NEVER leaks values across sibling records of the same candidate (e.g., citing O01 never permits P01's 0.68).
 */
function getAllowedNumbersForSources(
  packet: EvidencePacket,
  sourceIds: readonly string[],
  options: { allowRoundSummaryCounts?: boolean; extraAllowedSlotCount?: number } = {},
): {
  allowedRfuNumbers: number[];
  allowedIntegers: Set<number>;
} {
  const sourceSet = new Set(sourceIds);
  const allowedRfuNumbers: number[] = [];
  const allowedIntegers = new Set<number>();
  const summary = computeDeterministicSummary(packet);

  for (const id of sourceSet) {
    const obs = packet.observations.find((o) => o.id === id);
    if (obs) {
      if (obs.status === 'measured' && obs.value !== null) {
        allowedRfuNumbers.push(obs.value);
        if (Number.isInteger(obs.value)) {
          allowedIntegers.add(obs.value);
        }
      }
      if (obs.status === 'censored' && obs.upperBound !== null) {
        allowedRfuNumbers.push(obs.upperBound);
      }
    }

    const pred = packet.predictions.find((p) => p.id === id);
    if (pred) {
      allowedRfuNumbers.push(pred.value);
    }
  }

  // Deltas are ONLY permitted when BOTH the measured O0x AND corresponding P0x are explicitly cited.
  for (const comp of summary.comparisons) {
    if (
      comp.comparable &&
      comp.delta !== null &&
      sourceSet.has(comp.observationId) &&
      sourceSet.has(comp.predictionId)
    ) {
      allowedRfuNumbers.push(comp.delta);
      allowedRfuNumbers.push(Math.abs(comp.delta));
    }
  }

  if (sourceSet.has(packet.roundId) || options.allowRoundSummaryCounts) {
    allowedIntegers.add(summary.totalCandidates); // 6
    allowedIntegers.add(summary.measured); // 3
    allowedIntegers.add(summary.nonMeasured); // 3
    allowedIntegers.add(summary.failed); // 1
    allowedIntegers.add(summary.missing); // 1
    allowedIntegers.add(summary.censored); // 1
    allowedIntegers.add(summary.validZeroCount); // 1
    allowedIntegers.add(summary.replicates); // 1
    allowedIntegers.add(summary.budgetSlots); // 4
  }

  if (options.allowRoundSummaryCounts) {
    for (const obs of packet.observations) {
      if (obs.status === 'measured' && obs.value !== null) {
        allowedRfuNumbers.push(obs.value);
        if (Number.isInteger(obs.value)) {
          allowedIntegers.add(obs.value);
        }
      }
      if (obs.status === 'censored' && obs.upperBound !== null) {
        allowedRfuNumbers.push(obs.upperBound);
      }
    }
    for (const pred of packet.predictions) {
      allowedRfuNumbers.push(pred.value);
    }
  }

  if (
    options.extraAllowedSlotCount !== undefined &&
    Number.isInteger(options.extraAllowedSlotCount)
  ) {
    allowedIntegers.add(options.extraAllowedSlotCount);
  }

  return { allowedRfuNumbers, allowedIntegers };
}

function stripKnownIdentifierTokens(text: string): string {
  return text
    .replace(/\b(?:SYNTH-PKT-R01|CAMP-SYNTH-R01|CAMP-SYNTH-R02-GATE|AUDIT-CLAIM-01|1UBQ)\b/g, ' [ID] ')
    .replace(/\b(?:[RCSOP]0[1-6]|R01)\b/g, ' [ID] ')
    .replace(/\b(?:SYN-SOL-0[1-6])\b/g, ' [ID] ')
    .replace(/\b(?:alpha|beta|gamma)-[12]\b/gi, ' [ID] ');
}

interface ExtractedNumericToken {
  raw: string;
  numericValue: number;
  isDecimal: boolean;
  decimalPlaces: number;
}

function extractStandaloneNumericTokens(text: string): ExtractedNumericToken[] {
  const scrubbed = stripKnownIdentifierTokens(text);
  const regex = /(?<![A-Za-z0-9_])-?\d+(?:\.\d+)?(?![A-Za-z0-9_])/g;
  const out: ExtractedNumericToken[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(scrubbed)) !== null) {
    const raw = match[0];
    const dotIdx = raw.indexOf('.');
    const isDecimal = dotIdx !== -1;
    const decimalPlaces = isDecimal ? raw.length - dotIdx - 1 : 0;
    out.push({
      raw,
      numericValue: Number(raw),
      isDecimal,
      decimalPlaces,
    });
  }
  return out;
}

function extractMentionedRecordIds(text: string): string[] {
  const matches = text.match(/\b[CSOP]0[1-6]\b/g);
  return matches ? Array.from(new Set(matches)) : [];
}

function hasInvalidUnitsInText(text: string): string | null {
  const badUnitMatch = text.match(
    /(?<![A-Za-z0-9_])-?\d+(?:\.\d+)?\s*(?:uM|µM|mM|nM|pM|mg\/mL|ug\/mL|µg\/mL|kcal\/mol|kDa|%|unitless)\b/i,
  );
  return badUnitMatch ? badUnitMatch[0] : null;
}

function hasInvalidReplicateClaim(text: string, expectedReplicates: number): string | null {
  const wordNumbers: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };

  if (/\b(?:duplicate|triplicate|quadruplicate|multiple\s+replicates)\b/i.test(text)) {
    return 'multiple/duplicate/triplicate replicates';
  }

  const numBeforeRep =
    /\b(\d+(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:synthetic\s+|independent\s+|technical\s+|biological\s+)?replicates?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = numBeforeRep.exec(text)) !== null) {
    const tok = m[1].toLowerCase();
    const val = tok in wordNumbers ? wordNumbers[tok] : Number(tok);
    // Allow negated statements like "no 2 replicates" only if preceded immediately by "no"/"not"; otherwise require exact match.
    const prefix = text.slice(Math.max(0, m.index - 12), m.index);
    if (!/\b(?:no|not)\s*$/i.test(prefix) && val !== expectedReplicates) {
      return m[0];
    }
  }

  const repEquals = /\breplicates?\s*(?:=|:|of|is|are|was|were)\s*(\d+(?:\.\d+)?)/gi;
  while ((m = repEquals.exec(text)) !== null) {
    if (Number(m[1]) !== expectedReplicates) {
      return m[0];
    }
  }

  return null;
}

const NUMBER_WORDS_MAP: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function findConflictingSlotMentionInAction(purpose: string, assaySlots: number): string | null {
  const slotPatterns = [
    /\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:[a-z-]+\s+){0,2}(?:slots?|allocations?)\b/gi,
    /\b(?:allocate|propose|assign|request|reserve)\s+(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,
  ];

  for (const pat of slotPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(purpose)) !== null) {
      const rawTok = m[1].toLowerCase();
      const parsed = rawTok in NUMBER_WORDS_MAP ? NUMBER_WORDS_MAP[rawTok] : Number(rawTok);
      if (Number.isFinite(parsed) && parsed !== assaySlots) {
        return m[0];
      }
    }
  }
  return null;
}

/**
 * Clause-scoped and copula-aware statistical / efficacy / commercial overclaim check.
 * Neutralizes data-status negations (e.g. "not missing", "not received", "no point value")
 * so unrelated negations can NEVER mask an affirmative statistical or efficacy claim.
 */
export function hasProhibitedStatisticalOrEfficacyClaim(text: string): boolean {
  // 1. Direct affirmative predicate before statistical significance or clinical/efficacy claims is ALWAYS disallowed
  // (unless preceded by "neither ... nor").
  const affirmativeCopulaPattern =
    /\b(?:is|are|was|were|becomes?|remains?|appears?|proves?|shows?|demonstrates?|indicates?|confirms?|establishes?)\s+(?:(?:also|highly|very|clearly|truly|statistically|clinically)\s+)*(?:statistically\s+significant|statistical\s+significance|clinically\s+validated|clinical\s+efficacy|therapeutic\s+efficacy|proven\s+savings|guaranteed\s+binding)\b/i;

  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (affirmativeCopulaPattern.test(sentence) && !/\bneither\b[\s\S]*\bnor\b/i.test(sentence)) {
      return true;
    }

    // Neutralize packet-status negations that do NOT negate statistical or efficacy claims.
    const statusNeutralized = sentence
      .replace(
        /\bnot\s+(?:missing|received|failed|censored|measured|coerced|dropped|zero|null|empty|available\s+for|a\s+measurement|a\s+measured|a\s+point|an\s+exact)\b/gi,
        'status_flag',
      )
      .replace(
        /\bno\s+(?:point\s+value|exact\s+point|missing\s+data|numeric\s+point|observations?)\b/gi,
        'status_flag',
      );

    // Split coordinated independent predicates such as "... and is ...", "...; ...", "... but ...".
    const clauses = statusNeutralized.split(
      /[;:]|\b(?:but|yet|whereas|while|although|though)\b|\band\s+(?=(?:is|are|was|were|has|have|had|shows?|proves?|demonstrates?|achieves?|yields?|C0|O0|P0|S0|it|they|this)\b)/i,
    );

    const numericPValuePattern = /\bp\s*[<>=]\s*0?\.\d+/i;
    const overclaimTermsPattern =
      /\b(?:p-values?|confidence\s+intervals?|95%\s*ci|statistically\s+significant|statistical\s+significance|clinically\s+validated|clinical\s+efficacy|therapeutic\s+efficacy|binding\s+affinity|proven\s+savings|exclusive\s+moat|guaranteed\s+binding)\b/i;

    const validStatisticalCaveatPattern =
      /\b(?:no|not|never|neither|cannot|can't|without|lack(?:s|ing)?|prevent(?:s|ing)?|preclud(?:es?|ing)|unsupported|unavailable|impossible|disallowed|prohibited|unverified|uncalibrated|invalid|exclude[sd]?)\b/i;

    for (const clause of clauses) {
      if (numericPValuePattern.test(clause) && !validStatisticalCaveatPattern.test(clause)) {
        return true;
      }
      if (overclaimTermsPattern.test(clause) && !validStatisticalCaveatPattern.test(clause)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Rejects presenting non-measured candidates/observations/samples (C03/O03/S03 failed, C04/O04/S04 missing, C05/O05/S05 censored)
 * as having a measured point value. Unrelated status words like "(failed)" or "not missing" do NOT suppress affirmative measurement verbs.
 */
export function claimsNonMeasuredHasNumericMeasurement(text: string): boolean {
  const clauses = text.split(/[.;:!?]|\b(?:whereas|while|but|yet|although)\b/i);

  // Affirmative measurement verb attributed to C03-C05 / O03-O05 / S03-S05 without direct verb negation ("did not", "was not", "never", "not")
  // and without an intervening P03-P05 subject or "<" censoring qualifier.
  const directMeasurementVerb =
    /\b(?:O0[345]|C0[345]|S0[345])\b(?![^,\n]{0,40}\bP0[1-6]\b)[^,\n]{0,35}?\b(?<!(?:not|never|cannot)\s)(?<!(?:did|was|were|is|are)\s+not\s)(?:measured|achieved|recorded|observed|yielded|scored)\b(?![^,\n]{0,20}(?:<|below|less\s+than|left-censored|censored|null))[^,\n]{0,25}?-?\d+(?:\.\d+)?/i;

  // Equality or direct numeric assignment to failed/missing O03/O04/C03/C04/S03/S04
  const failedMissingDirectValue =
    /\b(?:O0[34]|C0[34]|S0[34])\s*(?:=|:|\bis\b|\bwas\b|\bof\b|\()\s*-?\d+(?:\.\d+)?\s*(?:RFU)?/i;

  for (const clause of clauses) {
    if (directMeasurementVerb.test(clause)) {
      return true;
    }
    if (failedMissingDirectValue.test(clause)) {
      return true;
    }
  }

  return false;
}

export function claimsCensoredAsExactPointValue(
  text: string,
  sourceIds: readonly string[],
): boolean {
  const touchesC05 =
    sourceIds.includes('O05') ||
    sourceIds.includes('C05') ||
    sourceIds.includes('S05') ||
    /\b(?:O05|C05|S05)\b/.test(text);
  if (!touchesC05) return false;

  // Direct point assignment on O05/C05 such as "O05 = 0.10" or "O05 of 0.10 RFU" without "<"
  if (/\b(?:O05|C05|S05)\s*(?:=|\bis\b|\bwas\b|\bof\b)\s*0\.10?\b/i.test(text)) {
    return true;
  }

  const clauses = text.split(/[.;:!?]/);
  for (const clause of clauses) {
    if (!/\b(?:O05|C05|S05)\b/.test(clause)) continue;
    if (!/(?<![A-Za-z0-9_])0\.10?(?![A-Za-z0-9_])/.test(clause)) continue;
    const hasCensoringQualifier =
      /(?:<|below|under|less\s+than|upper\s+bound|censored|lloq|lod)/i.test(clause);
    if (!hasCensoringQualifier) {
      return true;
    }
  }

  return false;
}

/**
 * Checks direct record-to-value bindings in prose so e.g. "O01 measured 0.68 RFU" or "O01 = 0.68 RFU"
 * fails even when P01 (0.68) is also cited in sourceIds.
 */
function findDirectRecordValueMisattribution(
  text: string,
  packet: EvidencePacket,
): string | null {
  // Check explicit O01-O06 direct bindings
  const obsBindingRegex =
    /\b(O0[1-6])\b(?:\s*\([CS]0[1-6](?:\/[CS]0[1-6])?\))?\s*(?:=|:|\bis\b|\bwas\b|\bof\b|\bmeasured(?:\s+at|\s+a\s+valid\s+zero\s+of)?\b|\brecorded(?:\s+a\s+valid\s+measured\s+zero\s+in)?\b|\bachieved\b|\byielded\b|\bobserved(?:\s+at)?\b|\(\s*|(?=<))\s*(<\s*)?(-?\d+(?:\.\d+)?)/gi;

  let m: RegExpExecArray | null;
  while ((m = obsBindingRegex.exec(text)) !== null) {
    const obsId = m[1].toUpperCase();
    const ltToken = m[2];
    const numVal = Number(m[3]);
    const obs = packet.observations.find((o) => o.id === obsId);
    if (!obs) continue;

    if (obs.status === 'measured') {
      if (ltToken || obs.value === null || !exactNumberEqual(numVal, obs.value)) {
        return `${obsId} paired with ${ltToken ?? ''}${m[3]} (expected = ${obs.value})`;
      }
    } else if (obs.status === 'censored') {
      if (!ltToken || obs.upperBound === null || !exactNumberEqual(numVal, obs.upperBound)) {
        return `${obsId} paired with ${ltToken ?? ''}${m[3]} (expected < ${obs.upperBound})`;
      }
    } else {
      return `${obsId} (${obs.status}) paired with numeric value ${m[3]} (expected null)`;
    }
  }

  // Check explicit P01-P06 direct bindings
  const predBindingRegex =
    /\b(P0[1-6])\b\s*(?:=|:|\bis\b|\bwas\b|\bof\b|\(\s*)\s*(-?\d+(?:\.\d+)?)/gi;
  while ((m = predBindingRegex.exec(text)) !== null) {
    const predId = m[1].toUpperCase();
    const numVal = Number(m[2]);
    const pred = packet.predictions.find((p) => p.id === predId);
    if (pred && !exactNumberEqual(numVal, pred.value)) {
      return `${predId} paired with ${m[2]} (expected ${pred.value})`;
    }
  }

  // Check C01-C06 / S01-S06 direct measurement verb bindings (when no O0x/P0x intervenes)
  const candMeasureRegex =
    /\b([CS]0[1-6])\b(?![^.;,\n]{0,30}\b[OP]0[1-6]\b)\s+(?:measured|achieved|recorded|observed|yielded)\s+(?:a\s+(?:valid\s+)?(?:measured\s+)?(?:zero\s+|score\s+|value\s+)?(?:of\s+)?)?(-?\d+(?:\.\d+)?)/gi;
  while ((m = candMeasureRegex.exec(text)) !== null) {
    const rawId = m[1].toUpperCase();
    const numVal = Number(m[2]);
    const cand = packet.candidates.find((c) => c.id === rawId || c.sampleId === rawId);
    if (!cand) continue;
    const obs = packet.observations.find((o) => o.candidateId === cand.id);
    if (!obs || obs.status !== 'measured' || obs.value === null || !exactNumberEqual(numVal, obs.value)) {
      return `${rawId} measurement verb paired with ${m[2]} (expected ${obs?.status === 'measured' ? obs.value : 'non-measured null'})`;
    }
  }

  return null;
}

export function validateReviewOutput(
  candidateOutput: unknown,
  packet: EvidencePacket,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  let schemaValid = true;
  let structuredAssertionsValid = true;
  let allIdsValid = true;
  let budgetValid = true;
  let narrativeScreeningValid = true;
  let auditRefutedValid = true;
  let statisticalClaimGuardValid = true;

  if (!candidateOutput || typeof candidateOutput !== 'object' || Array.isArray(candidateOutput)) {
    return {
      valid: false,
      status: 'validation_failed',
      issues: [{ code: 'SCHEMA_INVALID', message: 'Model output must be a JSON object.' }],
      budgetUsed: 0,
      budgetLimit: packet.nextRoundBudgetSlots,
      checks: {
        schemaValid: false,
        structuredAssertionsValid: false,
        allIdsValid: false,
        budgetValid: false,
        narrativeScreeningValid: false,
        auditRefutedValid: false,
        statisticalClaimGuardValid: false,
        modelIdentityValid: true,
      },
    };
  }

  const obj = candidateOutput as Record<string, unknown>;
  const knownIds = getKnownIds(packet);
  const candidateIdSet = new Set(packet.candidates.map((c) => c.id));

  const screenProseSection = (
    text: string,
    sourceIds: readonly string[],
    path: string,
    opts: {
      requireExplicitSourcesForNumbers: boolean;
      requireMentionedRecordsCited: boolean;
      allowRoundSummaryCounts: boolean;
      checkPositiveRecordAttribution: boolean;
      extraAllowedSlotCount?: number;
    },
  ) => {
    const badUnit = hasInvalidUnitsInText(text);
    if (badUnit) {
      narrativeScreeningValid = false;
      issues.push({
        code: 'INVALID_UNITS',
        path,
        message: `Unsupported unit expression "${badUnit}" in ${path}; packet values use "${packet.units}".`,
      });
    }

    const badRep = hasInvalidReplicateClaim(text, packet.replicates);
    if (badRep) {
      narrativeScreeningValid = false;
      statisticalClaimGuardValid = false;
      issues.push({
        code: 'UNSUPPORTED_REPLICATE_CLAIM',
        path,
        message: `Unsupported replicate claim "${badRep}" in ${path}; frozen packet has replicates = ${packet.replicates}.`,
      });
    }

    if (opts.requireMentionedRecordsCited) {
      const mentionedIds = extractMentionedRecordIds(text);
      const citedSet = new Set(sourceIds);
      for (const mid of mentionedIds) {
        if (!citedSet.has(mid)) {
          allIdsValid = false;
          narrativeScreeningValid = false;
          issues.push({
            code: 'UNCITED_RECORD_REFERENCE',
            path,
            message: `${path} references record "${mid}" in prose without citing "${mid}" in sourceIds.`,
          });
        }
      }
    }

    if (hasProhibitedStatisticalOrEfficacyClaim(text)) {
      statisticalClaimGuardValid = false;
      issues.push({
        code: 'UNSUPPORTED_STATISTICS',
        path,
        message: `${path} asserts unsupported statistical significance, p-value, confidence interval, or unverified biological/commercial claim.`,
      });
    }

    if (opts.checkPositiveRecordAttribution) {
      if (claimsNonMeasuredHasNumericMeasurement(text)) {
        narrativeScreeningValid = false;
        issues.push({
          code: 'NON_MEASURED_AS_MEASURED',
          path,
          message: `${path} treats a non-measured candidate/observation (failed, missing, or censored) as having an exact measured value.`,
        });
      }

      if (claimsCensoredAsExactPointValue(text, sourceIds)) {
        narrativeScreeningValid = false;
        issues.push({
          code: 'CENSORED_AS_POINT_VALUE',
          path,
          message: `${path} collapses left-censored O05 (< 0.10 RFU) into an exact point value without censoring qualifier.`,
        });
      }

      const misattr = findDirectRecordValueMisattribution(text, packet);
      if (misattr) {
        narrativeScreeningValid = false;
        issues.push({
          code: 'RECORD_VALUE_MISMATCH',
          path,
          message: `Record-to-value misattribution in ${path}: ${misattr}.`,
        });
      }
    } else {
      // Even in audit correction, censored O05 must not be collapsed to an unqualified point value.
      if (claimsCensoredAsExactPointValue(text, sourceIds)) {
        narrativeScreeningValid = false;
        issues.push({
          code: 'CENSORED_AS_POINT_VALUE',
          path,
          message: `${path} collapses left-censored O05 (< 0.10 RFU) into an exact point value.`,
        });
      }
    }

    const tokens = extractStandaloneNumericTokens(text);
    if (tokens.length === 0) return;

    if (opts.requireExplicitSourcesForNumbers && sourceIds.length === 0) {
      narrativeScreeningValid = false;
      issues.push({
        code: 'UNCITED_NUMERIC_CLAIM',
        path,
        message: `Numeric claim in ${path} must cite at least one source record ID.`,
      });
      return;
    }

    const { allowedRfuNumbers, allowedIntegers } = getAllowedNumbersForSources(packet, sourceIds, {
      allowRoundSummaryCounts: opts.allowRoundSummaryCounts,
      extraAllowedSlotCount: opts.extraAllowedSlotCount,
    });

    // Check any number directly followed by RFU: must match an allowed RFU value (never a candidate/slot count).
    const rfuBoundRegex = /(?<![A-Za-z0-9_])(-?\d+(?:\.\d+)?)\s*RFU\b/gi;
    let rfuMatch: RegExpExecArray | null;
    while ((rfuMatch = rfuBoundRegex.exec(text)) !== null) {
      const rfuVal = Number(rfuMatch[1]);
      if (!allowedRfuNumbers.some((v) => exactNumberEqual(v, rfuVal))) {
        narrativeScreeningValid = false;
        issues.push({
          code: 'UNGROUNDED_NUMERIC_CLAIM',
          path,
          message: `RFU value "${rfuMatch[1]} RFU" in ${path} is not grounded in the exact cited observation/prediction records [${sourceIds.join(', ')}].`,
        });
      }
    }

    for (const tok of tokens) {
      if (tok.isDecimal && tok.decimalPlaces > 2) {
        narrativeScreeningValid = false;
        issues.push({
          code: 'UNSUPPORTED_NUMERIC_PRECISION',
          path,
          message: `Decimal token "${tok.raw}" in ${path} exceeds 2-decimal packet precision; rounding is disallowed.`,
        });
        continue;
      }

      if (tok.isDecimal) {
        const matched = allowedRfuNumbers.some((v) => exactNumberEqual(v, tok.numericValue));
        if (!matched) {
          narrativeScreeningValid = false;
          issues.push({
            code: 'UNGROUNDED_NUMERIC_CLAIM',
            path,
            message: `Decimal value "${tok.raw}" in ${path} is not present in exact cited sources [${sourceIds.join(', ')}].`,
          });
        }
      } else {
        // Standalone integer token
        const matchedInt = allowedIntegers.has(tok.numericValue);
        if (!matchedInt) {
          narrativeScreeningValid = false;
          issues.push({
            code: 'UNGROUNDED_NUMERIC_CLAIM',
            path,
            message: `Integer value "${tok.raw}" in ${path} is not grounded in cited sources [${sourceIds.join(', ')}].`,
          });
        }
      }
    }
  };

  if (!isNonEmptyString(obj.summary, 2000)) {
    schemaValid = false;
    issues.push({
      code: 'SCHEMA_SUMMARY',
      path: 'summary',
      message: 'Summary must be a non-empty string within length bounds.',
    });
  }

  if (!Array.isArray(obj.evidenceFindings) || obj.evidenceFindings.length === 0) {
    schemaValid = false;
    issues.push({
      code: 'SCHEMA_FINDINGS',
      path: 'evidenceFindings',
      message: 'evidenceFindings must be a non-empty array.',
    });
  }

  if (!Array.isArray(obj.limitations) || obj.limitations.length === 0) {
    schemaValid = false;
    issues.push({
      code: 'SCHEMA_LIMITATIONS',
      path: 'limitations',
      message: 'limitations must be a non-empty array.',
    });
  }

  if (!Array.isArray(obj.proposedActions) || obj.proposedActions.length === 0) {
    schemaValid = false;
    issues.push({
      code: 'SCHEMA_ACTIONS',
      path: 'proposedActions',
      message: 'proposedActions must be a non-empty array.',
    });
  }

  const audit = obj.unsupportedClaimAudit as Record<string, unknown> | undefined;
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    schemaValid = false;
    auditRefutedValid = false;
    issues.push({
      code: 'SCHEMA_AUDIT',
      path: 'unsupportedClaimAudit',
      message: 'unsupportedClaimAudit object is required.',
    });
  }

  const verifyIds = (ids: string[], path: string, requireNonEmpty: boolean) => {
    if (requireNonEmpty && ids.length === 0) {
      schemaValid = false;
      issues.push({
        code: 'MISSING_CITATIONS',
        path,
        message: `${path} must cite at least one source ID.`,
      });
    }
    for (const id of ids) {
      if (!knownIds.has(id)) {
        allIdsValid = false;
        issues.push({
          code: 'UNKNOWN_SOURCE_ID',
          path,
          message: `Unknown source ID "${id}" in ${path}.`,
        });
      }
    }
  };

  if (typeof obj.summary === 'string') {
    screenProseSection(obj.summary, [packet.roundId], 'summary', {
      requireExplicitSourcesForNumbers: false,
      requireMentionedRecordsCited: false,
      allowRoundSummaryCounts: true,
      checkPositiveRecordAttribution: true,
    });
  }

  if (Array.isArray(obj.evidenceFindings)) {
    obj.evidenceFindings.forEach((rawFinding, idx) => {
      const path = `evidenceFindings[${idx}]`;
      if (!rawFinding || typeof rawFinding !== 'object' || Array.isArray(rawFinding)) {
        schemaValid = false;
        issues.push({ code: 'SCHEMA_FINDING_ITEM', path, message: 'Finding must be an object.' });
        return;
      }
      const f = rawFinding as Record<string, unknown>;
      if (!isNonEmptyString(f.claim, 1000)) {
        schemaValid = false;
        issues.push({
          code: 'SCHEMA_FINDING_CLAIM',
          path,
          message: 'Finding claim must be non-empty text.',
        });
      }
      const ids = normalizeIdArray(f.sourceIds);
      if (!ids) {
        schemaValid = false;
        issues.push({
          code: 'SCHEMA_FINDING_IDS',
          path,
          message: 'Finding sourceIds must be a string array.',
        });
        return;
      }
      verifyIds(ids, `${path}.sourceIds`, true);

      if (!Array.isArray(f.assertions) || f.assertions.length === 0) {
        schemaValid = false;
        structuredAssertionsValid = false;
        issues.push({
          code: 'MISSING_STRUCTURED_ASSERTIONS',
          path: `${path}.assertions`,
          message: `${path} must include at least one structured record/field/status/qualifier/value/units assertion.`,
        });
      } else {
        const citedSet = new Set(ids);
        f.assertions.forEach((rawAssertion, aIdx) => {
          const aPath = `${path}.assertions[${aIdx}]`;
          const aIssues = validateFactAssertion(rawAssertion, packet, aPath);
          if (aIssues.length > 0) {
            structuredAssertionsValid = false;
            issues.push(...aIssues);
          } else {
            const assertedRecordId = (rawAssertion as FactAssertion).recordId.trim();
            if (!citedSet.has(assertedRecordId)) {
              allIdsValid = false;
              structuredAssertionsValid = false;
              issues.push({
                code: 'ASSERTION_RECORD_NOT_CITED',
                path: aPath,
                message: `${aPath} asserts "${assertedRecordId}" without citing "${assertedRecordId}" in ${path}.sourceIds.`,
              });
            }
          }
        });
      }

      if (typeof f.claim === 'string') {
        screenProseSection(f.claim, ids, path, {
          requireExplicitSourcesForNumbers: true,
          requireMentionedRecordsCited: true,
          allowRoundSummaryCounts: false,
          checkPositiveRecordAttribution: true,
        });
      }
    });
  }

  if (Array.isArray(obj.limitations)) {
    obj.limitations.forEach((rawLim, idx) => {
      const path = `limitations[${idx}]`;
      if (!rawLim || typeof rawLim !== 'object' || Array.isArray(rawLim)) {
        schemaValid = false;
        issues.push({
          code: 'SCHEMA_LIMITATION_ITEM',
          path,
          message: 'Limitation must be an object.',
        });
        return;
      }
      const l = rawLim as Record<string, unknown>;
      if (!isNonEmptyString(l.note, 1000)) {
        schemaValid = false;
        issues.push({
          code: 'SCHEMA_LIMITATION_NOTE',
          path,
          message: 'Limitation note must be non-empty text.',
        });
      }
      const ids = normalizeIdArray(l.sourceIds);
      if (!ids) {
        schemaValid = false;
        issues.push({
          code: 'SCHEMA_LIMITATION_IDS',
          path,
          message: 'Limitation sourceIds must be a string array.',
        });
        return;
      }
      verifyIds(ids, `${path}.sourceIds`, true);
      if (typeof l.note === 'string') {
        screenProseSection(l.note, ids, path, {
          requireExplicitSourcesForNumbers: true,
          requireMentionedRecordsCited: true,
          allowRoundSummaryCounts: false,
          checkPositiveRecordAttribution: true,
        });
      }
    });
  }

  let budgetUsed = 0;
  const seenActionCandidates = new Set<string>();
  if (Array.isArray(obj.proposedActions)) {
    obj.proposedActions.forEach((rawAct, idx) => {
      const path = `proposedActions[${idx}]`;
      if (!rawAct || typeof rawAct !== 'object' || Array.isArray(rawAct)) {
        schemaValid = false;
        issues.push({
          code: 'SCHEMA_ACTION_ITEM',
          path,
          message: 'Proposed action must be an object.',
        });
        return;
      }
      const a = rawAct as Record<string, unknown>;
      const validCand = typeof a.candidateId === 'string' && candidateIdSet.has(a.candidateId);
      if (!validCand) {
        allIdsValid = false;
        issues.push({
          code: 'INVALID_CANDIDATE_ID',
          path,
          message: `Proposed action candidateId "${String(a.candidateId)}" is not a valid packet candidate (C01-C06).`,
        });
      } else if (seenActionCandidates.has(a.candidateId as string)) {
        budgetValid = false;
        issues.push({
          code: 'DUPLICATE_ACTION_CANDIDATE',
          path,
          message: `Duplicate proposedAction for candidate "${a.candidateId as string}"; combine slots into one entry per candidate.`,
        });
      } else {
        seenActionCandidates.add(a.candidateId as string);
      }

      if (!isNonEmptyString(a.purpose, 800)) {
        schemaValid = false;
        issues.push({
          code: 'SCHEMA_ACTION_PURPOSE',
          path,
          message: 'Proposed action purpose must be non-empty.',
        });
      }

      const validSlots =
        typeof a.assaySlots === 'number' &&
        Number.isInteger(a.assaySlots) &&
        a.assaySlots >= 1;

      if (!validSlots) {
        schemaValid = false;
        budgetValid = false;
        issues.push({
          code: 'INVALID_ASSAY_SLOTS',
          path,
          message: 'Proposed action assaySlots must be a positive integer >= 1.',
        });
      } else {
        budgetUsed += a.assaySlots as number;
      }

      const ids = normalizeIdArray(a.sourceIds);
      if (!ids) {
        schemaValid = false;
        issues.push({
          code: 'SCHEMA_ACTION_IDS',
          path,
          message: 'Action sourceIds must be a string array.',
        });
      } else {
        verifyIds(ids, `${path}.sourceIds`, true);
        if (validCand && !ids.includes(a.candidateId as string)) {
          allIdsValid = false;
          issues.push({
            code: 'ACTION_CANDIDATE_NOT_CITED',
            path: `${path}.sourceIds`,
            message: `${path}.sourceIds must include its target candidateId "${a.candidateId as string}".`,
          });
        }

        if (typeof a.purpose === 'string') {
          if (validSlots) {
            const conflict = findConflictingSlotMentionInAction(
              a.purpose,
              a.assaySlots as number,
            );
            if (conflict) {
              budgetValid = false;
              narrativeScreeningValid = false;
              issues.push({
                code: 'ACTION_SLOT_PROSE_CONFLICT',
                path: `${path}.purpose`,
                message: `${path}.purpose mentions "${conflict}" which conflicts with structured assaySlots = ${String(a.assaySlots)}.`,
              });
            }
          }

          screenProseSection(a.purpose, ids, path, {
            requireExplicitSourcesForNumbers: true,
            requireMentionedRecordsCited: true,
            allowRoundSummaryCounts: false,
            checkPositiveRecordAttribution: true,
            extraAllowedSlotCount: validSlots ? (a.assaySlots as number) : undefined,
          });
        }
      }
    });
  }

  if (budgetUsed < 1 || budgetUsed > packet.nextRoundBudgetSlots) {
    budgetValid = false;
    issues.push({
      code: 'BUDGET_EXCEEDED',
      path: 'proposedActions',
      message: `Total proposed assaySlots (${budgetUsed}) must be an integer sum between 1 and ${packet.nextRoundBudgetSlots}.`,
    });
  }

  if (audit && typeof audit === 'object' && !Array.isArray(audit)) {
    const auditId = typeof audit.auditId === 'string' ? audit.auditId.trim() : '';
    if (auditId !== REQUIRED_AUDIT_CLAIM_ID) {
      schemaValid = false;
      auditRefutedValid = false;
      issues.push({
        code: 'AUDIT_ID_MISMATCH',
        path: 'unsupportedClaimAudit.auditId',
        message: `unsupportedClaimAudit.auditId must equal "${REQUIRED_AUDIT_CLAIM_ID}".`,
      });
    }

    const normalizedSuppliedClaim =
      typeof audit.claimToCheck === 'string'
        ? audit.claimToCheck.trim().replace(/\s+/g, ' ')
        : '';
    const normalizedPacketClaim = packet.claimToCheck.trim().replace(/\s+/g, ' ');

    if (normalizedSuppliedClaim !== normalizedPacketClaim) {
      auditRefutedValid = false;
      issues.push({
        code: 'AUDIT_CLAIM_MISMATCH',
        path: 'unsupportedClaimAudit.claimToCheck',
        message: 'unsupportedClaimAudit.claimToCheck must match the exact packet.claimToCheck.',
      });
    }

    if (audit.verdict !== 'unsupported' && audit.verdict !== 'contradicted') {
      schemaValid = false;
      auditRefutedValid = false;
      issues.push({
        code: 'SCHEMA_AUDIT_VERDICT',
        path: 'unsupportedClaimAudit.verdict',
        message: 'unsupportedClaimAudit.verdict must be "unsupported" or "contradicted".',
      });
    }

    const auditIds = normalizeIdArray(audit.sourceIds);
    if (!auditIds) {
      schemaValid = false;
      auditRefutedValid = false;
      issues.push({
        code: 'SCHEMA_AUDIT_IDS',
        path: 'unsupportedClaimAudit.sourceIds',
        message: 'unsupportedClaimAudit.sourceIds must be a string array.',
      });
    } else {
      verifyIds(auditIds, 'unsupportedClaimAudit.sourceIds', true);
      const requiredAuditSources = ['O03', 'P03', 'O04', 'O05'];
      for (const reqId of requiredAuditSources) {
        if (!auditIds.includes(reqId)) {
          auditRefutedValid = false;
          issues.push({
            code: 'AUDIT_MISSING_KEY_CITATIONS',
            path: 'unsupportedClaimAudit.sourceIds',
            message: `unsupportedClaimAudit.sourceIds must cite "${reqId}" to ground the refutation of ${REQUIRED_AUDIT_CLAIM_ID}.`,
          });
        }
      }
    }

    if (!Array.isArray(audit.assertions) || audit.assertions.length < 2) {
      schemaValid = false;
      structuredAssertionsValid = false;
      auditRefutedValid = false;
      issues.push({
        code: 'AUDIT_MISSING_ASSERTIONS',
        path: 'unsupportedClaimAudit.assertions',
        message: 'unsupportedClaimAudit.assertions must include structured assertions for at least O03 and P03.',
      });
    } else {
      const assertedAuditRecords = new Set<string>();
      audit.assertions.forEach((rawAssertion, aIdx) => {
        const aPath = `unsupportedClaimAudit.assertions[${aIdx}]`;
        const aIssues = validateFactAssertion(rawAssertion, packet, aPath);
        if (aIssues.length > 0) {
          structuredAssertionsValid = false;
          auditRefutedValid = false;
          issues.push(...aIssues);
        } else {
          const recId = (rawAssertion as FactAssertion).recordId.trim();
          assertedAuditRecords.add(recId);
          if (auditIds && !auditIds.includes(recId)) {
            allIdsValid = false;
            auditRefutedValid = false;
            issues.push({
              code: 'ASSERTION_RECORD_NOT_CITED',
              path: aPath,
              message: `${aPath} asserts "${recId}" without citing "${recId}" in unsupportedClaimAudit.sourceIds.`,
            });
          }
        }
      });

      if (!assertedAuditRecords.has('O03') || !assertedAuditRecords.has('P03')) {
        auditRefutedValid = false;
        issues.push({
          code: 'AUDIT_MISSING_REQUIRED_ASSERTIONS',
          path: 'unsupportedClaimAudit.assertions',
          message: 'unsupportedClaimAudit.assertions must include verified assertions for both O03 (failed) and P03 (prior_prediction 0.91 RFU).',
        });
      }
    }

    if (!isNonEmptyString(audit.correction, 1200)) {
      schemaValid = false;
      auditRefutedValid = false;
      issues.push({
        code: 'SCHEMA_AUDIT_CORRECTION',
        path: 'unsupportedClaimAudit.correction',
        message: 'unsupportedClaimAudit.correction must be non-empty.',
      });
    } else {
      const corr = audit.correction;
      const dismissiveAffirmative =
        /\b(?:everything\s+is\s+fine|claim\s+is\s+(?:true|valid|correct|accurate|supported)|all\s+good|no\s+issues?\s+found)\b/i.test(
          corr,
        );
      const addressesC03FailureAndPrior =
        /\bO03\b/.test(corr) &&
        /\bP03\b/.test(corr) &&
        /\b(?:failed|null|qc)\b/i.test(corr) &&
        /\b(?:prior|prediction|pre-outcome)\b/i.test(corr) &&
        /\b0\.91\b/.test(corr);
      const addressesIncompleteMeasurement =
        /\b(?:only\s+(?:three|3)|3\s+(?:of|out\s+of)\s+6|three\s+(?:of|out\s+of)\s+(?:the\s+)?six)\b/i.test(
          corr,
        ) ||
        (/\bO04\b/.test(corr) &&
          /\bmissing\b/i.test(corr) &&
          /\bO05\b/.test(corr) &&
          /\bcensored\b/i.test(corr));

      if (dismissiveAffirmative || !addressesC03FailureAndPrior || !addressesIncompleteMeasurement) {
        auditRefutedValid = false;
        issues.push({
          code: 'AUDIT_CORRECTION_INSUFFICIENT',
          path: 'unsupportedClaimAudit.correction',
          message:
            'unsupportedClaimAudit.correction must substantively refute both halves of AUDIT-CLAIM-01 (identifying P03 = 0.91 RFU as a prior prediction while O03 failed QC, and noting non-measured O04/O05 leaving only 3 of 6 measured).',
        });
      }

      if (auditIds) {
        screenProseSection(corr, auditIds, 'unsupportedClaimAudit.correction', {
          requireExplicitSourcesForNumbers: true,
          requireMentionedRecordsCited: true,
          allowRoundSummaryCounts: true,
          checkPositiveRecordAttribution: false,
        });
      }
    }
  }

  const valid =
    schemaValid &&
    structuredAssertionsValid &&
    allIdsValid &&
    budgetValid &&
    narrativeScreeningValid &&
    auditRefutedValid &&
    statisticalClaimGuardValid &&
    issues.length === 0;

  return {
    valid,
    status: valid ? 'validated' : 'validation_failed',
    issues,
    budgetUsed,
    budgetLimit: packet.nextRoundBudgetSlots,
    checks: {
      schemaValid,
      structuredAssertionsValid,
      allIdsValid,
      budgetValid,
      narrativeScreeningValid,
      auditRefutedValid,
      statisticalClaimGuardValid,
      modelIdentityValid: true,
    },
  };
}

export function applyModelIdentityQuarantine(
  baseValidation: ValidationResult,
  returnedModelVersion: string | null,
  isMismatch: boolean,
): ValidationResult {
  if (!isMismatch) {
    return baseValidation;
  }

  const mismatchIssue: ValidationIssue = {
    code: 'MODEL_IDENTITY_MISMATCH',
    path: 'returnedModelVersion',
    message: `Provider reported disallowed or non-Carbon modelVersion "${returnedModelVersion ?? 'unknown'}"; output is quarantined and runtimeAccessProven is false.`,
  };

  return {
    ...baseValidation,
    valid: false,
    status: 'validation_failed',
    issues: [mismatchIssue, ...baseValidation.issues],
    checks: {
      ...baseValidation.checks,
      modelIdentityValid: false,
    },
  };
}

export function isValidReviewOutput(
  candidateOutput: unknown,
  packet: EvidencePacket,
): candidateOutput is ReviewOutput {
  return validateReviewOutput(candidateOutput, packet).valid;
}
