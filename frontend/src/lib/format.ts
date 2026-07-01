import type { Dict } from "../i18n/translations";

// Ring identifiers from the backend look like "ring_07_cycle" or
// "ring_13_fan_in". This turns them into something a human can read,
// e.g. "Collection #13".
export function parseRing(ring?: string | null): { num: string; kind: string } | null {
  if (!ring) return null;
  const m = ring.match(/^ring_(\d+)_(.+)$/);
  if (!m) return { num: "", kind: ring };
  return { num: m[1], kind: m[2] };
}

export function ringLabel(ring: string | null | undefined, t: Dict): string {
  const p = parseRing(ring);
  if (!p) return "—";
  const kinds = t.ringKinds as Record<string, string>;
  const kind = kinds[p.kind] ?? p.kind;
  return p.num ? `${kind} #${p.num}` : kind;
}

export function ringKindLabel(kind: string, t: Dict): string {
  const kinds = t.ringKinds as Record<string, string>;
  return kinds[kind] ?? kind;
}
