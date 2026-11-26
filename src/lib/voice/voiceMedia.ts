/* ============================================================================
 * مدّةُ التسجيل من حاويته — لا من `audio.duration` (صِرفٌ ومفحوصٌ بسلوكه: voice-test).
 *
 * WebM الذي يكتبه كروم بلا عنصر Duration (يُكتب بثاً: Segment وCluster بحجمٍ مجهول) — فـ`<audio>` يقول
 * Infinity ولا يقدّم (مقيسٌ بكروميوم ١٥٣)؛ وMP4 المجزّأ (كروم وسفاري) مدّتُه بالرأس صفر وتُجمع من
 * أجزائه. فالمدّةُ تُقرأ من البايتات نفسِها بعد الإيقاف، وتُخزَّن (`duration_ms`)، ويُرقَّع WebM بعنصر
 * Duration فيعرف المشغّلُ طولَه. والترقيعُ حتميّ: البايتاتُ نفسُها تعطي الناتجَ نفسَه حرفاً، فالبصمةُ
 * (`sha256`) المحسوبةُ عند الإيقاف تُعاد حسابُها من القطع المحفوظة بالجهاز وتطابق.
 *
 * والملفُّ الناقص (تسجيلٌ انقطع فاسترجع الجهازُ أوّلَ قطعه المتّصلة) يُقرأ بما فيه: عنصرٌ أخيرٌ مقطوع
 * يُحسب بما وصل منه.
 * ========================================================================== */
import type { VoiceMime } from "./voiceTypes";

const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u64 = (b: Uint8Array, o: number): number => u32(b, o) * 2 ** 32 + u32(b, o + 4);
const ascii = (b: Uint8Array, o: number, n: number): string => {
  let s = "";
  for (let i = 0; i < n && o + i < b.length; i++) s += String.fromCharCode(b[o + i]);
  return s;
};

/* ── MP4 (ISO-BMFF) ─────────────────────────────────────────────────────── */

interface Box { type: string; start: number; end: number; data: number }

function boxes(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let o = from;
  while (o + 8 <= to) {
    let size = u32(b, o);
    const type = ascii(b, o + 4, 4);
    let hdr = 8;
    if (size === 1) {
      if (o + 16 > to) break;
      size = u64(b, o + 8);
      hdr = 16;
    } else if (size === 0) size = to - o;
    if (size < hdr) break;
    const end = Math.min(o + size, to); // صندوقٌ أخيرٌ مقطوع: يُقرأ بما وصل
    out.push({ type, start: o, end, data: o + hdr });
    if (o + size > to) break;
    o += size;
  }
  return out;
}
const child = (b: Uint8Array, box: Box, type: string, skip = 0): Box | undefined =>
  boxes(b, box.data + skip, box.end).find((x) => x.type === type);
const children = (b: Uint8Array, box: Box, type: string, skip = 0): Box[] =>
  boxes(b, box.data + skip, box.end).filter((x) => x.type === type);

interface TrackInfo { id: number; timescale: number; duration: number; audio: boolean; trexDur: number }

