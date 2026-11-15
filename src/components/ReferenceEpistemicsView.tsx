import { ReferenceTopologyCard } from './ReferenceTopologyCard.tsx';

const EPISTEMIC_CLASSES = [
  {
    badge: 'SYNTHETIC MEASUREMENT',
    examples:
      'O01 (0.72 RFU), O02 (0.00 RFU valid zero), O03 (null failed), O04 (null missing), O05 (< 0.10 RFU censored), O06 (0.65 RFU)',
    meaning:
      'Immutable synthetic assay observations recorded for Round R01. Non-measured statuses remain distinct and are never coerced to 0.00 or point values.',
    allowedUse:
      'Primary ground truth within this synthetic teaching packet; never mutated by model output.',
  },
  {
    badge: 'PRIOR PREDICTION',
    examples:
      'P01 (0.68 RFU), P02 (0.80 RFU), P03 (0.91 RFU), P04 (0.74 RFU), P05 (0.25 RFU), P06 (0.60 RFU)',
    meaning:
      'Pre-outcome synthetic model scores (in RFU) frozen before Round R01 outcomes were observed.',
    allowedUse:
      'Used only to compute Obs − Pred deltas on measured rows; never substituted when an observation is failed, missing, or censored.',
  },
  {
    badge: 'REFERENCE ANNOTATION',
    examples: 'PDB 1UBQ 76-node β-grasp geometric topology illustration',
    meaning:
      'Benign visual fold schematic illustrating how reference context is separated from assay records.',
    allowedUse:
      'Orientation only. Synthetic candidates C01–C06 have no real amino acid sequences, atomic coordinates, or docking poses.',
  },
  {
    badge: 'MODEL INTERPRETATION',
    examples:
      'Structured FactAssertion tuples (deterministically rendered) + screened narrative prose & AUDIT-CLAIM-01 refutation',
    meaning:
      'Structured record/field/status/value/unit assertions verified deterministically against packet R01, paired with bounded narrative prose.',
    allowedUse:
      'Displayed only when structured FactAssertion tuples, citations, 4-slot budget, model identity, and narrative screening checks pass; free-text prose still requires human review.',
  },
  {
    badge: 'PROPOSED ACTION · HUMAN GATE',
    examples: 'Constrained follow-up allocation (positive integers summing to <= 4 synthetic slots)',
    meaning:
      'Candidate follow-up suggestions (e.g., re-running failed QC O03 or locating missing sample S04).',
    allowedUse:
      'Held behind an explicit human sign-off gate; GammaFold never executes laboratory protocols or mutates campaigns automatically.',
  },
];

export function ReferenceEpistemicsView() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6">
      <div className="border-b border-slate-200 pb-4">
        <p className="font-mono text-xs font-semibold text-teal-800 uppercase">
          Reference Display &amp; Epistemic Separation
        </p>
        <h1 className="font-display mt-1 text-2xl font-bold text-slate-900">
          Benign 1UBQ Topology Schematic &amp; Five-Way Epistemic Boundary
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Scientific software fails when model prose, pre-outcome predictions, reference illustrations,
          and recorded assay outcomes are blurred together. GammaFold enforces explicit separation
          across all five information classes.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <ReferenceTopologyCard compact={false} />
        </div>

        <div className="space-y-4 lg:col-span-7">
          <section
            aria-labelledby="epistemic-matrix-heading"
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <div className="border-b border-slate-200 px-4 py-3.5 sm:px-5">
              <h2 id="epistemic-matrix-heading" className="text-base font-semibold text-slate-900">
                Epistemic Separation Matrix
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Every value rendered or exported by GammaFold belongs to exactly one class below.
              </p>
            </div>

            <div className="divide-y divide-slate-200">
              {EPISTEMIC_CLASSES.map((row) => (
                <div key={row.badge} className="space-y-1.5 p-4 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-semibold text-white">
                      {row.badge}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">{row.examples}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-800">{row.meaning}</p>
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">Enforcement: </span>
                    {row.allowedUse}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
