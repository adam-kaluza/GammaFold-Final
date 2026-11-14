import { formatObservationValue } from '../domain/checks.ts';
import type { EvidencePacket } from '../domain/types.ts';

interface SourceInspectorProps {
  packet: EvidencePacket;
  selectedCandidateId: string | null;
  activeCitationId: string | null;
  onClearSelection: () => void;
}

export function SourceInspector({
  packet,
  selectedCandidateId,
  activeCitationId,
  onClearSelection,
}: SourceInspectorProps) {
  const candidate =
    packet.candidates.find((c) => c.id === selectedCandidateId) ?? packet.candidates[0];
  const observation = packet.observations.find((o) => o.candidateId === candidate.id)!;
  const prediction = packet.predictions.find((p) => p.candidateId === candidate.id)!;

  return (
    <section
      id="source-inspector"
      aria-labelledby="source-inspector-heading"
      className="rounded-md border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h3 id="source-inspector-heading" className="text-sm font-semibold text-slate-900">
            Source Record Inspector (Immutable Synthetic Packet {packet.packetId})
          </h3>
          <p className="mt-0.5 text-xs text-slate-600">
            {activeCitationId
              ? `Highlighted from citation ${activeCitationId} · Inspecting ${candidate.id} (${candidate.label})`
              : `Inspecting ${candidate.id} (${candidate.label})`}
          </p>
        </div>

        {selectedCandidateId || activeCitationId ? (
          <button
            type="button"
            onClick={onClearSelection}
            className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            Clear highlight
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded border border-teal-200 bg-teal-50/35 p-3">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <p className="text-xs font-semibold text-slate-900">
              Synthetic Observation (<span className="font-mono">{observation.id}</span>)
            </p>
            <span className="rounded bg-teal-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-teal-900">
              SYNTHETIC MEASUREMENT
            </span>
          </div>
          <dl className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Candidate / Sample</dt>
              <dd className="font-mono font-medium text-slate-900">
                {observation.candidateId} / {observation.sampleId}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Status</dt>
              <dd className="font-mono font-medium text-slate-900">{observation.status}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Recorded Value</dt>
              <dd className="font-mono font-semibold text-slate-900">
                {formatObservationValue(observation)}
              </dd>
            </div>
            {observation.reason ? (
              <div className="pt-1 text-slate-700">
                <dt className="inline text-slate-500">Reason: </dt>
                <dd className="inline">{observation.reason}</dd>
              </div>
            ) : null}
            {observation.note ? (
              <div className="pt-1 text-teal-900">
                <dt className="inline font-medium">Note: </dt>
                <dd className="inline">{observation.note}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="rounded border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <p className="text-xs font-semibold text-slate-900">
              Prior Synthetic Prediction (<span className="font-mono">{prediction.id}</span>)
            </p>
            <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-800">
              PRIOR PREDICTION
            </span>
          </div>
          <dl className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Candidate</dt>
              <dd className="font-mono font-medium text-slate-900">{prediction.candidateId}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Prior Pre-Outcome Score</dt>
              <dd className="font-mono font-semibold text-slate-900">
                {prediction.value.toFixed(2)} {prediction.units}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Epistemic Rule</dt>
              <dd className="font-medium text-slate-800">
                Never substitutes for missing/failed/censored observation
              </dd>
            </div>
            <div className="pt-1 text-slate-600">
              <dt className="inline text-slate-500">Context: </dt>
              <dd className="inline">{prediction.context}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
