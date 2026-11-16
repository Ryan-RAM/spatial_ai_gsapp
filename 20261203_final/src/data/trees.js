// Individual trees from a canopy height model (CHM): treetops, crowns, and an evergreen estimate
// (D-017). Pure functions on typed arrays laid out as idx = j * W + i, row 0 north, 1 m pixels.
// No DOM, no imports.

// Fills single-pixel pits (no vegetation return) inside the canopy, then a 3x3 Gaussian.
export function smoothChm(chm, W, H) {
  const filled = chm.slice();
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const k = j * W + i; if (chm[k] > 0) continue;
    let s = 0; let n = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const v = chm[k + dj * W + di]; if (v > 2) { s += v; n++; } }
    if (n >= 5) filled[k] = s / n;
  }
  const out = new Float32Array(W * H);
  const w = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let s = 0; let ws = 0; let q = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++, q++) {
      const ni = i + di; const nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      s += w[q] * filled[nj * W + ni]; ws += w[q];
    }
    out[j * W + i] = s / ws;
  }
  return out;
}

// The search radius (pixels = m) for a treetop of height h: wider crowns on taller trees.
export const topRadius = (h) => Math.min(4.5, Math.max(1.5, 1 + 0.08 * h));

// Treetops: pixels at least `minH` high that are the highest within topRadius(h). Ties go to the
// first pixel in scan order. Returns an Int32Array of pixel indices.
export function findTreetops(chm, W, H, minH = 4) {
  const tops = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i; const h = chm[k]; if (h < minH) continue;
    const r = topRadius(h); const R = Math.ceil(r); let top = true;
    for (let dj = -R; dj <= R && top; dj++) for (let di = -R; di <= R; di++) {
      if (!di && !dj) continue; if (di * di + dj * dj > r * r) continue;
      const ni = i + di; const nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const v = chm[nj * W + ni];
      if (v > h || (v === h && nj * W + ni < k)) { top = false; break; }
    }
    if (top) tops.push(k);
  }
  return Int32Array.from(tops);
}

// Crowns by seeded region growing, highest pixels first: a pixel joins the crown of a neighbour
// if it is at least max(2 m, 45 % of that tree's height), not more than 0.5 m above the neighbour,
// and within the crown's maximum radius of the treetop. Returns labels (Int32Array, tree index + 1,
// 0 = none) and each crown's pixel count.
export function growCrowns(chm, W, H, tops) {
  const label = new Int32Array(W * H);
  const area = new Int32Array(tops.length);
  // a binary max-heap of pixel indices keyed by height
  const heap = new Int32Array(W * H); let size = 0;
  const key = (k) => chm[k];
  const push = (k) => { let c = size++; heap[c] = k; while (c > 0) { const p = (c - 1) >> 1; if (key(heap[p]) >= key(heap[c])) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => {
    const top = heap[0]; heap[0] = heap[--size]; let c = 0;
    for (;;) { const l = 2 * c + 1; const r = l + 1; let m = c; if (l < size && key(heap[l]) > key(heap[m])) m = l; if (r < size && key(heap[r]) > key(heap[m])) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; }
    return top;
  };
  tops.forEach((k, t) => { label[k] = t + 1; area[t] = 1; push(k); });
  while (size) {
    const k = pop(); const t = label[k] - 1; const top = tops[t];
    const th = chm[top]; const ti = top % W; const tj = (top - ti) / W;
    const maxR = Math.min(12, 0.6 * th + 1); const floor = Math.max(2, 0.45 * th);
    const i = k % W; const j = (k - i) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di; const nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const n = nj * W + ni; if (label[n]) continue;
      const h = chm[n];
      if (h < floor || h > chm[k] + 0.5) continue;
      if ((ni - ti) ** 2 + (nj - tj) ** 2 > maxR * maxR) continue;
      label[n] = t + 1; area[t]++; push(n);
    }
  }
  return { label, area };
}

// Otsu's threshold of values in [0, 1] (256 bins): the split that best separates two groups.
export function otsu(values) {
  const hist = new Float64Array(256);
  for (const v of values) hist[Math.min(255, Math.max(0, Math.floor(v * 256)))]++;
  const total = values.length; let sumAll = 0; for (let b = 0; b < 256; b++) sumAll += b * hist[b];
  let wB = 0; let sumB = 0; let best = 0; let bestB = 0;
  for (let b = 0; b < 256; b++) {
    wB += hist[b]; if (!wB) continue; const wF = total - wB; if (!wF) break;
    sumB += b * hist[b];
    const mB = sumB / wB; const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; bestB = b; }
  }
  return (bestB + 1) / 256;
}

// Trunk radius in metres from tree height: a simple allometry for park hardwoods (D-018).
export const trunkRadius = (h) => 0.05 + 0.011 * h;
