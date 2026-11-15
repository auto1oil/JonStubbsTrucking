// Which state a GPS point is in, for IFTA. State outlines (low resolution,
// about 100 m) are bundled so the lookup needs no map service and works for
// every breadcrumb of every trip. Server-side only — the data is 60 KB and
// nothing in the browser needs it.

import states from '@/lib/data/us-states.json';

type Ring = [number, number][];
type StateShape = { code: string; name: string; rings: Ring[] };

const SHAPES = states as StateShape[];

// Bounding boxes, computed once, so most states are ruled out by four
// comparisons before any ray casting.
const BOXES = SHAPES.map((s) => {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const ring of s.rings) for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
});

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function stateAt(lat: number, lng: number): string | null {
  for (let i = 0; i < SHAPES.length; i++) {
    const b = BOXES[i];
    if (lng < b.minX || lng > b.maxX || lat < b.minY || lat > b.maxY) continue;
    for (const ring of SHAPES[i].rings) if (inRing(lng, lat, ring)) return SHAPES[i].code;
  }
  return null;
}
