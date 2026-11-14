import type { CandidateComparison } from '../domain/types.ts';

interface OutcomeComparisonChartProps {
  comparisons: readonly CandidateComparison[];
  selectedCandidateId: string | null;
  onSelectCandidate: (candidateId: string) => void;
}

export function OutcomeComparisonChart({
  comparisons,
  selectedCandidateId,
  onSelectCandidate,
}: OutcomeComparisonChartProps) {
  return (
    <section
      aria-labelledby="outcome-chart-heading"
      className="rounded-md border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h2 id="outcome-chart-heading" className="text-sm font-semibold text-slate-900">
            Visual Epistemic Separation: Synthetic Observations vs. Prior Predictions (0.00–1.00 RFU)
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Valid zero (<span className="font-mono">O02 = 0.00</span>) is plotted at 0.00; failed (
            <span className="font-mono">O03</span>) and missing (<span className="font-mono">O04</span>) have no numeric point; censored (
            <span className="font-mono">O05 &lt; 0.10</span>) is a bounded interval.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-600">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-teal-700" aria-hidden="true" />
            <span>Measured Observation</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rotate-45 border-2 border-slate-600 bg-white" aria-hidden="true" />
            <span>Prior Prediction (Not Measured)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-4 rounded-xs border border-indigo-600 bg-indigo-100" aria-hidden="true" />
            <span>Censored Bound (&lt; 0.10)</span>
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {comparisons.map((row) => {
          const isSelected = selectedCandidateId === row.candidateId;
          const predPct = Math.min(100, Math.max(0, row.predictionValue * 100));
          const obsPct =
            row.status === 'measured' && row.observedNumeric !== null
              ? Math.min(100, Math.max(0, row.observedNumeric * 100))
              : null;
          const censoredPct =
            row.status === 'censored' && row.upperBound !== null
              ? Math.min(100, Math.max(0, row.upperBound * 100))
              : null;

          return (
            <button
              key={row.candidateId}
              type="button"
              onClick={() => onSelectCandidate(row.candidateId)}
              aria-pressed={isSelected}
              className={
                isSelected
                  ? 'block w-full rounded border border-teal-600 bg-teal-50/50 px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700'
                  : 'block w-full rounded border border-slate-200 bg-slate-50/40 px-3 py-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700'
              }
            >
              <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-12">
                <div className="flex items-center justify-between gap-2 sm:col-span-3">
                  <span className="font-mono text-xs font-semibold text-slate-900">
                    {row.candidateId}{' '}
                    <span className="font-normal text-slate-500">({row.observationId}/{row.predictionId})</span>
                  </span>
                </div>

                <div className="relative h-6 rounded bg-slate-200/75 sm:col-span-6">
                  {/* Scale ticks at 0.0, 0.5, 1.0 */}
                  <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-slate-300" />
                  <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-slate-300/70" />
                  <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-slate-300" />

                  {/* Measured bar + point (including 0.00 valid zero!) */}
                  {obsPct !== null ? (
                    <>
                      {obsPct > 0 ? (
                        <div
                          style={{ width: `${obsPct}%` }}
                          className="absolute top-1.5 bottom-1.5 left-0 rounded-r bg-teal-600/35"
                        />
                      ) : null}
                      <div
                        style={{ left: `calc(${obsPct}% - 5px)` }}
                        title={`${row.observationId}: ${row.observedDisplay}`}
                        className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-teal-700 shadow-xs"
                      />
                    </>
                  ) : null}

                  {/* Left-censored interval [0, upperBound) without point dot */}
                  {censoredPct !== null ? (
                    <div
                      style={{ width: `${censoredPct}%` }}
                      title={`${row.observationId}: < ${row.upperBound?.toFixed(2)} RFU (censored interval, no point value)`}
                      className="absolute top-1 bottom-1 left-0 border-r-2 border-dashed border-indigo-700 bg-indigo-300/45"
                    />
                  ) : null}

                  {/* Non-measured failed/missing explicit non-numeric badge inside lane */}
                  {row.status === 'failed' || row.status === 'missing' ? (
                    <div className="absolute inset-y-1 left-2 flex items-center">
                      <span
                        className={
                          row.status === 'failed'
                            ? 'rounded bg-rose-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-rose-800'
                            : 'rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-800'
                        }
                      >
                        {row.status === 'failed'
                          ? '✖ NO NUMERIC POINT (QC FAILED)'
                          : '○ NO NUMERIC POINT (MISSING)'}
                      </span>
                    </div>
                  ) : null}

                  {/* Prior synthetic prediction hollow diamond */}
                  <div
                    style={{ left: `calc(${predPct}% - 5px)` }}
                    title={`Prior synthetic prediction ${row.predictionId}: ${row.predictionValue.toFixed(2)} RFU (not measured)`}
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-2 border-slate-700 bg-white"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums sm:col-span-3 sm:justify-end">
                  <span className="text-slate-800">
                    {row.status === 'measured' && row.observedNumeric !== null
                      ? `Obs ${row.observedNumeric.toFixed(2)}`
                      : row.status === 'censored' && row.upperBound !== null
                        ? `Obs <${row.upperBound.toFixed(2)}`
                        : `Obs null`}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-600">Pred {row.predictionValue.toFixed(2)}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
