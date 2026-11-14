import type { DeterministicSummary } from '../domain/types.ts';

interface DeterministicStripProps {
  summary: DeterministicSummary;
  evidenceHash: string;
  immutableVerified: boolean;
  roundId: string;
}

export function DeterministicStrip({
  summary,
  evidenceHash,
  immutableVerified,
  roundId,
}: DeterministicStripProps) {
  return (
    <section
      id="deterministic-checks"
      aria-labelledby="deterministic-checks-heading"
      className="border-b border-slate-200 bg-white"
    >
      <div className="mx-auto max-w-[1400px] px-4 py-3.5 sm:px-6">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="deterministic-checks-heading"
              className="text-sm font-semibold text-slate-900"
            >
              Deterministic Evidence Checks (Computed in TypeScript — Never LLM Arithmetic)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>Frozen Round:</span>
            <span className="font-mono font-semibold text-slate-900">{roundId}</span>
            <span aria-hidden="true">·</span>
            <span>SHA-256:</span>
            <code
              title={evidenceHash}
              className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-800 break-all sm:break-normal"
            >
              {evidenceHash.slice(0, 16)}…{evidenceHash.slice(-10)}
            </code>
            <span
              className={
                immutableVerified
                  ? 'rounded bg-teal-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-teal-800 ring-1 ring-teal-600/20'
                  : 'rounded bg-rose-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-rose-800 ring-1 ring-rose-600/20'
              }
            >
              {immutableVerified ? '● Immutable Verified' : '✖ Hash Drift'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-slate-200 bg-slate-50/75 p-3">
            <p className="text-xs font-medium text-slate-600">Measured Observations</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {summary.measured}{' '}
              <span className="text-sm font-normal text-slate-500">
                / {summary.totalCandidates}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Includes valid zero (<span className="font-mono font-medium text-teal-800">O02 = 0.00 RFU</span>)
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50/75 p-3">
            <p className="text-xs font-medium text-slate-600">Non-Measured Outcomes</p>
            <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums sm:text-xl">
              Failed {summary.failed} · Missing {summary.missing} · Censored {summary.censored}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Never coerced to zero or point estimates
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50/75 p-3">
            <p className="text-xs font-medium text-slate-600">Replicate &amp; Statistical Guard</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {summary.replicates}{' '}
              <span className="text-sm font-normal text-slate-500">replicate pass</span>
            </p>
            <p className="mt-1 text-xs text-slate-600">
              No p-values, CIs, or significance claims allowed
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50/75 p-3">
            <p className="text-xs font-medium text-slate-600">Proposed Next-Batch Cap</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {summary.budgetSlots}{' '}
              <span className="text-sm font-normal text-slate-500">synthetic slots max</span>
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Proposals held at human gate; never auto-run
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