function mp4DurationMs(b: Uint8Array): number | null {
  const top = boxes(b, 0, b.length);
  const moov = top.find((x) => x.type === "moov");
  if (!moov) return null;
  const tracks: TrackInfo[] = [];
  for (const trak of children(b, moov, "trak")) {
    const tkhd = child(b, trak, "tkhd");
    const mdia = child(b, trak, "mdia");
    const mdhd = mdia && child(b, mdia, "mdhd");
    const hdlr = mdia && child(b, mdia, "hdlr");
    if (!tkhd || !mdhd) continue;
    const tv = b[tkhd.data];
    const id = u32(b, tkhd.data + (tv === 1 ? 4 + 16 : 4 + 8));
    const mv = b[mdhd.data];
    const timescale = u32(b, mdhd.data + (mv === 1 ? 4 + 16 : 4 + 8));
    const duration = mv === 1 ? u64(b, mdhd.data + 4 + 20) : u32(b, mdhd.data + 4 + 12);
    const audio = !!hdlr && ascii(b, hdlr.data + 8, 4) === "soun";
    tracks.push({ id, timescale, duration, audio, trexDur: 0 });
  }
  const mvex = child(b, moov, "mvex");
  if (mvex) {
    for (const trex of children(b, mvex, "trex")) {
      const id = u32(b, trex.data + 4);
      const t = tracks.find((x) => x.id === id);
      if (t) t.trexDur = u32(b, trex.data + 12);
    }
  }
  const track = tracks.find((t) => t.audio) ?? tracks[0];
  if (!track || !track.timescale) return null;

  const moofs = top.filter((x) => x.type === "moof");
  if (!moofs.length) return track.duration > 0 ? (track.duration / track.timescale) * 1000 : null;

  let start = Infinity;
  let end = 0;
  let running = 0;
  let any = false;
  for (const moof of moofs) {
    for (const traf of children(b, moof, "traf")) {
      const tfhd = child(b, traf, "tfhd");
      if (!tfhd) continue;
      const tf = (b[tfhd.data + 1] << 16) | (b[tfhd.data + 2] << 8) | b[tfhd.data + 3];
      const tid = u32(b, tfhd.data + 4);
      if (tid !== track.id) continue;
      let p = tfhd.data + 8;
      if (tf & 0x01) p += 8;
      if (tf & 0x02) p += 4;
      const defDur = tf & 0x08 ? u32(b, p) : track.trexDur;
      const tfdt = child(b, traf, "tfdt");
      const base = tfdt ? (b[tfdt.data] === 1 ? u64(b, tfdt.data + 4) : u32(b, tfdt.data + 4)) : running;
      let sum = 0;
      for (const trun of children(b, traf, "trun")) {
        const rf = (b[trun.data + 1] << 16) | (b[trun.data + 2] << 8) | b[trun.data + 3];
        const n = u32(b, trun.data + 4);
        let q = trun.data + 8;
        if (rf & 0x01) q += 4;
        if (rf & 0x04) q += 4;
        const per = ((rf & 0x100) ? 4 : 0) + ((rf & 0x200) ? 4 : 0) + ((rf & 0x400) ? 4 : 0) + ((rf & 0x800) ? 4 : 0);
        for (let i = 0; i < n; i++) {
          if (rf & 0x100) {
            if (q + 4 > trun.end) break; // trun مقطوع: ما وصل وحده
            sum += u32(b, q);
          } else sum += defDur;
          q += per;
        }
      }
      any = true;
      start = Math.min(start, base);
      end = Math.max(end, base + sum);
      running = base + sum;
    }
  }
  if (!any) return track.duration > 0 ? (track.duration / track.timescale) * 1000 : null;
  return ((end - start) / track.timescale) * 1000;
}

/* ── WebM (Matroska/EBML) ───────────────────────────────────────────────── */

const ID_SEGMENT = 0x18538067, ID_INFO = 0x1549a966, ID_SCALE = 0x2ad7b1, ID_DURATION = 0x4489;
const ID_CLUSTER = 0x1f43b675, ID_TIMECODE = 0xe7, ID_SIMPLEBLOCK = 0xa3, ID_BLOCKGROUP = 0xa0, ID_BLOCK = 0xa1;
const ID_SEEKHEAD = 0x114d9b74, ID_SEEK = 0x4dbb, ID_SEEKPOS = 0x53ac, ID_CUES = 0x1c53bb6b;
const LEVEL1 = new Set([ID_SEEKHEAD, ID_INFO, 0x1654ae6b, ID_CLUSTER, ID_CUES, 0x1254c367, 0x1043a770, 0x1941a469]);

interface Vint { value: number; len: number; unknown: boolean }
function readId(b: Uint8Array, o: number): Vint | null {
  const f = b[o];
  if (f === undefined || f === 0) return null;
  const len = f >= 0x80 ? 1 : f >= 0x40 ? 2 : f >= 0x20 ? 3 : f >= 0x10 ? 4 : 0;
  if (!len || o + len > b.length) return null;
  let v = 0;
  for (let i = 0; i < len; i++) v = v * 256 + b[o + i];
  return { value: v, len, unknown: false };
}
function readSize(b: Uint8Array, o: number): Vint | null {
  const f = b[o];
  if (f === undefined || f === 0) return null;
  let len = 1;
  while (len <= 8 && !(f & (0x80 >> (len - 1)))) len++;
  if (len > 8 || o + len > b.length) return null;
  let v = f & (0xff >> len);
  let allOnes = v === 0xff >> len;
  for (let i = 1; i < len; i++) { v = v * 256 + b[o + i]; if (b[o + i] !== 0xff) allOnes = false; }
  return { value: v, len, unknown: allOnes };
}
const readUint = (b: Uint8Array, o: number, n: number): number => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + b[o + i]; return v; };
const readFloat = (b: Uint8Array, o: number, n: number): number => {
  const dv = new DataView(b.buffer, b.byteOffset + o, n);
  return n === 4 ? dv.getFloat32(0) : n === 8 ? dv.getFloat64(0) : NaN;
};

