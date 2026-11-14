// Benign Reference Annotation — Schematic Geometric Topology Illustration Only.
// Inspired by the canonical 76-residue beta-grasp topology of Ubiquitin (PDB 1UBQ).
// Explicitly non-experimental parametric geometry: NOT atomic PDB coordinates, NOT a docking surface,
// and NOT linked to synthetic solubility candidates C01–C06.

export type SecondaryTopologyKind = 'sheet' | 'helix' | 'loop';

export interface TopologySchematicNode {
  readonly index: number;
  readonly segmentLabel: string;
  readonly secondary: SecondaryTopologyKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ProjectedTopologyNode extends TopologySchematicNode {
  readonly screenX: number;
  readonly screenY: number;
  readonly depth: number;
}

interface SegmentRange {
  readonly start: number;
  readonly end: number;
  readonly kind: SecondaryTopologyKind;
  readonly label: string;
}

const UBIQUITIN_BETA_GRASP_SEGMENTS: readonly SegmentRange[] = [
  { start: 1, end: 7, kind: 'sheet', label: 'β1 strand' },
  { start: 8, end: 11, kind: 'loop', label: 'β1–β2 hairpin turn' },
  { start: 12, end: 17, kind: 'sheet', label: 'β2 strand' },
  { start: 18, end: 22, kind: 'loop', label: 'β2–α1 connector' },
  { start: 23, end: 34, kind: 'helix', label: 'α1 main helix' },
  { start: 35, end: 40, kind: 'loop', label: 'α1–β3 loop' },
  { start: 41, end: 45, kind: 'sheet', label: 'β3 strand' },
  { start: 46, end: 47, kind: 'loop', label: 'β3–β4 turn' },
  { start: 48, end: 50, kind: 'sheet', label: 'β4 strand' },
  { start: 51, end: 65, kind: 'loop', label: '3₁₀/loop arch' },
  { start: 66, end: 72, kind: 'sheet', label: 'β5 C-terminal strand' },
  { start: 73, end: 76, kind: 'loop', label: 'C-terminal tail' },
];

function buildSchematic1UbqNodes(): readonly TopologySchematicNode[] {
  const raw: Array<{ index: number; segmentLabel: string; secondary: SecondaryTopologyKind; x: number; y: number; z: number }> = [];

  for (let i = 1; i <= 76; i += 1) {
    const seg =
      UBIQUITIN_BETA_GRASP_SEGMENTS.find((s) => i >= s.start && i <= s.end) ??
      UBIQUITIN_BETA_GRASP_SEGMENTS[UBIQUITIN_BETA_GRASP_SEGMENTS.length - 1];

    const t = (i - 1) / 75;
    let x = 0;
    let y = 0;
    let z = 0;

    if (seg.label === 'β1 strand') {
      const u = (i - 1) / 6;
      x = -12 + u * 16;
      y = -9 + (i % 2 === 0 ? 0.9 : -0.9);
      z = -6;
    } else if (seg.label === 'β1–β2 hairpin turn') {
      const u = (i - 7) / 4;
      x = 4 + Math.sin(u * Math.PI) * 3.2;
      y = -9 + u * 5.5;
      z = -6 + Math.sin(u * Math.PI) * 1.8;
    } else if (seg.label === 'β2 strand') {
      const u = (i - 12) / 5;
      x = 4 - u * 15;
      y = -3.5 + (i % 2 === 0 ? 0.9 : -0.9);
      z = -5;
    } else if (seg.label === 'β2–α1 connector') {
      const u = (i - 17) / 5;
      x = -11 + u * 3;
      y = -3.5 + u * 6.5;
      z = -5 + u * 12;
    } else if (seg.label === 'α1 main helix') {
      const u = i - 23;
      const angle = u * ((2 * Math.PI) / 3.6);
      x = -8 + u * 1.45 + Math.cos(angle) * 2.8;
      y = 3.5 + Math.sin(angle) * 2.8;
      z = 7 + Math.cos(angle + 1.1) * 2.2;
    } else if (seg.label === 'α1–β3 loop') {
      const u = (i - 34) / 6;
      x = 8 - u * 4;
      y = 3.5 - u * 2.5;
      z = 7 - u * 10;
    } else if (seg.label === 'β3 strand') {
      const u = (i - 41) / 4;
      x = 4 - u * 12;
      y = 1.5 + (i % 2 === 0 ? 0.85 : -0.85);
      z = -3;
    } else if (seg.label === 'β3–β4 turn') {
      const u = (i - 45) / 2;
      x = -8 - Math.sin(u * Math.PI) * 2.2;
      y = 1.5 + u * 4.2;
      z = -3;
    } else if (seg.label === 'β4 strand') {
      const u = (i - 48) / 2;
      x = -8 + u * 8;
      y = 5.8 + (i % 2 === 0 ? 0.8 : -0.8);
      z = -2.2;
    } else if (seg.label === '3₁₀/loop arch') {
      const u = (i - 50) / 15;
      x = Math.sin(u * Math.PI) * 9;
      y = 6 + Math.sin(u * Math.PI) * 4.5 - u * 10;
      z = -2 + Math.sin(u * Math.PI) * 6 - u * 2.5;
    } else if (seg.label === 'β5 C-terminal strand') {
      const u = (i - 66) / 6;
      x = 2 - u * 11;
      y = -6.3 + (i % 2 === 0 ? 0.85 : -0.85);
      z = -5.5;
    } else {
      const u = (i - 72) / 4;
      x = -9 - u * 5.5;
      y = -6.3 - u * 3.5 + t * 0.5;
      z = -5.5 + u * 2.5;
    }

    raw.push({
      index: i,
      segmentLabel: seg.label,
      secondary: seg.kind,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      z: Number(z.toFixed(2)),
    });
  }

  return Object.freeze(raw.map((n) => Object.freeze(n)));
}

export const SCHEMATIC_1UBQ_NODES: readonly TopologySchematicNode[] = buildSchematic1UbqNodes();

export const BENIGN_REFERENCE_METADATA = Object.freeze({
  pdbId: '1UBQ',
  name: 'Ubiquitin (Schematic β-Grasp Topology Illustration)',
  nodeCount: 76,
  epistemicClass: 'reference_annotation' as const,
  disclaimer:
    'Schematic parametric illustration of the 76-node Ubiquitin (PDB 1UBQ) β-grasp fold. Shown solely as benign visual orientation — synthetic assay candidates C01–C06 have no real amino acid sequences, atomic coordinates, or docking poses.',
});

export function projectTopologyNodes(
  nodes: readonly TopologySchematicNode[],
  yawDeg: number,
  pitchDeg: number,
  width = 360,
  height = 210,
  scale = 6.8,
): ProjectedTopologyNode[] {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  const cx = width / 2;
  const cy = height / 2;

  return nodes.map((n) => {
    const rx = n.x * cosY + n.z * sinY;
    const rz1 = -n.x * sinY + n.z * cosY;
    const ry = n.y * cosP - rz1 * sinP;
    const rz = n.y * sinP + rz1 * cosP;

    return {
      ...n,
      screenX: Number((cx + rx * scale).toFixed(2)),
      screenY: Number((cy - ry * scale).toFixed(2)),
      depth: Number(rz.toFixed(2)),
    };
  });
}
