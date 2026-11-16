// A small reader for tiled GeoTIFFs and Cloud-Optimized GeoTIFFs (D-012): classic TIFF and
// BigTIFF, DEFLATE or uncompressed, horizontal (2) or floating-point (3) predictor, 32-bit float
// samples, one band. Data is read through `read(offset, length) -> Promise<Uint8Array>`, so a
// remote file needs only HTTP range requests for the header and the tiles a window touches.
// Shared by the bake scripts and the MCP server (terrain.tile). Node only (node:zlib).

import { inflateSync } from 'node:zlib';
import { get } from './http.js';

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };
const TAGS = {
  256: 'width', 257: 'height', 258: 'bitsPerSample', 259: 'compression', 277: 'samplesPerPixel',
  284: 'planar', 317: 'predictor', 322: 'tileWidth', 323: 'tileLength', 324: 'tileOffsets',
  325: 'tileByteCounts', 339: 'sampleFormat', 33550: 'pixelScale', 33922: 'tiepoint',
  34735: 'geoKeys', 34736: 'geoDoubles', 34737: 'geoAscii', 42113: 'noData',
};

export const httpRangeReader = (url) => (offset, length) => get(url, { as: 'bytes', range: [offset, offset + length - 1] });

function view(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }

function readValues(dv, le, type, count, at) {
  const out = new Array(count);
  for (let k = 0; k < count; k++) {
    const o = at + k * TYPE_SIZE[type];
    switch (type) {
      case 1: case 6: case 7: out[k] = dv.getUint8(o); break;
      case 3: out[k] = dv.getUint16(o, le); break;
      case 8: out[k] = dv.getInt16(o, le); break;
      case 4: out[k] = dv.getUint32(o, le); break;
      case 9: out[k] = dv.getInt32(o, le); break;
      case 16: out[k] = Number(dv.getBigUint64(o, le)); break;
      case 17: out[k] = Number(dv.getBigInt64(o, le)); break;
      case 11: out[k] = dv.getFloat32(o, le); break;
      case 12: out[k] = dv.getFloat64(o, le); break;
      case 2: out[k] = dv.getUint8(o); break;
      default: throw new Error(`TIFF type ${type} not supported`);
    }
  }
  return out;
}

// Reads the first IFD (full resolution). `head` bytes cover the header; values that lie beyond it
// are fetched with extra reads.
export async function openGeoTiff(read, headBytes = 65536) {
  let head = await read(0, headBytes);
  const fetchAt = async (offset, length) => {
    if (offset + length <= head.length) return head.subarray(offset, offset + length);
    return read(offset, length);
  };
  const dv0 = view(head);
  const le = head[0] === 0x49;
  const big = dv0.getUint16(2, le) === 43;
  const ifdOffset = big ? Number(dv0.getBigUint64(8, le)) : dv0.getUint32(4, le);
  const entrySize = big ? 20 : 12;
  const cntBytes = await fetchAt(ifdOffset, big ? 8 : 2);
  const n = big ? Number(view(cntBytes).getBigUint64(0, le)) : view(cntBytes).getUint16(0, le);
  const entries = await fetchAt(ifdOffset + (big ? 8 : 2), n * entrySize);
  const dv = view(entries);
  const tags = {};
  for (let k = 0; k < n; k++) {
    const e = k * entrySize;
    const tag = dv.getUint16(e, le); const type = dv.getUint16(e + 2, le);
    const count = big ? Number(dv.getBigUint64(e + 4, le)) : dv.getUint32(e + 4, le);
    const name = TAGS[tag]; if (!name) continue;
    const size = TYPE_SIZE[type] * count; const inline = big ? 8 : 4;
    let values;
    if (size <= inline) values = readValues(dv, le, type, count, e + (big ? 12 : 8));
    else {
      const off = big ? Number(dv.getBigUint64(e + 12, le)) : dv.getUint32(e + 8, le);
      const bytes = await fetchAt(off, size);
      values = type === 2 ? new TextDecoder().decode(bytes) : readValues(view(bytes), le, type, count, 0);
    }
    tags[name] = type === 2 && typeof values !== 'string' ? String.fromCharCode(...values) : values;
  }
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  const info = {
    width: one(tags.width), height: one(tags.height),
    tileWidth: one(tags.tileWidth), tileLength: one(tags.tileLength),
    bits: one(tags.bitsPerSample), sampleFormat: one(tags.sampleFormat ?? 1),
    compression: one(tags.compression), predictor: one(tags.predictor ?? 1),
    tileOffsets: tags.tileOffsets, tileByteCounts: tags.tileByteCounts,
    pixelScale: tags.pixelScale, tiepoint: tags.tiepoint,
    noData: tags.noData != null ? parseFloat(String(tags.noData).replace(/\0/g, '')) : null,
    geoKeys: parseGeoKeys(tags.geoKeys, tags.geoDoubles, tags.geoAscii),
  };
  if (!info.tileWidth) throw new Error('only tiled GeoTIFFs are supported');
  if (info.bits !== 32 || info.sampleFormat !== 3) throw new Error('only float32 samples are supported');
  if (![1, 8, 32946].includes(info.compression)) throw new Error(`compression ${info.compression} not supported`);
  // pixel (col, row) centre -> projected coordinates
  const [, , , X0, Y0] = info.tiepoint; const [sx, sy] = info.pixelScale;
  info.toProjected = (col, row) => [X0 + (col + 0.5) * sx, Y0 - (row + 0.5) * sy];
  info.toPixel = (X, Y) => [(X - X0) / sx - 0.5, (Y0 - Y) / sy - 0.5];
  info.read = read; info.le = le;
  return info;
}