interface El { id: number; start: number; sizeAt: number; sizeLen: number; data: number; end: number; unknown: boolean }

/** عنصرٌ من موضعه — حجمٌ مجهول أو أكبرُ مما وصل يُقصّ على `limit`. */
function el(b: Uint8Array, o: number, limit: number): El | null {
  const id = readId(b, o);
  if (!id) return null;
  const sz = readSize(b, o + id.len);
  if (!sz) return null;
  const data = o + id.len + sz.len;
  if (data > limit) return null;
  const end = sz.unknown ? limit : Math.min(data + sz.value, limit);
  return { id: id.value, start: o, sizeAt: o + id.len, sizeLen: sz.len, data, end, unknown: sz.unknown };
}

interface WebmMap {
  segment: El | null;
  info: El | null;
  scale: number;
  duration: { at: number; len: number; value: number } | null;
  seekPositions: { at: number; len: number; value: number }[];
  hasCues: boolean;
  blockTimes: number[];
}

function mapWebm(b: Uint8Array): WebmMap {
  const m: WebmMap = { segment: null, info: null, scale: 1_000_000, duration: null, seekPositions: [], hasCues: false, blockTimes: [] };
  let o = 0;
  while (o < b.length) {
    const e = el(b, o, b.length);
    if (!e) break;
    if (e.id === ID_SEGMENT) { m.segment = e; break; }
    o = e.end; // رأسُ EBML وما قبل المقطع
  }
  if (!m.segment) return m;
  const segEnd = m.segment.end;
  o = m.segment.data;
  let clusterTime = 0;
  while (o < segEnd) {
    const e = el(b, o, segEnd);
    if (!e) break;
    if (e.id === ID_INFO) {
      m.info = e;
      for (let p = e.data; p < e.end;) {
        const c = el(b, p, e.end);
        if (!c) break;
        if (c.id === ID_SCALE) m.scale = readUint(b, c.data, c.end - c.data) || 1_000_000;
        if (c.id === ID_DURATION) m.duration = { at: c.data, len: c.end - c.data, value: readFloat(b, c.data, c.end - c.data) };
        p = c.end;
      }
      o = e.end;
    } else if (e.id === ID_SEEKHEAD) {
      for (let p = e.data; p < e.end;) {
        const s = el(b, p, e.end);
        if (!s) break;
        if (s.id === ID_SEEK) {
          for (let q = s.data; q < s.end;) {
            const c = el(b, q, s.end);
            if (!c) break;
            if (c.id === ID_SEEKPOS) m.seekPositions.push({ at: c.data, len: c.end - c.data, value: readUint(b, c.data, c.end - c.data) });
            q = c.end;
          }
        }
        p = s.end;
      }
      o = e.end;
    } else if (e.id === ID_CLUSTER) {
      // عنقودٌ بحجمٍ مجهول: أطفالُه حتى أوّل عنصرٍ من المستوى الأوّل
      let p = e.data;
      const stop = e.unknown ? segEnd : e.end;
      while (p < stop) {
        const idv = readId(b, p);
        if (!idv) { p = stop; break; }
        if (LEVEL1.has(idv.value)) break;
        const c = el(b, p, stop);
        if (!c) { p = stop; break; }
        if (c.id === ID_TIMECODE) clusterTime = readUint(b, c.data, c.end - c.data);
        else if (c.id === ID_SIMPLEBLOCK || c.id === ID_BLOCKGROUP) {
          let blk = c;
          if (c.id === ID_BLOCKGROUP) {
            let inner: El | null = null;
            for (let q = c.data; q < c.end;) { const x = el(b, q, c.end); if (!x) break; if (x.id === ID_BLOCK) { inner = x; break; } q = x.end; }
            if (!inner) { p = c.end; continue; }
            blk = inner;
          }
          const tn = readSize(b, blk.data);
          if (tn && blk.data + tn.len + 2 <= blk.end) {
            let rel = (b[blk.data + tn.len] << 8) | b[blk.data + tn.len + 1];
            if (rel & 0x8000) rel -= 0x10000;
            m.blockTimes.push(clusterTime + rel);
          }
        }
        p = c.end;
      }
      o = p;
    } else {
      if (e.id === ID_CUES) m.hasCues = true;
      o = e.end;
    }
  }
  return m;
}

