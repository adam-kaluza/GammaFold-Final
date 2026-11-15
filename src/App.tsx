import { useEffect, useMemo, useRef, useState } from 'react';
import { AuditCard } from './components/AuditCard.tsx';
import { CampaignsView } from './components/CampaignsView.tsx';
import { DeterministicStrip } from './components/DeterministicStrip.tsx';
import { EvidenceTable } from './components/EvidenceTable.tsx';
import { JourneyStepper } from './components/JourneyStepper.tsx';
import { Navbar, type AppView } from './components/Navbar.tsx';
import { OutcomeComparisonChart } from './components/OutcomeComparisonChart.tsx';
import { ProvenanceView } from './components/ProvenanceView.tsx';
import { ReferenceEpistemicsView } from './components/ReferenceEpistemicsView.tsx';
import { ReferenceTopologyCard } from './components/ReferenceTopologyCard.tsx';
import { ReviewPanel } from './components/ReviewPanel.tsx';
import { SourceInspector } from './components/SourceInspector.tsx';
import {
  beginCampaignRequest,
  type CampaignSessionState,
  createInitialCampaignSession,
  getActiveCampaignSlot,
  type InFlightReviewToken,
  resetCampaignSession,
  selectCampaignInSession,
  settleCampaignEnvelope,
  settleCampaignError,
} from './domain/campaignSession.ts';
import {
  getCampaignById,
  SYNTHETIC_CAMPAIGNS,
} from './domain/campaigns.ts';
import { computeDeterministicSummary } from './domain/checks.ts';
import { buildExportReviewPacket, ExportBindingError } from './domain/exportPacket.ts';
import {
  computeEvidenceHash,
  REQUIRED_AUDIT_CLAIM_ID,
  SYNTHETIC_EVIDENCE_PACKET,
  verifyFrozenPacketIntegrity,
} from './domain/packet.ts';
import { loadRecordedReviewFromUrl } from './domain/recordedReview.ts';
import { clearPersistedLocalState, loadPersistedLocalState, savePersistedLocalState, type PersistedLocalState } from './domain/localState.ts';
import type {
  ModelErrorResponse,
  ModelReviewEnvelope,
  ModelStatusSnapshot,
  SyntheticCampaignId,
} from './domain/types.ts';

const IS_STATIC_MODE = import.meta.env.MODE === 'static';
function resolveCandidateIdFromSourceId(sourceId: string): string | null {
  if (sourceId === SYNTHETIC_EVIDENCE_PACKET.roundId) return null;
  if (sourceId === REQUIRED_AUDIT_CLAIM_ID) return 'C03';
  const cand = SYNTHETIC_EVIDENCE_PACKET.candidates.find(
    (c) =>
      c.id === sourceId ||
      c.sampleId === sourceId ||
      c.observationId === sourceId ||
      c.predictionId === sourceId,
  );
  return cand ? cand.id : null;
}