function parseGeoKeys(keys, doubles = [], ascii = '') {
  if (!keys) return {};
  const NAMES = { 1024: 'GTModelType', 1025: 'GTRasterType', 2048: 'GeographicType', 3072: 'ProjectedCSType', 3076: 'ProjLinearUnits', 4096: 'VerticalCSType', 4099: 'VerticalUnits', 1026: 'GTCitation', 3073: 'PCSCitation' };
  const out = {};
  for (let k = 4; k + 3 < keys.length; k += 4) {
    const [id, loc, count, off] = keys.slice(k, k + 4);
    const v = loc === 0 ? off : loc === 34736 ? doubles.slice(off, off + count) : loc === 34737 ? String(ascii).slice(off, off + count).replace(/\|$/, '') : off;
    out[NAMES[id] ?? id] = v;
  }
  return out;
}

// Decodes one tile into a Float32Array of tileWidth * tileLength samples.
export async function readTile(tif, tx, ty) {
  const tilesAcross = Math.ceil(tif.width / tif.tileWidth);
  const k = ty * tilesAcross + tx;
  if (!tif.tileByteCounts[k]) return new Float32Array(tif.tileWidth * tif.tileLength).fill(NaN); // sparse tile
  const bytes = await tif.read(tif.tileOffsets[k], tif.tileByteCounts[k]);
  let raw = tif.compression === 1 ? bytes : inflateSync(bytes);
  const w = tif.tileWidth; const h = tif.tileLength;
  const out = new Float32Array(w * h);
  if (tif.predictor === 3) {
    // floating-point predictor: per row, the bytes of all samples are split into planes (most
    // significant byte first) and differenced along the row
    const row = new Uint8Array(w * 4);
    const ov = new DataView(out.buffer);
    for (let y = 0; y < h; y++) {
      row.set(raw.subarray(y * w * 4, (y + 1) * w * 4));
      for (let i = 1; i < row.length; i++) row[i] = (row[i] + row[i - 1]) & 255;
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        ov.setUint8(o, row[x]); ov.setUint8(o + 1, row[w + x]); ov.setUint8(o + 2, row[2 * w + x]); ov.setUint8(o + 3, row[3 * w + x]);
        out[y * w + x] = ov.getFloat32(o, false);
      }
    }
  } else {
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    for (let i = 0; i < w * h; i++) out[i] = dv.getFloat32(i * 4, tif.le);
    if (tif.predictor === 2) throw new Error('integer predictor on float data not supported');
  }
  return out;
}

// Reads a window of full-resolution pixels [col0, col1) x [row0, row1) into a Float32Array.
// No-data samples become NaN.
export async function readWindow(tif, col0, row0, col1, row1, { onTile } = {}) {
  const W = col1 - col0; const H = row1 - row0;
  const out = new Float32Array(W * H).fill(NaN);
  const tw = tif.tileWidth; const th = tif.tileLength;
  const tilesDown = Math.ceil(tif.height / th); const tilesAcross = Math.ceil(tif.width / tw);
  for (let ty = Math.max(0, Math.floor(row0 / th)); ty <= Math.min(tilesDown - 1, Math.floor((row1 - 1) / th)); ty++) {
    for (let tx = Math.max(0, Math.floor(col0 / tw)); tx <= Math.min(tilesAcross - 1, Math.floor((col1 - 1) / tw)); tx++) {
      const tile = await readTile(tif, tx, ty);
      onTile?.(tx, ty);
      for (let y = 0; y < th; y++) {
        const r = ty * th + y; if (r < row0 || r >= row1 || r >= tif.height) continue;
        for (let x = 0; x < tw; x++) {
          const c = tx * tw + x; if (c < col0 || c >= col1 || c >= tif.width) continue;
          const v = tile[y * tw + x];
          out[(r - row0) * W + (c - col0)] = tif.noData != null && Math.abs(v - tif.noData) < Math.abs(tif.noData) * 1e-6 ? NaN : v;
        }
      }
    }
  }
  return out;
}

// The pixel <-> projected transforms from cached georeferencing (no file access): enough for the
// bake steps that work on a cached window.
export function georefFromJson({ width, height, tiepoint, pixelScale, noData, geoKeys }) {
  const [, , , X0, Y0] = tiepoint; const [sx, sy] = pixelScale;
  return {
    width, height, tiepoint, pixelScale, noData, geoKeys,
    toProjected: (col, row) => [X0 + (col + 0.5) * sx, Y0 - (row + 0.5) * sy],
    toPixel: (X, Y) => [(X - X0) / sx - 0.5, (Y0 - Y) / sy - 0.5],
  };
}