function webmDurationMs(b: Uint8Array): number | null {
  const m = mapWebm(b);
  if (!m.segment) return null;
  if (m.duration && Number.isFinite(m.duration.value) && m.duration.value > 0) return (m.duration.value * m.scale) / 1e6;
  const t = m.blockTimes;
  if (!t.length) return null;
  const first = Math.min(...t);
  const last = Math.max(...t);
  // مدّةُ الإطار الأخير = الفرقُ الأكثرُ تكراراً بين المتتاليات (كروم: ٢٠ أو ٦٠ م.ث)
  const deltas = new Map<number, number>();
  for (let i = 1; i < t.length; i++) { const d = t[i] - t[i - 1]; if (d > 0) deltas.set(d, (deltas.get(d) ?? 0) + 1); }
  let frame = Math.round(20_000_000 / m.scale);
  let best = 0;
  for (const [d, n] of deltas) if (n > best || (n === best && d < frame)) { best = n; frame = d; }
  return ((last - first + frame) * m.scale) / 1e6;
}

const encodeSize = (value: number, len: number): Uint8Array | null => {
  if (len < 1 || len > 8 || value < 0 || value >= 2 ** (7 * len) - 1) return null;
  const out = new Uint8Array(len);
  let v = value;
  for (let i = len - 1; i >= 0; i--) { out[i] = v % 256; v = Math.floor(v / 256); }
  out[0] |= 0x80 >> (len - 1);
  return out;
};
const minSizeLen = (value: number): number => { let n = 1; while (n < 8 && value >= 2 ** (7 * n) - 1) n++; return n; };

/**
 * ضع عنصرَ Duration بمعلومات المقطع (أو بدّل قيمتَه) فيعرف المشغّلُ طولَ WebM. حتميّ؛ ولا يمسّ شيئاً
 * إن لم يأمن (فهرسٌ Cues يحتاج كلُّ مواضعه إعادةَ حساب، أو حجمٌ لا يتّسع) — `patched: false` والبايتاتُ كما هي.
 */
export function patchWebmDuration(bytes: Uint8Array, ms: number): { bytes: Uint8Array; patched: boolean } {
  const m = mapWebm(bytes);
  if (!m.segment || !m.info || !(ms > 0)) return { bytes, patched: false };
  const units = (ms * 1e6) / m.scale;
  if (m.duration && (m.duration.len === 8 || m.duration.len === 4)) {
    const out = bytes.slice();
    const dv = new DataView(out.buffer, out.byteOffset + m.duration.at, m.duration.len);
    if (m.duration.len === 8) dv.setFloat64(0, units); else dv.setFloat32(0, units);
    return { bytes: out, patched: true };
  }
  if (m.hasCues) return { bytes, patched: false };
  const info = m.info;
  const durEl = new Uint8Array(11);
  durEl[0] = 0x44; durEl[1] = 0x89; durEl[2] = 0x88;
  new DataView(durEl.buffer).setFloat64(3, units);
  const oldDataLen = info.end - info.data;
  const newDataLen = oldDataLen + durEl.length;
  const sizeBytes = encodeSize(newDataLen, info.sizeLen) ?? encodeSize(newDataLen, minSizeLen(newDataLen));
  if (!sizeBytes) return { bytes, patched: false };
  const delta = durEl.length + (sizeBytes.length - info.sizeLen);
  const out = new Uint8Array(bytes.length + delta);
  out.set(bytes.subarray(0, info.sizeAt), 0);
  out.set(sizeBytes, info.sizeAt);
  out.set(bytes.subarray(info.data, info.end), info.sizeAt + sizeBytes.length);
  out.set(durEl, info.sizeAt + sizeBytes.length + oldDataLen);
  out.set(bytes.subarray(info.end), info.end + delta);
  const shift = (at: number) => (at >= info.end ? at + delta : at);
  // حجمُ المقطع المعروف يكبر بالفرق؛ المجهولُ (كروم) يبقى
  if (!m.segment.unknown) {
    const seg = m.segment;
    const segSize = encodeSize(seg.end - seg.data + delta, seg.sizeLen);
    if (!segSize) return { bytes, patched: false };
    out.set(segSize, shift(seg.sizeAt));
  }
  // مواضعُ فهرس البحث نسبةً لبداية بيانات المقطع: ما بعد المعلومات يتزحزح
  const infoRel = info.start - m.segment.data;
  for (const sp of m.seekPositions) {
    if (sp.value <= infoRel) continue;
    const v = sp.value + delta;
    if (sp.len < 1 || v >= 2 ** (8 * sp.len)) return { bytes, patched: false };
    let x = v;
    const at = shift(sp.at);
    for (let i = sp.len - 1; i >= 0; i--) { out[at + i] = x % 256; x = Math.floor(x / 256); }
  }
  return { bytes: out, patched: true };
}

