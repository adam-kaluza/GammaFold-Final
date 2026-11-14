import { resolveSourceItems } from '../domain/checks.ts';
import type { EvidencePacket } from '../domain/types.ts';

interface CitationListProps {
  packet: EvidencePacket;
  sourceIds: readonly string[];
  activeCitationId: string | null;
  onSelectCitation: (sourceId: string) => void;
  showReferencedValues?: boolean;
}

export function CitationList({
  packet,
  sourceIds,
  activeCitationId,
  onSelectCitation,
  showReferencedValues = true,
}: CitationListProps) {
  const resolved = resolveSourceItems(packet, sourceIds);

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Source citations">
        <span className="text-xs font-medium text-slate-500">Citations:</span>
        {sourceIds.map((id, idx) => {
          const isActive = activeCitationId === id;
          return (
            <button
              key={`${id}-${idx}`}
              type="button"
              onClick={() => onSelectCitation(id)}
              aria-pressed={isActive}
              className={
                isActive
                  ? 'rounded border border-teal-700 bg-teal-700 px-2 py-0.5 font-mono text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700'
                  : 'rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-xs font-medium text-slate-800 hover:border-teal-700 hover:bg-teal-50 hover:text-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700'
              }
            >
              {id}
            </button>
          );
        })}
      </div>

      {showReferencedValues && resolved.length > 0 ? (
        <ul className="space-y-0.5 border-t border-slate-200/80 pt-1.5 text-xs text-slate-600">
          {resolved.map((item) => (
            <li key={item.id} className="font-mono text-[11px] leading-relaxed text-slate-700">
              <span className="font-semibold text-slate-900">Source {item.id}:</span> {item.summary}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
