import type {
  CandidateComparison,
  EvidencePacket,
  ObservationStatus,
} from '../domain/types.ts';

interface EvidenceTableProps {
  packet: EvidencePacket;
  comparisons: readonly CandidateComparison[];
  selectedCandidateId: string | null;
  highlightedIds: ReadonlySet<string>;
  onSelectCandidate: (candidateId: string) => void;
}

function StatusCell({ status }: { status: ObservationStatus }) {
  switch (status) {
    case 'measured':
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-teal-800">
          <span aria-hidden="true">●</span>
          <span>Measured</span>
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-rose-800">
          <span aria-hidden="true">✖</span>
          <span>Failed</span>
        </span>
      );
    case 'missing':
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-amber-800">
          <span aria-hidden="true">○</span>
          <span>Missing</span>
        </span>
      );
    case 'censored':
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-indigo-800">
          <span aria-hidden="true">◧</span>
          <span>Censored</span>
        </span>
      );
  }
}

export function EvidenceTable({
  packet,
  comparisons,
  selectedCandidateId,
  highlightedIds,
  onSelectCandidate,
}: EvidenceTableProps) {
  return (
    <section
      id="evidence-packet"
      aria-labelledby="evidence-packet-heading"
      className="overflow-hidden rounded-md border border-slate-200 bg-white"
    >
      <div className="border-b border-slate-200 px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="evidence-packet-heading" className="text-base font-semibold text-slate-900">
                Frozen Pre-Outcome Selection &amp; Synthetic Evidence ({packet.roundId})
              </h2>
              <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                IMMUTABLE SOURCE RECORDS
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-600">
              Click any candidate row or model citation pill to inspect exact source fields in the Source Record Inspector.
            </p>
          </div>
          <span className="font-mono text-xs font-medium text-slate-600">
            Units: {packet.units} (synthetic)
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[660px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
              <th scope="col" className="px-4 py-2.5">
                Candidate / Sample
              </th>
              <th scope="col" className="px-3 py-2.5">
                Observation ID &amp; Status
              </th>
              <th scope="col" className="px-3 py-2.5 text-right">
                <span className="block">Synthetic Observation</span>
                <span className="font-mono text-[10px] font-normal text-teal-800">
                  [MEASUREMENT RECORD]
                </span>
              </th>
              <th scope="col" className="px-3 py-2.5 text-right">
                <span className="block">Prior Prediction</span>
                <span className="font-mono text-[10px] font-normal text-slate-500">
                  [PREDICTION · NOT MEASURED]
                </span>
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                Delta (Obs - Pred)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {comparisons.map((row) => {
              const candidate = packet.candidates.find((c) => c.id === row.candidateId)!;
              const isSelected =
                selectedCandidateId === row.candidateId ||
                highlightedIds.has(row.candidateId) ||
                highlightedIds.has(row.observationId) ||
                highlightedIds.has(row.predictionId) ||
                highlightedIds.has(row.sampleId);

              return (
                <tr
                  key={row.candidateId}
                  id={`evidence-row-${row.candidateId}`}
                  data-candidate-id={row.candidateId}
                  data-highlighted={isSelected ? 'true' : 'false'}
                  className={
                    isSelected
                      ? 'bg-teal-50/70 transition-colors'
                      : 'bg-white transition-colors hover:bg-slate-50'
                  }
                >
                  <td className="px-4 py-3 align-top">
                    <button
                      type="button"
                      onClick={() => onSelectCandidate(row.candidateId)}
                      aria-pressed={selectedCandidateId === row.candidateId}
                      className="text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                    >
                      <span className="font-mono text-sm font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-teal-700">
                        {row.candidateId}
                      </span>
                      <span className="ml-1.5 font-mono text-xs text-slate-500">
                        / {row.sampleId}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-600">
                        {candidate.label} · {candidate.constructClass}
                      </span>
                    </button>
                  </td>

                  <td className="px-3 py-3 align-top">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-medium text-slate-700">
                          {row.observationId}
                        </span>
                        <StatusCell status={row.status} />
                      </div>
                      {row.reason ? (
                        <span className="text-xs text-slate-600">{row.reason}</span>
                      ) : row.observedNumeric === 0 ? (
                        <span className="text-xs font-medium text-teal-800">
                          Valid measured zero (not missing)
                        </span>
                      ) : null}
                    </div>
                  </td>

                  <td className="px-3 py-3 text-right align-top font-mono text-sm tabular-nums">
                    {row.status === 'measured' && row.observedNumeric !== null ? (
                      <span className="font-semibold text-slate-900">
                        {row.observedNumeric.toFixed(2)}{' '}
                        <span className="text-xs font-normal text-slate-500">RFU</span>
                      </span>
                    ) : row.status === 'censored' && row.upperBound !== null ? (
                      <span className="font-semibold text-indigo-900">
                        &lt; {row.upperBound.toFixed(2)}{' '}
                        <span className="text-xs font-normal text-indigo-700">RFU</span>
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-slate-500">null</span>
                    )}
                  </td>

                  <td className="px-3 py-3 text-right align-top font-mono text-sm tabular-nums text-slate-700">
                    <span className="mr-1.5 text-xs text-slate-500">{row.predictionId}:</span>
                    <span className="font-medium text-slate-900">
                      {row.predictionValue.toFixed(2)}
                    </span>{' '}
                    <span className="text-xs text-slate-500">RFU</span>
                  </td>

                  <td className="px-4 py-3 text-right align-top font-mono text-sm tabular-nums">
                    {row.comparable && row.delta !== null ? (
                      <span
                        className={
                          row.delta >= 0
                            ? 'font-medium text-teal-800'
                            : 'font-medium text-amber-800'
                        }
                      >
                        {row.delta >= 0 ? `+${row.delta.toFixed(2)}` : row.delta.toFixed(2)}
                      </span>
                    ) : (
                      <span
                        className="text-xs text-slate-500"
                        title="Non-measured outcome cannot compute point delta"
                      >
                        — (n/a)
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
