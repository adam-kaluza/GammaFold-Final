interface ProvenanceViewProps {
  evidenceHash: string;
}

export function ProvenanceView({ evidenceHash }: ProvenanceViewProps) {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6">
      <div className="border-b border-slate-200 pb-4">
        <p className="font-mono text-xs font-semibold text-teal-800 uppercase">
          Honest Provenance, DeltaFold Boundary &amp; Caveats
        </p>
        <h1 className="font-display mt-1 text-2xl font-bold text-slate-900">
          Provenance, Model Policy &amp; Evidence Limitations
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Transparent attribution of preexisting DeltaFold context, original Hydrogen-generated
          hackathon prototypes, the Carbon-authored GammaFold workbench, and exact runtime
          and static-replay boundaries.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900">
            1. Relationship to Existing Production DeltaFold
          </h2>
          <p className="text-xs leading-relaxed text-slate-700">
            <strong>DeltaFold</strong> is Adam Kaluza&apos;s preexisting protein research workbench.
            DeltaFold production remains unchanged and separate.
          </p>
          <p className="text-xs leading-relaxed text-slate-700">
            <strong>GammaFold</strong> is an isolated software-only hackathon prototype created
            on November 14, 2026. It imports zero source modules from production DeltaFold, connects to
            no live DeltaFold servers, user accounts, Firebase stores, or scheduled jobs, and operates
            solely on local synthetic demonstration state with explicit reset and JSON export.
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900">
            2. Truthful Authoring, Loopback Live Policy &amp; Static Replay
          </h2>
          <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-slate-700">
            <li>
              <strong>Preexisting Hackathon Backups (Hydrogen-Generated):</strong> Original{' '}
              <code>DeltaFold Evidence Copilot</code> and the earlier <code>GammaFold</code> AI Studio
              exports on November 14, 2026 were generated with <code>gemini-4-hydrogen</code> and are
              preserved intact without relabeling.
            </li>
            <li>
              <strong>Original GammaFold Integration (Carbon-Authored):</strong> This unified
              application and its post-audit <code>3.0.0</code> deterministic validation upgrades in{' '}
              <code>hackathon/2026-11-14/gammafold</code> were authored using{' '}
              <code>gemini-4-carbon</code> through the Antigravity harness.
            </li>
            <li>
              <strong>Current Name &amp; Maintenance:</strong> The integrated project was permanently
              named GammaFold on November 15, 2026. Codex-assisted naming and compatibility updates
              are separate from the original Carbon authoring. Original runtime recordings remain unchanged.
            </li>
            <li>
              <strong>Loopback-Only Live Runtime Policy:</strong> Local server mode binds strictly to
              loopback (<code>127.0.0.1</code>), requires explicit opt-in{' '}
              <code>GAMMAFOLD_LIVE_MODE=true</code> alongside a server-side{' '}
              <code>GEMINI_API_KEY</code>, enforces a bounded session request budget and cooldown,
              withholds raw upstream error strings from public HTTP responses, and verifies returned{' '}
              <code>modelVersion</code> (quarantining non-Carbon model versions and keeping{' '}
              <code>runtimeAccessProven: false</code> whenever <code>modelVersion</code> is absent).
            </li>
            <li>
              <strong>Credential-Free Static Replay Mode:</strong> Static builds (
              <code>dist-static/</code>) include zero credentials and make zero live provider calls,
              instead verifying and re-validating a genuine post-correction <code>3.0.0</code>{' '}
              recorded artifact at <code>./recorded/carbon-review-R01.json</code> while preserving
              fixed original runtime timestamps.
            </li>
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900">
            3. Scope, Validation Limits &amp; Scientific Non-Claims
          </h2>
          <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-slate-700">
            <li>
              <strong>Software Evidence-Review Demonstration Only:</strong> Uses exclusively the six
              fictional solubility records (<code>C01</code>–<code>C06</code>,{' '}
              <code>SYNTH-PKT-R01</code>, units <code>RFU</code>).
            </li>
            <li>
              <strong>Deterministic Checks vs. Heuristic Prose Screening:</strong> Structured{' '}
              <code>FactAssertion</code> tuples (<code>recordId/field/status/qualifier/value/units</code>),
              citation IDs, <code>AUDIT-CLAIM-01</code> refutation requirements, and the 4-slot cap
              are verified deterministically against frozen packet <code>SYNTH-PKT-R01</code>.
              Free-text narrative prose is screened for uncited record IDs, decimal precision,
              integer/slot conflicts, and uncalibrated statistical phrases, but remains model
              interpretation requiring human review.
            </li>
            <li>
              <strong>No Sequence Design, Docking, or Wet-Lab Protocols:</strong> Does not generate or
              optimize protein sequences, compute molecular docking or binding affinity, include
              pathogen/disease datasets, or prescribe experimental protocols, and makes no claims of
              laboratory efficacy, statistical significance (<code>replicates = 1</code>), or cost
              savings.
            </li>
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900">
            4. Deterministic Integrity &amp; Temporary Resource Notice
          </h2>
          <p className="text-xs leading-relaxed text-slate-700">
            Canonical SHA-256 fingerprint for frozen packet <code>SYNTH-PKT-R01</code>:
          </p>
          <code className="block rounded bg-slate-100 p-2.5 font-mono text-[11px] text-slate-900 break-all">
            {evidenceHash}
          </code>
          <p className="text-xs leading-relaxed text-slate-600">
            Event-supplied temporary cloud accounts and API keys are restricted to local loopback
            hackathon use during the event window and may expire upon event conclusion. Exported{' '}
            <code>3.0.0</code> JSON review packets preserve full source, SHA-256 hash, campaign
            binding, model identity, and validation metadata without secrets.
          </p>
        </section>
      </div>
    </div>
  );
}
