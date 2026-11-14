import type { ValidationResult } from '../domain/types.ts';

interface ValidationSummaryCardProps {
  validation: ValidationResult;
}

export function ValidationSummaryCard({ validation }: ValidationSummaryCardProps) {
  const rows = [
    {
      label: 'Structured JSON schema (3.0.0) & length bounds',
      ok: validation.checks.schemaValid,
    },
    {
      label: 'Structured FactAssertion records match exact packet R01 fields & statuses',
      ok: validation.checks.structuredAssertionsValid,
    },
    {
      label: 'All citation IDs exist in frozen packet R01',
      ok: validation.checks.allIdsValid,
    },
    {
      label: `Proposed slot budget (${validation.budgetUsed} / ${validation.budgetLimit} integer slots)`,
      ok: validation.checks.budgetValid,
    },
    {
      label: 'Narrative prose screened (uncited IDs, precision, integer & slot checks)',
      ok: validation.checks.narrativeScreeningValid,
    },
    {
      label: 'AUDIT-CLAIM-01 substantively refuted citing O03 & P03',
      ok: validation.checks.auditRefutedValid,
    },
    {
      label: 'Clause-level statistical & efficacy overclaim guard (replicates = 1)',
      ok: validation.checks.statisticalClaimGuardValid,
    },
    {
      label: 'Returned provider model identity check (non-Carbon quarantined)',
      ok: validation.checks.modelIdentityValid,
    },
  ];

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/75 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-900">
          Deterministic Post-Inference Validation Gate
        </p>
        <span
          className={
            validation.valid
              ? 'font-mono text-xs font-semibold text-teal-800'
              : 'font-mono text-xs font-semibold text-rose-800'
          }
        >
          {validation.valid ? '● PASSED DETERMINISTIC CHECKS' : '✖ OUTPUT QUARANTINED'}
        </span>
      </div>

      <ul className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {rows.map((item) => (
          <li key={item.label} className="flex items-start gap-1.5 text-xs text-slate-700">
            <span
              aria-hidden="true"
              className={
                item.ok
                  ? 'mt-0.5 font-mono font-bold text-teal-700'
                  : 'mt-0.5 font-mono font-bold text-rose-700'
              }
            >
              {item.ok ? '✓' : '✖'}
            </span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>

      {!validation.valid && validation.issues.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-rose-200 pt-2 text-xs text-rose-900">
          {validation.issues.map((issue, idx) => (
            <li key={`${issue.code}-${idx}`} className="font-mono break-words">
              [{issue.code}] {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2.5 border-t border-slate-200 pt-2 text-[11px] leading-relaxed text-slate-600">
        Caveat: Structured FactAssertion tuples, citation IDs, and the 4-slot budget are verified deterministically against frozen packet SYNTH-PKT-R01. Free-text narrative screening is bounded heuristic checking rather than complete semantic proof—human review is required, and passing checks never establishes laboratory or biological validation.
      </p>
    </div>
  );
}