/* ── Ogg/Opus ───────────────────────────────────────────────────────────── */

function oggDurationMs(b: Uint8Array): number | null {
  let o = 0;
  let preSkip = 0;
  let granule = -1;
  let first = true;
  while (o + 27 <= b.length && ascii(b, o, 4) === "OggS") {
    const nseg = b[o + 26];
    if (o + 27 + nseg > b.length) break;
    let len = 0;
    for (let i = 0; i < nseg; i++) len += b[o + 27 + i];
    const data = o + 27 + nseg;
    if (data + len > b.length) break; // صفحةٌ مقطوعة: لا تُحسب
    if (first && ascii(b, data, 8) === "OpusHead") preSkip = b[data + 10] | (b[data + 11] << 8);
    first = false;
    // الحُبيبةُ ٦٤ بت (LE): −1 = صفحةٌ لا تنتهي فيها حزمة
    const lo = (b[o + 6] | (b[o + 7] << 8) | (b[o + 8] << 16)) + b[o + 9] * 2 ** 24;
    const hi = (b[o + 10] | (b[o + 11] << 8) | (b[o + 12] << 16)) + b[o + 13] * 2 ** 24;
    if (!(lo === 0xffffffff && hi === 0xffffffff)) granule = Math.max(granule, hi * 2 ** 32 + lo);
    o = data + len;
  }
  if (granule < 0) return null;
  return (Math.max(0, granule - preSkip) / 48_000) * 1000;
}

/** مدّةُ الوسيط بالملّي ثانية من بايتاته، أو null إن لم تُقرأ (يُرجع المسجِّلُ حينها لساعته). */
export function parseDurationMs(bytes: Uint8Array, base: VoiceMime): number | null {
  try {
    const ms = base === "audio/mp4" ? mp4DurationMs(bytes) : base === "audio/webm" ? webmDurationMs(bytes) : oggDurationMs(bytes);
    return ms !== null && Number.isFinite(ms) && ms >= 0 ? Math.round(ms) : null;
  } catch { return null; }
}

/** بصمةُ الملفّ بحروفٍ صغيرة (crypto.subtle) — تطابق قيدَ الخادم `^[0-9a-f]{64}$`. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const view = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", view as BufferSource));
  return Array.from(d, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** القطعُ بايتاتٌ متّصلة. */
export function concatBytes(parts: readonly (ArrayBuffer | Uint8Array)[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.byteLength;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p instanceof Uint8Array ? p : new Uint8Array(p), o); o += p.byteLength; }
  return out;
}

/** بايتاتُ الملفّ النهائيّ من القطع: WebM يُرقَّع بمدّته (حتميّ — الإعادةُ من الجهاز تعطي البصمةَ نفسَها). */
export function finalBytes(parts: readonly (ArrayBuffer | Uint8Array)[], base: VoiceMime, clockMs: number): { bytes: Uint8Array; durationMs: number } {
  const raw = concatBytes(parts);
  const parsed = parseDurationMs(raw, base);
  const durationMs = parsed ?? Math.max(0, Math.round(clockMs));
  if (base !== "audio/webm") return { bytes: raw, durationMs };
  return { bytes: patchWebmDuration(raw, durationMs).bytes, durationMs };
}
