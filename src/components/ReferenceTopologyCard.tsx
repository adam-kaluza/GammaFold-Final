import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  BENIGN_REFERENCE_METADATA,
  projectTopologyNodes,
  SCHEMATIC_1UBQ_NODES,
  type SecondaryTopologyKind,
} from '../domain/reference1ubq.ts';

interface ReferenceTopologyCardProps {
  compact?: boolean;
  onOpenFullReference?: () => void;
}

function strokeForSecondary(kind: SecondaryTopologyKind): string {
  switch (kind) {
    case 'sheet':
      return '#0F766E';
    case 'helix':
      return '#1D4ED8';
    case 'loop':
      return '#64748B';
  }
}

export function ReferenceTopologyCard({
  compact = false,
  onOpenFullReference,
}: ReferenceTopologyCardProps) {
  const [yawDeg, setYawDeg] = useState<number>(28);
  const [pitchDeg, setPitchDeg] = useState<number>(16);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [hoveredNodeIndex, setHoveredNodeIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!autoRotate) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setAutoRotate(false);
      return;
    }
    const id = window.setInterval(() => {
      setYawDeg((prev) => {
        const next = prev + 2;
        return next > 180 ? -180 : next;
      });
    }, 60);
    return () => window.clearInterval(id);
  }, [autoRotate]);

  const width = 360;
  const height = compact ? 185 : 235;
  const scale = compact ? 6.1 : 7.4;

  const projected = useMemo(
    () => projectTopologyNodes(SCHEMATIC_1UBQ_NODES, yawDeg, pitchDeg, width, height, scale),
    [yawDeg, pitchDeg, width, height, scale],
  );

  const segments = useMemo(() => {
    const out: Array<{
      key: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      avgDepth: number;
      secondary: SecondaryTopologyKind;
    }> = [];
    for (let i = 0; i < projected.length - 1; i += 1) {
      const a = projected[i];
      const b = projected[i + 1];
      out.push({
        key: `${a.index}-${b.index}`,
        x1: a.screenX,
        y1: a.screenY,
        x2: b.screenX,
        y2: b.screenY,
        avgDepth: (a.depth + b.depth) / 2,
        secondary: a.secondary,
      });
    }
    return out.sort((a, b) => a.avgDepth - b.avgDepth);
  }, [projected]);

  const sortedNodes = useMemo(
    () => [...projected].sort((a, b) => a.depth - b.depth),
    [projected],
  );

  const activeNode =
    projected.find((n) => n.index === hoveredNodeIndex) ?? projected[26];

  return (
    <section
      aria-labelledby={compact ? 'ref-topology-compact-heading' : 'ref-topology-full-heading'}
      className="rounded-md border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id={compact ? 'ref-topology-compact-heading' : 'ref-topology-full-heading'}
              className="text-sm font-semibold text-slate-900"
            >
              Benign Reference Context: {BENIGN_REFERENCE_METADATA.pdbId} Schematic Fold
            </h3>
            <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-800">
              REFERENCE ANNOTATION · GEOMETRIC ILLUSTRATION
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-600">
            Parametric 76-node β-grasp illustration — not atomic coordinates or candidate structures
          </p>
        </div>

        {compact && onOpenFullReference ? (
          <button
            type="button"
            onClick={onOpenFullReference}
            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            Epistemic Guide
          </button>
        ) : null}
      </div>

      <div className="mt-3 rounded-md border border-slate-800 bg-[#061830] p-3 text-slate-100">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="font-mono text-sky-200">
            Schematic Node #{activeNode.index}/76 · {activeNode.segmentLabel} ({activeNode.secondary})
          </span>
          <span className="font-mono text-slate-300">
            Yaw {yawDeg}° · Pitch {pitchDeg}°
          </span>
        </div>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Schematic 3D geometric illustration inspired by benign Ubiquitin 1UBQ beta-grasp topology. Reference annotation only."
          className="w-full select-none rounded bg-[#092140]"
        >
          <defs>
            <pattern id="refGrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="rgba(148,163,184,0.09)"
                strokeWidth="0.75"
              />
            </pattern>
          </defs>
          <rect width={width} height={height} fill="url(#refGrid)" />

          {segments.map((seg) => {
            const strokeWidth =
              seg.secondary === 'sheet' ? 4.2 : seg.secondary === 'helix' ? 3.6 : 2.1;
            const opacity = Math.min(1, Math.max(0.38, 0.72 + seg.avgDepth / 34));
            return (
              <line
                key={seg.key}
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                stroke={strokeForSecondary(seg.secondary)}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                opacity={opacity}
              />
            );
          })}

          {sortedNodes.map((node) => {
            const isActive = node.index === activeNode.index;
            const radius = isActive ? 4.4 : node.secondary === 'loop' ? 1.9 : 2.6;
            const fill =
              node.secondary === 'sheet'
                ? '#2DD4BF'
                : node.secondary === 'helix'
                  ? '#60A5FA'
                  : '#CBD5E1';
            return (
              <circle
                key={node.index}
                cx={node.screenX}
                cy={node.screenY}
                r={radius}
                fill={isActive ? '#FBBF24' : fill}
                stroke="#061830"
                strokeWidth={isActive ? 1.4 : 0.7}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredNodeIndex(node.index)}
              >
                <title>
                  Schematic node {node.index}: {node.segmentLabel} ({node.secondary})
                </title>
              </circle>
            );
          })}
        </svg>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-200">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-xs bg-teal-400" aria-hidden="true" />
              <span>■ β-Sheet</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-400" aria-hidden="true" />
              <span>● α-Helix</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 bg-slate-300" aria-hidden="true" />
              <span>─ Loop</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <label htmlFor={compact ? 'yaw-compact' : 'yaw-full'} className="sr-only">
              Rotate schematic yaw angle
            </label>
            <input
              id={compact ? 'yaw-compact' : 'yaw-full'}
              type="range"
              min={-180}
              max={180}
              value={yawDeg}
              onChange={(e) => setYawDeg(Number(e.target.value))}
              className="w-24 accent-teal-400"
            />
            <button
              type="button"
              onClick={() => setAutoRotate((prev) => !prev)}
              aria-pressed={autoRotate}
              className="inline-flex items-center gap-1 rounded border border-white/20 bg-white/10 px-2 py-1 text-[11px] font-medium text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
            >
              {autoRotate ? (
                <>
                  <Pause className="h-3 w-3" aria-hidden="true" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" aria-hidden="true" />
                  <span>Spin</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setAutoRotate(false);
                setYawDeg(28);
                setPitchDeg(16);
                setHoveredNodeIndex(null);
              }}
              className="inline-flex items-center gap-1 rounded border border-white/20 bg-white/10 px-2 py-1 text-[11px] font-medium text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-slate-600">
        {BENIGN_REFERENCE_METADATA.disclaimer}
      </p>
    </section>
  );
}