export default function App() {
  const packet = SYNTHETIC_EVIDENCE_PACKET;
  const deterministicSummary = useMemo(() => computeDeterministicSummary(packet), [packet]);
  const evidenceHash = useMemo(() => computeEvidenceHash(packet), [packet]);
  const immutableVerified = verifyFrozenPacketIntegrity(packet);

  const initialLocal = useMemo(() => loadPersistedLocalState(() => window.localStorage), []);

  const [activeView, setActiveView] = useState<AppView>('workbench');
  const [session, setSession] = useState<CampaignSessionState>(() =>
    createInitialCampaignSession(initialLocal.campaignId),
  );
  const sessionRef = useRef<CampaignSessionState>(session);

  const [reviewerNotes, setReviewerNotes] = useState<string>(initialLocal.reviewerNotes);
  const [modelStatus, setModelStatus] = useState<ModelStatusSnapshot | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>('C01');
  const [activeCitationId, setActiveCitationId] = useState<string | null>(null);
  const [hasExported, setHasExported] = useState<boolean>(false);
  const [exportGuardMessage, setExportGuardMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<{
    token: InFlightReviewToken;
    controller: AbortController;
  } | null>(null);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.controller.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  function commitSession(next: CampaignSessionState) {
    sessionRef.current = next;
    setSession(next);
  }

  const selectedCampaignId = session.selectedCampaignId;
  const activeCampaign = useMemo(
    () => getCampaignById(selectedCampaignId) ?? SYNTHETIC_CAMPAIGNS[0],
    [selectedCampaignId],
  );
  const activeSlot = useMemo(() => getActiveCampaignSlot(session), [session]);
  const { status, envelope, errorState } = activeSlot;
  const canExport = activeCampaign.reviewEligible && immutableVerified;

  useEffect(() => {
    try {
      const payload: PersistedLocalState = {
        campaignId: selectedCampaignId,
        reviewerNotes,
      };
      savePersistedLocalState(window.localStorage, payload);
    } catch {
      // Non-fatal if storage is disabled in private browsing
    }
  }, [selectedCampaignId, reviewerNotes]);

  useEffect(() => {
    if (import.meta.env.MODE === 'static') {
      return;
    }
    let active = true;
    fetch('/api/model-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ModelStatusSnapshot | null) => {
        if (!active || !data) return;
        setModelStatus(data);
      })
      .catch(() => {
        // Non-blocking status check; packet inspection and export still operate offline.
      });
    return () => {
      active = false;
    };
  }, []);

  const highlightedIds = useMemo(() => {
    const ids = new Set<string>();
    if (activeCitationId) {
      ids.add(activeCitationId);
      if (activeCitationId === packet.roundId) {
        packet.candidates.forEach((c) => ids.add(c.id));
      }
      if (activeCitationId === REQUIRED_AUDIT_CLAIM_ID) {
        ids.add('C03');
      }
    }
    if (selectedCandidateId) {
      ids.add(selectedCandidateId);
    }
    return ids;
  }, [activeCitationId, selectedCandidateId, packet]);

  function handleSelectCampaign(nextId: SyntheticCampaignId) {
    const { state: nextState, abortedRequest } = selectCampaignInSession(
      sessionRef.current,
      nextId,
    );
    if (abortedRequest && abortControllerRef.current?.token.requestId === abortedRequest.requestId) {
      abortControllerRef.current.controller.abort();
      abortControllerRef.current = null;
    }
    setExportGuardMessage(null);
    commitSession(nextState);
  }

  function handleSelectCandidate(candidateId: string) {
    setSelectedCandidateId(candidateId);
    setActiveCitationId(candidateId);
  }

  function handleSelectCitation(sourceId: string) {
    setActiveCitationId(sourceId);
    const candidateId = resolveCandidateIdFromSourceId(sourceId);
    if (candidateId) {
      setSelectedCandidateId(candidateId);
      const rowEl = document.getElementById(`evidence-row-${candidateId}`);
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  function handleClearSelection() {
    setSelectedCandidateId(null);
    setActiveCitationId(null);
  }

  function handleResetLocalState() {
    if (abortControllerRef.current) {
      abortControllerRef.current.controller.abort();
      abortControllerRef.current = null;
    }
    commitSession(resetCampaignSession(sessionRef.current));
    setReviewerNotes('');
    setSelectedCandidateId('C01');
    setActiveCitationId(null);
    setHasExported(false);
    setExportGuardMessage(null);
    setActiveView('workbench');
    try {
      clearPersistedLocalState(window.localStorage);
    } catch {
      // Ignore storage error
    }
  }

  async function handleLoadRecordedReview() {
    const currentCampaign =
      getCampaignById(sessionRef.current.selectedCampaignId) ?? SYNTHETIC_CAMPAIGNS[0];
    if (!currentCampaign.reviewEligible) return;

    const { state: startedState, token } = beginCampaignRequest(
      sessionRef.current,
      currentCampaign,
      evidenceHash,
    );
    if (!token) return;

    const controller = new AbortController();
    abortControllerRef.current = { token, controller };
    setExportGuardMessage(null);
    commitSession(startedState);

    try {
      const outcome = await loadRecordedReviewFromUrl(
        currentCampaign,
        packet,
        undefined,
        fetch,
        controller.signal,
      );
      if (!mountedRef.current || controller.signal.aborted || outcome.outcome === 'aborted') {
        return;
      }
      if (outcome.outcome === 'unavailable') {
        const { state: errState, applied } = settleCampaignError(
          sessionRef.current,
          token,
          outcome.error,
        );
        if (applied) commitSession(errState);
        return;
      }

      const statusOverride = outcome.outcome === 'loaded' ? 'recorded' : 'validation_failed';
      const { state: settledState, applied } = settleCampaignEnvelope(
        sessionRef.current,
        token,
        outcome.envelope,
        statusOverride,
      );
      if (applied) commitSession(settledState);
    } finally {
      if (abortControllerRef.current?.token.requestId === token.requestId) {
        abortControllerRef.current = null;
      }
    }
  }

  async function handleRunReview() {
    if (import.meta.env.MODE === 'static') {
      return;
    }

    const currentCampaign =
      getCampaignById(sessionRef.current.selectedCampaignId) ?? SYNTHETIC_CAMPAIGNS[0];
    if (!currentCampaign.reviewEligible) return;

    const { state: startedState, token } = beginCampaignRequest(
      sessionRef.current,
      currentCampaign,
      evidenceHash,
    );
    if (!token) return;

    setExportGuardMessage(null);
    commitSession(startedState);

    const controller = new AbortController();
    let timedOut = false;
    abortControllerRef.current = { token, controller };
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 42_000);

    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: token.campaignId,
          modelId: 'gemini-4-carbon',
        }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as ModelReviewEnvelope | ModelErrorResponse;
      if (!mountedRef.current || (controller.signal.aborted && !timedOut)) {
        return;
      }

      if (!response.ok || 'errorCode' in payload) {
        const { state: errState, applied } = settleCampaignError(
          sessionRef.current,
          token,
          payload as ModelErrorResponse,
        );
        if (applied) commitSession(errState);
        return;
      }

      const { state: settledState, applied } = settleCampaignEnvelope(
        sessionRef.current,
        token,
        payload,
      );
      if (applied) commitSession(settledState);
    } catch (err: unknown) {
      const aborted =
        controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError');
      if (!mountedRef.current || (aborted && !timedOut)) {
        return;
      }
      const { state: errState, applied } = settleCampaignError(sessionRef.current, token, {
        errorCode: aborted ? 'TIMEOUT' : 'INTERNAL_ERROR',
        message: aborted
          ? 'Client request timed out waiting for server gemini-4-carbon response.'
          : 'Network error communicating with local Carbon review server.',
        requestedModel: 'gemini-4-carbon',
        returnedModelVersion: null,
        runtimeAccessProven: false,
        statusNote: 'Request failed before server response completed.',
        timestamp: new Date().toISOString(),
        httpStatus: aborted ? 504 : 500,
        evidenceHash,
      });
      if (applied) commitSession(errState);
    } finally {
      window.clearTimeout(timeoutId);
      if (abortControllerRef.current?.token.requestId === token.requestId) {
        abortControllerRef.current = null;
      }
      if (mountedRef.current && (!controller.signal.aborted || timedOut)) {
        fetch('/api/model-status')
          .then((res) => (res.ok ? res.json() : null))
          .then((data: ModelStatusSnapshot | null) => {
            if (mountedRef.current && data) setModelStatus(data);
          })
          .catch(() => {
            // Non-blocking status refresh
          });
      }
    }
  }

  function handleExportJson() {
    try {
      const exportPacket = buildExportReviewPacket({
        packet,
        campaign: activeCampaign,
        reviewerNotes,
        status,
        modelStatus,
        envelope,
        errorState,
      });

      setExportGuardMessage(null);
      const blob = new Blob([JSON.stringify(exportPacket, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gammafold-review-${packet.roundId}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setHasExported(true);
    } catch (err: unknown) {
      if (err instanceof ExportBindingError) {
        setExportGuardMessage(err.message);
        return;
      }
      setExportGuardMessage('Unable to export review packet.');
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC] text-slate-900">
      <Navbar
        activeView={activeView}
        onNavigate={setActiveView}
        activeCampaign={activeCampaign}
        status={status}
        hasResult={Boolean(envelope)}
        isStaticMode={IS_STATIC_MODE}
        canExport={canExport}
        onRunReview={handleRunReview}
        onLoadRecordedReview={handleLoadRecordedReview}
        onExportJson={handleExportJson}
        onResetState={handleResetLocalState}
      />

      {activeView === 'workbench' ? (
        <div className="flex-1">
          <JourneyStepper
            campaigns={SYNTHETIC_CAMPAIGNS}
            activeCampaign={activeCampaign}
            onSelectCampaign={handleSelectCampaign}
            onNavigate={setActiveView}
            status={status}
            hasExported={hasExported}
            isStaticMode={IS_STATIC_MODE}
          />

          <DeterministicStrip
            summary={deterministicSummary}
            evidenceHash={evidenceHash}
            immutableVerified={immutableVerified}
            roundId={packet.roundId}
          />

          <main id="main-workbench" className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
              <div className="min-w-0 space-y-5 lg:col-span-7">
                <EvidenceTable
                  packet={packet}
                  comparisons={deterministicSummary.comparisons}
                  selectedCandidateId={selectedCandidateId}
                  highlightedIds={highlightedIds}
                  onSelectCandidate={handleSelectCandidate}
                />

                <OutcomeComparisonChart
                  comparisons={deterministicSummary.comparisons}
                  selectedCandidateId={selectedCandidateId}
                  onSelectCandidate={handleSelectCandidate}
                />

                <SourceInspector
                  packet={packet}
                  selectedCandidateId={selectedCandidateId}
                  activeCitationId={activeCitationId}
                  onClearSelection={handleClearSelection}
                />

                <AuditCard
                  packet={packet}
                  audit={
                    activeCampaign.reviewEligible &&
                    envelope?.responseStatus === 'validated' &&
                    envelope.review
                      ? envelope.review.unsupportedClaimAudit
                      : null
                  }
                  status={status}
                  activeCitationId={activeCitationId}
                  onSelectCitation={handleSelectCitation}
                />
              </div>

              <div className="min-w-0 space-y-5 lg:col-span-5">
                <ReviewPanel
                  packet={packet}
                  activeCampaign={activeCampaign}
                  onSelectCampaign={handleSelectCampaign}
                  status={status}
                  modelStatus={modelStatus}
                  envelope={envelope}
                  errorState={errorState}
                  exportGuardMessage={exportGuardMessage}
                  isStaticMode={IS_STATIC_MODE}
                  activeCitationId={activeCitationId}
                  onSelectCitation={handleSelectCitation}
                  onRunReview={handleRunReview}
                  onLoadRecordedReview={handleLoadRecordedReview}
                  reviewerNotes={reviewerNotes}
                  onChangeReviewerNotes={setReviewerNotes}
                />

                <ReferenceTopologyCard
                  compact={true}
                  onOpenFullReference={() => setActiveView('reference')}
                />
              </div>
            </div>
          </main>
        </div>
      ) : null}

      {activeView === 'campaigns' ? (
        <main id="main-campaigns" className="flex-1">
          <CampaignsView
            campaigns={SYNTHETIC_CAMPAIGNS}
            activeCampaign={activeCampaign}
            onSelectCampaignAndOpenWorkbench={(id) => {
              handleSelectCampaign(id);
              setActiveView('workbench');
            }}
            summary={deterministicSummary}
            evidenceHash={evidenceHash}
            status={status}
            envelope={envelope}
          />
        </main>
      ) : null}

      {activeView === 'reference' ? (
        <main id="main-reference" className="flex-1">
          <ReferenceEpistemicsView />
        </main>
      ) : null}

      {activeView === 'provenance' ? (
        <main id="main-provenance" className="flex-1">
          <ProvenanceView evidenceHash={evidenceHash} />
        </main>
      ) : null}

      <footer className="mt-8 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-slate-600 sm:px-6">
          <p>
            <strong>GammaFold</strong> · Isolated hackathon prototype adjacent to preexisting
            DeltaFold · 100% synthetic teaching dataset ({packet.packetId}) · No laboratory results
          </p>
          <p className="font-mono text-slate-500">
            {IS_STATIC_MODE
              ? 'Static recorded replay · Zero credentials · Human review required'
              : 'Requested model: gemini-4-carbon · Loopback only · Human review required'}
          </p>
        </div>
      </footer>
    </div>
  );
}
