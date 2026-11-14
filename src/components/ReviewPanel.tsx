import {
  AlertTriangle,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Info,
  Play,
  RotateCw,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { renderFactAssertion } from '../domain/checks.ts';
import { RECORDED_REVIEW_RELATIVE_URL } from '../domain/recordedReview.ts';
import type {
  EvidencePacket,
  ModelErrorResponse,
  ModelReviewEnvelope,
  ModelStatusSnapshot,
  ReviewResponseStatus,
  SyntheticCampaign,
  SyntheticCampaignId,
} from '../domain/types.ts';
import { CitationList } from './CitationList.tsx';
import { ValidationSummaryCard } from './ValidationSummaryCard.tsx';

interface ReviewPanelProps {
  packet: EvidencePacket;
  activeCampaign: SyntheticCampaign;
  onSelectCampaign: (id: SyntheticCampaignId) => void;
  status: ReviewResponseStatus;
  modelStatus: ModelStatusSnapshot | null;
  envelope: ModelReviewEnvelope | null;
  errorState: ModelErrorResponse | null;
  exportGuardMessage: string | null;
  isStaticMode: boolean;
  activeCitationId: string | null;
  onSelectCitation: (id: string) => void;
  onRunReview: () => void;
  onLoadRecordedReview: () => void;
  reviewerNotes: string;
  onChangeReviewerNotes: (notes: string) => void;
}

export function ReviewPanel({
  packet,
  activeCampaign,
  onSelectCampaign,
  status,
  modelStatus,
  envelope,
  errorState,
  exportGuardMessage,
  isStaticMode,
  activeCitationId,
  onSelectCitation,
  onRunReview,
  onLoadRecordedReview,
  reviewerNotes,
  onChangeReviewerNotes,
}: ReviewPanelProps) {
  const [rawOpen, setRawOpen] = useState(false);

  const requestedModel =
    envelope?.requestedModel ??
    errorState?.requestedModel ??
    modelStatus?.requestedModel ??
    'gemini-4-carbon';

  const returnedVersionDisplay = envelope
    ? (envelope.returnedModelVersion ?? 'null (unreported by provider — unverified)')
    : isStaticMode
      ? 'Not loaded (static replay mode)'
      : 'Pending runtime call';

  const timestampDisplay =
    envelope?.originalRuntimeTimestamp ?? envelope?.timestamp ?? errorState?.timestamp ?? '—';
  const rawResponseText = envelope?.rawResponseText ?? errorState?.rawResponseText ?? '';

  const statusLabel = (() => {
    switch (status) {
      case 'idle':
        return isStaticMode
          ? 'Idle (awaiting explicit recorded load)'
          : 'Idle (awaiting explicit request)';
      case 'loading':
        return isStaticMode ? 'Loading & verifying recorded artifact...' : 'Request in flight...';
      case 'validated':
        return 'Validated (deterministic checks passed)';
      case 'validation_failed':
        return 'Quarantined (validation or provenance check failed)';
      case 'recorded':
        return 'Recorded Carbon review (static replay · re-validated)';
      case 'error':
        return `Unavailable (${errorState?.errorCode ?? 'ERROR'})`;
    }
  })();

  const isRecordedUnavailable =
    status === 'error' && errorState?.errorCode === 'RECORDED_REVIEW_UNAVAILABLE';

  return (
    <section
      id="model-review"
      aria-labelledby="model-review-heading"
      className="space-y-4"
    >
      <div className="rounded-md border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 id="model-review-heading" className="text-base font-semibold text-slate-900">
              Carbon Evidence Review &amp; Provenance
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              {isStaticMode
                ? `Credential-free static build · Relative ${RECORDED_REVIEW_RELATIVE_URL} · Full browser re-validation`
                : `Loopback 127.0.0.1 only · Opt-in live mode · ${
                    modelStatus
                      ? `${modelStatus.sessionRequestsUsed}/${modelStatus.sessionMaxRequests} session budget`
                      : 'Bounded session budget'
                  } · Single concurrency`}
            </p>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-900">
            <ShieldCheck className="h-3.5 w-3.5 text-[#0B2A4E]" aria-hidden="true" />
            <span>gemini-4-carbon</span>
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Requested Model (Locked)</dt>
            <dd className="font-mono font-semibold text-slate-900">{requestedModel}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Returned Model Version</dt>
            <dd className="font-mono font-medium text-slate-900">{returnedVersionDisplay}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Review State</dt>
            <dd className="font-mono font-medium text-slate-900">{statusLabel}</dd>
          </div>
          <div>
            <dt className="text-slate-500">
              {envelope?.isRecorded ? 'Original Runtime Timestamp' : 'Response Timestamp'}
            </dt>
            <dd className="font-mono text-slate-800">{timestampDisplay}</dd>
          </div>
          {envelope?.isRecorded ? (
            <>
              <div>
                <dt className="text-slate-500">Original Export Timestamp</dt>
                <dd className="font-mono text-slate-800">
                  {envelope.recordedSourceExportedAt ?? 'Not recorded (envelope import)'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Session Runtime Proof</dt>
                <dd className="font-mono text-slate-800">
                  false (static replay; original proven:{' '}
                  {String(Boolean(envelope.originalRecordedRuntimeAccessProven))})
                </dd>
              </div>
            </>
          ) : null}
        </dl>

        <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <span className="font-semibold text-slate-900">Runtime Provenance Note: </span>
          {envelope?.statusNote ??
            errorState?.statusNote ??
            modelStatus?.statusNote ??
            (isStaticMode
              ? `Static credential-free mode active. Click "Load recorded Carbon review" to fetch and verify ${RECORDED_REVIEW_RELATIVE_URL} without any live provider call.`
              : 'Checking local loopback server configuration...')}
        </div>

        <div aria-live="polite" className="sr-only">
          {status === 'loading'
            ? isStaticMode
              ? 'Loading and verifying recorded Carbon review artifact.'
              : 'Requesting local loopback gemini-4-carbon review on frozen packet R01.'
            : status === 'recorded'
              ? 'Recorded Carbon review loaded and passed deterministic verification.'
              : status === 'validated'
                ? 'Carbon review completed and passed deterministic structured assertion, citation, and budget checks.'
                : status === 'validation_failed'
                  ? 'Review output was quarantined by deterministic validation or provenance checks.'
                  : status === 'error'
                    ? `Review unavailable: ${errorState?.message ?? 'Request failed.'}`
                    : ''}
        </div>
      </div>

      {exportGuardMessage ? (
        <div
          role="alert"
          className="rounded-md border border-rose-300 bg-rose-50 p-3.5 text-xs text-rose-950"
        >
          <p className="font-semibold">Export Blocked by Campaign/Hash Binding Check</p>
          <p className="mt-1">{exportGuardMessage}</p>
        </div>
      ) : null}

      {!activeCampaign.reviewEligible ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
          <p className="text-sm font-semibold">
            Human Gate Active ({activeCampaign.id})
          </p>
          <p className="mt-1 leading-relaxed">
            {activeCampaign.gateNote}
          </p>
          <p className="mt-1.5 text-[11px] text-amber-900">
            Round R01 model outputs and R01 packet exports are strictly bound to{' '}
            <span className="font-mono font-semibold">CAMP-SYNTH-R01</span> and never carry over into
            this non-reviewable gate campaign.
          </p>
          <button
            type="button"
            onClick={() => onSelectCampaign('CAMP-SYNTH-R01')}
            className="mt-3 inline-flex min-h-9 items-center rounded bg-[#0B2A4E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#163D6B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            Select Active Campaign CAMP-SYNTH-R01
          </button>
        </div>
      ) : null}

      {isRecordedUnavailable && errorState ? (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <div className="flex items-start gap-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                Recorded Carbon Review Not Bundled ({errorState.errorCode})
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900">{errorState.message}</p>
              <p className="mt-2 text-xs text-amber-800">
                Simulated test fixtures and pre-correction exports are never substituted. Frozen
                packet inspection, deterministic summaries, the benign 1UBQ schematic, and R01 JSON
                export remain fully available.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onLoadRecordedReview}
                  disabled={!activeCampaign.reviewEligible}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded border border-amber-800 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                >
                  <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Retry Load recorded Carbon review</span>
                </button>
                {!isStaticMode ? (
                  <button
                    type="button"
                    onClick={onRunReview}
                    disabled={!activeCampaign.reviewEligible}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded bg-[#0B2A4E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#163D6B] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Request Live Carbon Review</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {status === 'error' && errorState && !isRecordedUnavailable ? (
        <div
          role="alert"
          className="rounded-md border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                Carbon Runtime Unavailable ({errorState.errorCode} · HTTP {errorState.httpStatus})
              </p>
              <p className="mt-1 text-xs leading-relaxed text-rose-900">{errorState.message}</p>
              <p className="mt-2 text-xs text-rose-800">
                No mocked success or silent fallback to Hydrogen/Flash is performed. Immutable
                source records, deterministic checks, and JSON packet export remain available.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!isStaticMode ? (
                  <button
                    type="button"
                    onClick={onRunReview}
                    disabled={!activeCampaign.reviewEligible}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded border border-rose-700 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                  >
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Deliberate Retry (gemini-4-carbon)</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onLoadRecordedReview}
                  disabled={!activeCampaign.reviewEligible}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                >
                  <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Load recorded Carbon review</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {status === 'idle' && activeCampaign.reviewEligible ? (
        <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">
            {isStaticMode
              ? 'Credential-Free Recorded Carbon Review Mode'
              : 'Ready for Carbon Evidence Review'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            {isStaticMode ? (
              <>
                This static bundle operates with zero API credentials and makes no live provider
                requests. Click{' '}
                <span className="font-semibold text-slate-900">Load recorded Carbon review</span> to
                fetch <span className="font-mono">{RECORDED_REVIEW_RELATIVE_URL}</span>, verify its
                schema (<span className="font-mono">3.0.0</span>), SHA-256 packet lock, and{' '}
                <span className="font-mono">gemini-4-carbon</span> provenance, and re-run all
                deterministic checks in the browser.
              </>
            ) : (
              <>
                Click <span className="font-semibold text-slate-900">Request Carbon Review</span> to
                send only frozen synthetic packet{' '}
                <span className="font-mono">{packet.packetId}</span> to local loopback{' '}
                <span className="font-mono">gemini-4-carbon</span> (when{' '}
                <span className="font-mono">GAMMAFOLD_LIVE_MODE=true</span>), or load a verified
                recorded review artifact.
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {isStaticMode ? (
              <button
                type="button"
                onClick={onLoadRecordedReview}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[#0B2A4E] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#163D6B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
              >
                <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Load recorded Carbon review</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onRunReview}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[#0B2A4E] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#163D6B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Request Carbon Review</span>
                </button>
                <button
                  type="button"
                  onClick={onLoadRecordedReview}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                >
                  <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Load recorded Carbon review</span>
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {status === 'loading' ? (
        <div className="rounded-md border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2.5 text-sm font-medium text-slate-900">
            <RotateCw className="h-4 w-4 animate-spin text-[#0B2A4E]" aria-hidden="true" />
            <span>
              {isStaticMode
                ? `Loading & re-validating recorded review for ${packet.roundId}...`
                : `Evaluating frozen packet ${packet.roundId} with gemini-4-carbon...`}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600">
            Verifying structured FactAssertion tuples, citation IDs, 4-slot action budget, and
            provider model identity. Switching campaigns cancels any active request cleanly.
          </p>
        </div>
      ) : null}

      {envelope ? (
        <div className="space-y-4">
          <ValidationSummaryCard validation={envelope.validation} />

          {envelope.responseStatus === 'validation_failed' ? (
            <div
              role="alert"
              className="rounded-md border border-rose-300 bg-rose-50 p-4 text-xs text-rose-950"
            >
              <p className="text-sm font-semibold">
                Model Output Quarantined by Deterministic Validation
              </p>
              <p className="mt-1 leading-relaxed">
                The response or imported artifact violated one or more schema (3.0.0), model
                identity, structured assertion, citation, narrative-screening, statistical-guard, or
                4-slot budget rules. Unvalidated claims are withheld rather than silently repaired.
                Inspect the exact failure codes above or expand the raw payload below.
              </p>
            </div>
          ) : null}

          {envelope.review && envelope.responseStatus === 'validated' ? (
            <div className="space-y-4 rounded-md border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                <h3 className="text-sm font-semibold text-slate-900">
                  {envelope.isRecorded
                    ? 'Recorded Carbon Review Output (Re-Validated)'
                    : 'Validated Carbon Review Output'}
                </h3>
                <span
                  className={
                    envelope.isRecorded
                      ? 'rounded bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-900 ring-1 ring-indigo-600/25'
                      : 'rounded bg-teal-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-teal-800 ring-1 ring-teal-600/20'
                  }
                >
                  {envelope.isSimulatedTestFixture
                    ? 'TEST FIXTURE (SIMULATED)'
                    : envelope.isRecorded
                      ? 'RECORDED CARBON REVIEW · STATIC REPLAY'
                      : envelope.runtimeAccessProven
                        ? 'LIVE GEMINI-4-CARBON · VERIFIED'
                        : 'LIVE REQUEST · MODEL VERSION UNREPORTED'}
                </span>
              </div>

              {envelope.isRecorded ? (
                <div className="rounded border border-indigo-200 bg-indigo-50/50 p-3 text-xs text-indigo-950">
                  <p className="font-semibold">
                    Static Recorded Replay Provenance (No Live API Call Executed in This Session)
                  </p>
                  <p className="mt-1 leading-relaxed text-indigo-900">
                    Originally generated at{' '}
                    <span className="font-mono font-semibold">
                      {envelope.originalRuntimeTimestamp}
                    </span>{' '}
                    by verified provider model{' '}
                    <span className="font-mono font-semibold">{envelope.returnedModelVersion}</span>{' '}
                    against SHA-256{' '}
                    <span className="font-mono">
                      {envelope.evidenceHash.slice(0, 14)}…{envelope.evidenceHash.slice(-8)}
                    </span>
                    . Re-exporting via <strong>Export Packet</strong> writes a new{' '}
                    <span className="font-mono">exportedAt</span> timestamp while preserving{' '}
                    <span className="font-mono">originalRuntimeTimestamp</span> and{' '}
                    <span className="font-mono">recordedSourceExportedAt</span>.
                  </p>
                </div>
              ) : null}

              <div>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <h4 className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
                    Summary
                  </h4>
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-900">
                    MODEL INTERPRETATION · HUMAN REVIEW REQUIRED
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-900">
                  {envelope.review.summary}
                </p>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <h4 className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
                    Structured Source Assertions &amp; Cited Findings
                  </h4>
                  <span className="font-mono text-[10px] text-slate-500">
                    Click any ID to highlight source record
                  </span>
                </div>
                <ul className="mt-2 space-y-2.5">
                  {envelope.review.evidenceFindings.map((finding, idx) => (
                    <li
                      key={idx}
                      className="space-y-2 rounded border border-slate-200 bg-slate-50/55 p-3 text-sm text-slate-900"
                    >
                      <div className="rounded border border-teal-200 bg-teal-50/60 p-2">
                        <p className="font-mono text-[10px] font-semibold tracking-wide text-teal-900 uppercase">
                          Verified Source Assertions (Deterministic Render)
                        </p>
                        <ul className="mt-1 space-y-0.5 font-mono text-xs text-slate-900">
                          {finding.assertions.map((assertion, aIdx) => (
                            <li key={`${assertion.recordId}-${assertion.field}-${aIdx}`}>
                              {renderFactAssertion(assertion, packet)}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <span className="inline-block rounded bg-sky-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-900">
                          MODEL NARRATIVE INTERPRETATION · HUMAN REVIEW REQUIRED
                        </span>
                        <p className="mt-1 leading-relaxed">{finding.claim}</p>
                      </div>

                      <CitationList
                        packet={packet}
                        sourceIds={finding.sourceIds}
                        activeCitationId={activeCitationId}
                        onSelectCitation={onSelectCitation}
                      />
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <h4 className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
                    Limitations &amp; Evidence Caveats
                  </h4>
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-900">
                    MODEL INTERPRETATION · HUMAN REVIEW REQUIRED
                  </span>
                </div>
                <ul className="mt-2 space-y-2">
                  {envelope.review.limitations.map((lim, idx) => (
                    <li
                      key={idx}
                      className="rounded border border-slate-200 bg-slate-50/55 p-3 text-xs leading-relaxed text-slate-800"
                    >
                      <p>{lim.note}</p>
                      {lim.sourceIds.length > 0 ? (
                        <CitationList
                          packet={packet}
                          sourceIds={lim.sourceIds}
                          activeCitationId={activeCitationId}
                          onSelectCitation={onSelectCitation}
                          showReferencedValues={false}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
                      Proposed Next-Batch Actions
                    </h4>
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-900">
                      PROPOSED ACTIONS · HUMAN GATE
                    </span>
                  </div>
                  <span className="font-mono text-xs font-semibold text-slate-900">
                    {envelope.validation.budgetUsed} / {envelope.validation.budgetLimit} synthetic slots
                  </span>
                </div>

                <div className="mt-2 space-y-2">
                  {envelope.review.proposedActions.map((action, idx) => (
                    <div
                      key={`${action.candidateId}-${idx}`}
                      className="rounded border border-indigo-200/80 bg-indigo-50/25 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectCitation(action.candidateId)}
                          className="font-mono text-sm font-semibold text-[#0B2A4E] underline decoration-slate-300 underline-offset-4 hover:decoration-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                        >
                          {action.candidateId}
                        </button>
                        <span className="rounded bg-white px-2 py-0.5 font-mono text-xs font-semibold text-slate-900 ring-1 ring-slate-200">
                          {action.assaySlots} {action.assaySlots === 1 ? 'assay slot' : 'assay slots'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-800">
                        {action.purpose}
                      </p>
                      <CitationList
                        packet={packet}
                        sourceIds={action.sourceIds}
                        activeCitationId={activeCitationId}
                        onSelectCitation={onSelectCitation}
                        showReferencedValues={false}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  Proposals remain non-executing recommendations. Human review is required; source observations O01–O06 are never mutated.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {rawResponseText ? (
        <div className="rounded-md border border-slate-200 bg-white">
          <button
            type="button"
            aria-expanded={rawOpen}
            onClick={() => setRawOpen((prev) => !prev)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            <span>Inspect Bounded Raw Response / Imported Artifact</span>
            {rawOpen ? (
              <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden="true" />
            )}
          </button>
          {rawOpen ? (
            <div className="border-t border-slate-200 bg-slate-950 p-3.5">
              <pre className="max-h-72 overflow-auto font-mono text-xs leading-relaxed text-slate-100 whitespace-pre-wrap break-words">
                {rawResponseText}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <label htmlFor="reviewer-notes" className="text-xs font-semibold text-slate-900">
            Local Reviewer Handoff Note (Optional · Stored Locally Only)
          </label>
          <span className="font-mono text-[11px] text-slate-500">
            {reviewerNotes.length}/500
          </span>
        </div>
        <textarea
          id="reviewer-notes"
          rows={2}
          maxLength={500}
          value={reviewerNotes}
          onChange={(e) => onChangeReviewerNotes(e.target.value.slice(0, 500))}
          placeholder="Record human sign-off notes for JSON export (never sent to model or cloud)..."
          className="mt-1.5 w-full rounded border border-slate-300 bg-slate-50/60 px-3 py-2 text-xs text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        />
      </div>
    </section>
  );
}
