import type {
  ReviewResponseStatus,
  SyntheticCampaign,
  SyntheticCampaignId,
} from '../domain/types.ts';
import type { AppView } from './Navbar.tsx';

interface JourneyStepperProps {
  campaigns: readonly SyntheticCampaign[];
  activeCampaign: SyntheticCampaign;
  onSelectCampaign: (id: SyntheticCampaignId) => void;
  onNavigate: (view: AppView) => void;
  status: ReviewResponseStatus;
  hasExported: boolean;
  isStaticMode: boolean;
}

export function JourneyStepper({
  campaigns,
  activeCampaign,
  onSelectCampaign,
  onNavigate,
  status,
  hasExported,
  isStaticMode,
}: JourneyStepperProps) {
  const reviewCompleted = status === 'validated' || status === 'recorded';

  const steps = [
    {
      num: '1',
      title: 'Select Synthetic Campaign',
      detail: activeCampaign.id,
      done: activeCampaign.reviewEligible,
    },
    {
      num: '2',
      title: 'Inspect Exact Evidence',
      detail: activeCampaign.reviewEligible ? '6 synthetic rows (R01)' : 'Switch to R01',
      done: activeCampaign.reviewEligible,
    },
    {
      num: '3',
      title: isStaticMode ? 'Load Recorded Carbon Review' : 'Request Carbon Review',
      detail:
        status === 'loading'
          ? isStaticMode
            ? 'Loading artifact...'
            : 'In flight...'
          : status === 'recorded'
            ? 'Loaded recorded R01 (3.0.0)'
            : status === 'validated'
              ? 'Completed (gemini-4-carbon)'
              : status === 'validation_failed'
                ? 'Output quarantined'
                : status === 'error'
                  ? 'Unavailable / error'
                  : isStaticMode
                    ? 'Awaiting explicit load'
                    : 'Awaiting request',
      done: reviewCompleted,
    },
    {
      num: '4',
      title: 'Audit Assertions & Limits',
      detail: reviewCompleted
        ? 'Assertions & 4-slot cap verified'
        : 'Deterministic pre-checks active',
      done: reviewCompleted,
    },
    {
      num: '5',
      title: 'Export Review Packet',
      detail: !activeCampaign.reviewEligible
        ? 'R01 only (gate locked)'
        : hasExported
          ? 'JSON exported (3.0.0)'
          : 'Ready for R01',
      done: hasExported && activeCampaign.reviewEligible,
    },
  ];

  return (
    <section
      aria-label="Demonstration workflow and campaign selector"
      className="border-b border-slate-200 bg-gradient-to-r from-slate-900 via-[#0B2A4E] to-[#123864] text-white"
    >
      <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-teal-200 ring-1 ring-teal-400/30">
                {isStaticMode
                  ? 'STATIC RECORDED REPLAY (NO CREDENTIALS)'
                  : 'LOCAL LOOPBACK SANDBOX (127.0.0.1)'}
              </span>
              <span className="font-mono text-xs text-sky-200">
                {activeCampaign.stageLabel}
              </span>
            </div>
            <h1 className="font-display mt-1 text-lg font-semibold text-white sm:text-xl">
              {activeCampaign.title}
            </h1>
            <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-sky-100/85">
              {activeCampaign.summary}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="workbench-campaign-select" className="text-xs font-medium text-sky-100">
              Campaign:
            </label>
            <select
              id="workbench-campaign-select"
              value={activeCampaign.id}
              onChange={(e) => onSelectCampaign(e.target.value as SyntheticCampaignId)}
              className="max-w-full rounded-md border border-sky-300/40 bg-slate-950/70 px-3 py-1.5 font-mono text-xs font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
            >
              {campaigns.map((camp) => (
                <option key={camp.id} value={camp.id} className="bg-slate-900 text-white">
                  {camp.id} — {camp.roundId} ({camp.reviewEligible ? 'Active Evidence' : 'Human Gate'})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onNavigate('campaigns')}
              className="rounded-md border border-sky-300/35 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-sky-100 transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
            >
              Stage Pipeline
            </button>
          </div>
        </div>

        <ol className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((step) => (
            <li
              key={step.num}
              className={
                step.done
                  ? 'rounded-md border border-teal-400/40 bg-teal-950/40 px-3 py-2'
                  : 'rounded-md border border-white/15 bg-slate-950/35 px-3 py-2'
              }
            >
              <div className="flex items-center gap-2">
                <span
                  className={
                    step.done
                      ? 'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-400 font-mono text-[11px] font-bold text-slate-950'
                      : 'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 font-mono text-[11px] font-semibold text-white'
                  }
                >
                  {step.num}
                </span>
                <span className="text-xs font-semibold text-white">{step.title}</span>
              </div>
              <p className="mt-1 pl-7 font-mono text-[11px] text-sky-200/90">{step.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
