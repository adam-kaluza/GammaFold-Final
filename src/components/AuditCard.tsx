import { renderFactAssertion } from '../domain/checks.ts';
import type {
  EvidencePacket,
  ReviewResponseStatus,
  UnsupportedClaimAudit,
} from '../domain/types.ts';
import { CitationList } from './CitationList.tsx';

interface AuditCardProps {
  packet: EvidencePacket;
  audit: UnsupportedClaimAudit | null;
  status: ReviewResponseStatus;
  activeCitationId: string | null;
  onSelectCitation: (id: string) => void;
}

export function AuditCard({
  packet,
  audit,
  status,
  activeCitationId,
  onSelectCitation,
}: AuditCardProps) {
  return (
    <section
      id="claim-audit"
      aria-labelledby="claim-audit-heading"
      className="rounded-md border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="claim-audit-heading" className="text-base font-semibold text-slate-900">
            Unsupported Claim Audit
          </h2>
          <span className="rounded bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-900">
            DELIBERATE HALLUCINATION TRAP · AUDIT-CLAIM-01
          </span>
        </div>
        <span className="font-mono text-xs font-medium text-slate-600">
          {audit
            ? `Model Verdict (${audit.auditId}): ${audit.verdict.toUpperCase()}`
            : 'Deterministic pre-check active'}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        <div className="rounded border border-amber-200 bg-amber-50/70 p-3">
          <p className="text-xs font-semibold text-amber-900">
            Supplied false claim under audit (AUDIT-CLAIM-01)
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">&ldquo;{packet.claimToCheck}&rdquo;</p>
        </div>

        {audit ? (
          <div className="space-y-2.5 rounded border border-slate-200 bg-slate-50/75 p-3">
            {audit.assertions.length > 0 ? (
              <div className="rounded border border-teal-200 bg-teal-50/60 p-2.5">
                <p className="font-mono text-[10px] font-semibold tracking-wide text-teal-900 uppercase">
                  Verified Source Assertions (Deterministic Render)
                </p>
                <ul className="mt-1 space-y-0.5 font-mono text-xs text-slate-900">
                  {audit.assertions.map((assertion, idx) => (
                    <li key={`${assertion.recordId}-${assertion.field}-${idx}`}>
                      {renderFactAssertion(assertion, packet)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <p className="text-xs font-semibold text-slate-800">
                  Audit refutation narrative
                </p>
                <span className="rounded bg-sky-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-900">
                  MODEL INTERPRETATION · HUMAN REVIEW REQUIRED
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-900">{audit.correction}</p>
            </div>

            <CitationList
              packet={packet}
              sourceIds={audit.sourceIds}
              activeCitationId={activeCitationId}
              onSelectCitation={onSelectCitation}
            />
          </div>
        ) : (
          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <p className="font-medium text-slate-900">
              {status === 'loading'
                ? 'Evaluating AUDIT-CLAIM-01 against frozen packet R01...'
                : 'Deterministic pre-audit check (available before live or recorded model review):'}
            </p>
            <p className="mt-1 leading-relaxed text-slate-600">
              <span className="font-mono font-semibold text-slate-800">0.91 RFU</span> exists only in
              prior synthetic prediction <span className="font-mono">P03</span> (not a measurement).{' '}
              <span className="font-mono">O03</span> failed instrument QC (<span className="font-mono">null</span>),{' '}
              <span className="font-mono">O04</span> was not received (<span className="font-mono">null</span>), and{' '}
              <span className="font-mono">O05</span> is left-censored (&lt; 0.10 RFU), leaving only 3 of 6 candidates measured.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
