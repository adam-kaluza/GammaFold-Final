import { ArchiveRestore, Download, Play, RotateCcw, RotateCw } from 'lucide-react';
import type { ReviewResponseStatus, SyntheticCampaign } from '../domain/types.ts';

export type AppView = 'workbench' | 'campaigns' | 'reference' | 'provenance';

interface NavbarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  activeCampaign: SyntheticCampaign;
  status: ReviewResponseStatus;
  hasResult: boolean;
  isStaticMode: boolean;
  canExport: boolean;
  onRunReview: () => void;
  onLoadRecordedReview: () => void;
  onExportJson: () => void;
  onResetState: () => void;
}

const NAV_ITEMS: ReadonlyArray<{ view: AppView; label: string }> = [
  { view: 'workbench', label: 'Review Workbench' },
  { view: 'campaigns', label: 'Campaigns & Stages' },
  { view: 'reference', label: '1UBQ Reference & Epistemics' },
  { view: 'provenance', label: 'Provenance & DeltaFold' },
];

export function Navbar({
  activeView,
  onNavigate,
  activeCampaign,
  status,
  hasResult,
  isStaticMode,
  canExport,
  onRunReview,
  onLoadRecordedReview,
  onExportJson,
  onResetState,
}: NavbarProps) {
  const isLoading = status === 'loading';
  const reviewDisabled = isLoading || !activeCampaign.reviewEligible;
  const exportDisabled = isLoading || !canExport;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white no-print">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-5 gap-y-2.5 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('workbench')}
            className="flex items-center gap-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="shrink-0 text-[#0B2A4E]"
            >
              <path
                d="M6 3C6 8.5 18 8.5 18 14C18 19.5 6 19.5 6 21"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
              />
              <path
                d="M18 3C18 8.5 6 8.5 6 14C6 19.5 18 19.5 18 21"
                stroke="#0F766E"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeDasharray="2.5 3"
              />
            </svg>
            <div className="min-w-0">
              <span className="font-display block text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                GammaFold Final
              </span>
              <span className="block text-[11px] font-medium text-slate-500">
                Synthetic Assay Review Workbench · Adjacent to DeltaFold
              </span>
            </div>
          </button>
        </div>

        <nav
          aria-label="Primary sections"
          className="hidden items-center gap-1 lg:flex"
        >
          {NAV_ITEMS.map((item) => {
            const active = activeView === item.view;
            return (
              <button
                key={item.view}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(item.view)}
                className={
                  active
                    ? 'rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700'
                    : 'rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700'
                }
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={onResetState}
            title="Cancel any active request and clear local selection, reviewer notes, and review state"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Reset State</span>
          </button>

          <button
            type="button"
            onClick={onExportJson}
            disabled={exportDisabled}
            title={
              canExport
                ? 'Export frozen Round R01 packet and bound review metadata (schema 3.0.0)'
                : 'Select active campaign CAMP-SYNTH-R01 to export frozen Round R01 evidence'
            }
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Export Packet</span>
          </button>

          {isStaticMode ? (
            <button
              type="button"
              onClick={onLoadRecordedReview}
              disabled={reviewDisabled}
              aria-busy={isLoading}
              title={
                activeCampaign.reviewEligible
                  ? 'Load and re-validate recorded gemini-4-carbon review from ./recorded/carbon-review-R01.json'
                  : 'Select active campaign CAMP-SYNTH-R01 to load recorded Carbon review'
              }
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[#0B2A4E] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#163D6B] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              {isLoading ? (
                <>
                  <RotateCw className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                  <span>Loading recorded review...</span>
                </>
              ) : (
                <>
                  <ArchiveRestore className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {status === 'recorded'
                      ? 'Reload recorded Carbon review'
                      : 'Load recorded Carbon review'}
                  </span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onRunReview}
              disabled={reviewDisabled}
              aria-busy={isLoading}
              title={
                activeCampaign.reviewEligible
                  ? 'Send frozen packet R01 to local loopback gemini-4-carbon'
                  : 'Select active campaign CAMP-SYNTH-R01 to run Carbon review'
              }
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[#0B2A4E] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#163D6B] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              {isLoading ? (
                <>
                  <RotateCw className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                  <span>Requesting Carbon Review...</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{hasResult ? 'Re-run Carbon Review' : 'Request Carbon Review'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <nav
        aria-label="Mobile sections"
        className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 bg-slate-50/80 px-4 py-2 lg:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const active = activeView === item.view;
          return (
            <button
              key={item.view}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(item.view)}
              className={
                active
                  ? 'shrink-0 rounded bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700'
                  : 'shrink-0 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700'
              }
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 bg-[#061830] text-slate-100">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 text-[11px] sm:px-6">
          <p className="font-medium text-teal-300">
            100% Synthetic Teaching Dataset (C01–C06) · No Laboratory Results · No Sequence Design or Docking Claims
          </p>
          <p className="font-mono text-slate-300">
            {isStaticMode
              ? 'Mode: Static Recorded Replay (credential-free · zero live API calls) · Human gate required'
              : 'Runtime: gemini-4-carbon (loopback 127.0.0.1 · opt-in live mode · no silent fallback) · Human gate required'}
          </p>
        </div>
      </div>
    </header>
  );
}
