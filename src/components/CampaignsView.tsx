import { ArrowRight, CheckCircle2, Lock, ShieldAlert } from 'lucide-react';
import type {
  DeterministicSummary,
  ModelReviewEnvelope,
  ReviewResponseStatus,
  SyntheticCampaign,
  SyntheticCampaignId,
} from '../domain/types.ts';

interface CampaignsViewProps {
  campaigns: readonly SyntheticCampaign[];
  activeCampaign: SyntheticCampaign;
  onSelectCampaignAndOpenWorkbench: (id: SyntheticCampaignId) => void;
  summary: DeterministicSummary;
  evidenceHash: string;
  status: ReviewResponseStatus;
  envelope: ModelReviewEnvelope | null;
}

export function CampaignsView({
  campaigns,
  activeCampaign,
  onSelectCampaignAndOpenWorkbench,
  summary,
  evidenceHash,
  status,
  envelope,
}: CampaignsViewProps) {
  const validatedActions =
    activeCampaign.reviewEligible &&
    envelope?.responseStatus === 'validated' &&
    envelope.review
      ? envelope.review.proposedActions
      : [];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6">
      <div className="border-b border-slate-200 pb-4">
        <p className="font-mono text-xs font-semibold text-teal-800 uppercase">
          Campaign Organization &amp; Reproducibility Gates
        </p>
        <h1 className="font-display mt-1 text-2xl font-bold text-slate-900">
          Synthetic Demonstration Campaigns
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          GammaFold Final binds every review envelope and JSON export to its exact campaign ID,
          packet ID, and SHA-256 packet lock. Select{' '}
          <span className="font-mono font-semibold text-slate-900">CAMP-SYNTH-R01</span> to inspect
          the six frozen synthetic observations and evaluate a local loopback or static recorded{' '}
          <span className="font-mono">gemini-4-carbon</span> review, or inspect how{' '}
          <span className="font-mono">CAMP-SYNTH-R02-GATE</span> isolates unapproved next-round
          slots behind a strict human gate without carrying over Round R01 review state.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {campaigns.map((camp) => {
          const isSelected = activeCampaign.id === camp.id;
          return (
            <article
              key={camp.id}
              className={
                isSelected
                  ? 'flex flex-col justify-between rounded-lg border-2 border-[#0B2A4E] bg-white p-5 shadow-xs'
                  : 'flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5'
              }
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-[#0B2A4E]">
                    {camp.id} · Round {camp.roundId}
                  </span>
                  <span
                    className={
                      camp.reviewEligible
                        ? 'rounded bg-teal-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-teal-800 ring-1 ring-teal-600/20'
                        : 'rounded bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-900 ring-1 ring-amber-600/20'
                    }
                  >
                    {camp.stageLabel}
                  </span>
                </div>

                <h2 className="font-display text-lg font-semibold text-slate-900">
                  {camp.title}
                </h2>

                <p className="text-xs leading-relaxed text-slate-600">{camp.summary}</p>

                <dl className="grid grid-cols-2 gap-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs">
                  <div>
                    <dt className="text-slate-500">Synthetic Candidates</dt>
                    <dd className="font-mono font-semibold text-slate-900">
                      {camp.candidateCount} recorded
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Next-Batch Slot Cap</dt>
                    <dd className="font-mono font-semibold text-slate-900">
                      {camp.budgetSlots} slots max
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-500">Bound Packet / SHA-256</dt>
                    <dd className="font-mono text-[11px] text-slate-800 break-all">
                      {camp.expectedPacketId && camp.expectedEvidenceHash
                        ? `${camp.expectedPacketId} · ${camp.expectedEvidenceHash.slice(0, 16)}…`
                        : 'None (human-gate placeholder — review & export blocked)'}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-500">Reference Context</dt>
                    <dd className="font-mono text-[11px] text-slate-800">
                      {camp.referenceAnnotation}
                    </dd>
                  </div>
                </dl>

                <p className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">Gate Policy: </span>
                  {camp.gateNote}
                </p>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <span className="font-mono text-xs text-slate-500">
                  {isSelected ? '● Currently selected' : 'Click to load in Workbench'}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectCampaignAndOpenWorkbench(camp.id)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[#0B2A4E] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#163D6B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                >
                  <span>Select &amp; Open Workbench</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <section
        aria-labelledby="stage-pipeline-heading"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 id="stage-pipeline-heading" className="font-display text-base font-semibold text-slate-900">
              CAMP-SYNTH-R01 Stage Gate Pipeline &amp; Frozen SHA-256 Lock
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Model outputs never advance experimental execution or alter source observations.
            </p>
          </div>
          <code className="rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-800 break-all">
            SHA-256: {evidenceHash}
          </code>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded border border-teal-200 bg-teal-50/40 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-900">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Stage 1 · Frozen Selection</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-700">
              Candidates C01–C06 and prior predictions P01–P06 (in RFU) locked prior to outcome logging.
            </p>
          </div>

          <div className="rounded border border-teal-200 bg-teal-50/40 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-900">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Stage 2 · Outcomes Logged</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-700">
              Measured: {summary.measured} (valid zero: {summary.validZeroCount}), Failed:{' '}
              {summary.failed}, Missing: {summary.missing}, Censored: {summary.censored}.
            </p>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#0B2A4E]" aria-hidden="true" />
              <span>Stage 3 · Carbon Review</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-700">
              Active campaign state: <span className="font-mono font-semibold">{status}</span>.
              Verified via structured FactAssertion tuples, citation checks, 4-slot cap, and bounded
              narrative screening.
            </p>
          </div>

          <div className="rounded border border-amber-200 bg-amber-50/50 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Stage 4 · Human Review Gate</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-700">
              {validatedActions.length > 0
                ? `${validatedActions.length} proposed actions (${envelope?.validation.budgetUsed}/${summary.budgetSlots} slots) queued for human review; never auto-executed.`
                : 'Awaiting verified R01 review proposals (<= 4 synthetic slots) and human export.'}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
