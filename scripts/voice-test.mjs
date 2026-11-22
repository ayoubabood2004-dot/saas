/* ============================================================================
 * voice-test — الملاحظةُ الصوتية (0287): ما يُقرَّر بالجهاز، بسلوكه.
 *
 * يفحص: (أ) اختيارَ الصيغة لكلّ متصفّح وما يُخزَّن منها، (ب) مدّةَ الوسيط من الحاوية — WebM وMP4 حقيقيّان
 * سجّلهما كروميوم بمايكٍ مزيّف (`scripts/fixtures/voice/`، `audio.duration` قال Infinity عن WebM) وMP4 مجزّأٌ
 * مصنوعٌ بتخطيطات سفاري وكروم وOgg/Opus — وترقيعَ WebM بمدّته حتميّاً، والملفَّ الناقص، (ج) رفَّ الجهاز:
 * مرآةُ القطع وفشلُها وامتلاؤها، والجزءُ المتّصل، وحياةُ التسجيل، والانتظار، والعلمُ المتزامن.
 *
 *   node scripts/voice-test.mjs
 * ========================================================================== */
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

let passes = 0;
let fails = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const near = (a, b, tol) => typeof a === "number" && Math.abs(a - b) <= tol;

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
const events = [];
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = { dispatchEvent: (e) => { events.push(e.type); return true; }, addEventListener() {}, removeEventListener() {} };

const built = await esbuild.build({
  stdin: {
    contents: [
      'export * as F from "./src/lib/voice/voiceFormat.ts";',
      'export * as M from "./src/lib/voice/voiceMedia.ts";',
      'export * as S from "./src/lib/voice/voiceShelf.ts";',
    ].join("\n"),
    resolveDir: process.cwd(), sourcefile: "voice-test-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
});
const dir = mkdtempSync(path.join(tmpdir(), "voice-test-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, built.outputFiles[0].text);
const { F, M, S } = await import(pathToFileURL(file).href);
rmSync(dir, { recursive: true, force: true });

const fx = (n) => new Uint8Array(readFileSync(path.join("scripts/fixtures/voice", n)));
const sha = (b) => createHash("sha256").update(b).digest("hex");

/* ── (أ) الصيغة ─────────────────────────────────────────────────────────── */
console.log("— الصيغة");
const support = (list) => (t) => list.includes(t);
const safari = F.pickFormat(support(["audio/mp4;codecs=mp4a.40.2", "audio/mp4"]));
check("سفاري ⇒ AAC داخل MP4 بـ٦٤ ك.ب/ث", safari?.mimeType === "audio/mp4;codecs=mp4a.40.2" && safari.bitsPerSecond === 64000);
const winChrome = F.pickFormat(support(["audio/mp4;codecs=mp4a.40.2", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"]));
check("كروم ويندوز ⇒ AAC (يُسمع بالآيفون)", winChrome?.mimeType === "audio/mp4;codecs=mp4a.40.2");
// مقيسٌ بكروميوم ١٥٣ لينكس: mp4a.40.2 لا، webm/opus نعم، mp4 العامّ نعم (Opus داخله)
const linuxChrome = F.pickFormat(support(["audio/webm;codecs=opus", "audio/mp4", "audio/mp4;codecs=opus", "audio/webm"]));
check("كروم لينكس ⇒ WebM/Opus بـ٣٢ ك.ب/ث (قبل MP4 العامّ)", linuxChrome?.mimeType === "audio/webm;codecs=opus" && linuxChrome.bitsPerSecond === 32000);
const firefox = F.pickFormat(support(["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/ogg"]));
check("فايرفوكس ⇒ WebM/Opus", firefox?.mimeType === "audio/webm;codecs=opus");
check("لا صيغة ⇒ null (لا تسجيل)", F.pickFormat(() => false) === null);
check("متصفّحٌ يرمي بدل false ⇒ يُكمل للتالية", F.pickFormat((t) => { if (t.includes("mp4a")) throw new Error("x"); return t === "audio/webm;codecs=opus"; })?.mimeType === "audio/webm;codecs=opus");
check("الأساس: audio/mp4; codecs=\"mp4a.40.2\" ⇒ audio/mp4", F.baseMime('audio/mp4; codecs="mp4a.40.2"') === "audio/mp4");
check("الأساس: audio/x-m4a ⇒ audio/mp4", F.baseMime("audio/x-m4a") === "audio/mp4");
check("الأساس: audio/webm;codecs=opus ⇒ audio/webm", F.baseMime("audio/webm;codecs=opus") === "audio/webm");
check("الأساس: video/webm ⇒ null", F.baseMime("video/webm") === null);
check("الأساس: فارغ ⇒ null", F.baseMime("") === null && F.baseMime(undefined) === null);
check("الترميز: mp4a.40.2 بلا اقتباس", F.codecsOf('audio/mp4; codecs="mp4a.40.2"') === "mp4a.40.2");
check("الترميز: OPUS ⇒ opus", F.codecsOf("audio/webm;codecs=OPUS") === "opus");
check("الترميز: غائب أو مشوَّه ⇒ null", F.codecsOf("audio/webm") === null && F.codecsOf("audio/webm;codecs=bad codec!") === null);
check("الامتداد يطابق قيدَ المسار", F.extOf("audio/mp4") === "m4a" && F.extOf("audio/webm") === "webm" && F.extOf("audio/ogg") === "ogg");
check("المدّة 0:42 و2:05 و0:00", F.fmtDuration(42000) === "0:42" && F.fmtDuration(125000) === "2:05" && F.fmtDuration(NaN) === "0:00" && F.fmtDuration(-5) === "0:00");
const cpt = (map) => (t) => map[t] ?? "";
check("يُشغَّل: opus بلا دعم ⇒ لا", !F.canPlayHere("audio/webm", "opus", cpt({ "audio/webm": "maybe" })));
check("يُشغَّل: mp4a بدعم ⇒ نعم", F.canPlayHere("audio/mp4", "mp4a.40.2", cpt({ 'audio/mp4; codecs="mp4a.40.2"': "probably" })));
check("يُشغَّل: بلا ترميز يُسأل الأساس", F.canPlayHere("audio/ogg", null, cpt({ "audio/ogg": "maybe" })));
check("اسمُ الملفّ المنزَّل", F.clipFileName("بوبي/ميشو", "2026-11-22T10:00:00Z", 42000, "m4a") === "بوبي-ميشو-2026-11-22-0-42.m4a");

/* ── (ب) المدّة من الحاوية ──────────────────────────────────────────────── */
console.log("— المدّة من الحاوية");
const w24 = fx("chrome-opus-2400ms.webm");
const w12 = fx("chrome-opus-1200ms.webm");
const m24 = fx("chrome-opus-2400ms.mp4");
const dw24 = M.parseDurationMs(w24, "audio/webm");
check("WebM كروم ٢٫٤ ث (Duration غائب) ⇒ ≈ ٢٤٠٠ م.ث", near(dw24, 2400, 150), String(dw24));
const dw12 = M.parseDurationMs(w12, "audio/webm");
check("WebM كروم ١٫٢ ث ⇒ ≈ ١٢٠٠ م.ث", near(dw12, 1200, 150), String(dw12));
const dm24 = M.parseDurationMs(m24, "audio/mp4");
check("MP4 كروم المجزّأ ⇒ ≈ ما قاله المتصفّح (٢٣٦١)", near(dm24, 2361, 50), String(dm24));

const p1 = M.patchWebmDuration(w24, dw24);
const p2 = M.patchWebmDuration(w24, dw24);
check("الترقيعُ تمّ", p1.patched === true && p1.bytes.length === w24.length + 11);
check("الترقيعُ حتميّ (البصمةُ نفسُها مرّتين)", sha(p1.bytes) === sha(p2.bytes));
check("المرقَّعُ يُقرأ بمدّته من Duration نفسِه", near(M.parseDurationMs(p1.bytes, "audio/webm"), dw24, 1));
const p3 = M.patchWebmDuration(p1.bytes, 1234);
check("ترقيعُ ما فيه Duration يبدّل القيمةَ بمكانها (الطولُ نفسُه)", p3.patched && p3.bytes.length === p1.bytes.length && near(M.parseDurationMs(p3.bytes, "audio/webm"), 1234, 1));
check("الأصلُ لم يُمسّ", sha(w24) === sha(fx("chrome-opus-2400ms.webm")));
const fb = M.finalBytes([w24.slice(0, 3000), w24.slice(3000)], "audio/webm", 9999);
check("finalBytes: القطعُ تُجمع وتُرقَّع ومدّتُها من الحاوية لا الساعة", near(fb.durationMs, dw24, 1) && fb.bytes.length === w24.length + 11);
const fbm = M.finalBytes([m24], "audio/mp4", 9999);
check("finalBytes: MP4 كما هو", fbm.bytes.length === m24.length && near(fbm.durationMs, dm24, 1));

const cut = w24.slice(0, Math.floor(w24.length * 0.6));
const dcut = M.parseDurationMs(cut, "audio/webm");
check("WebM مقطوع (٦٠٪) ⇒ مدّةٌ موجبة أقلّ من الكامل", typeof dcut === "number" && dcut > 0 && dcut < dw24, String(dcut));
check("ترقيعُ المقطوع يمرّ ويُقرأ", near(M.parseDurationMs(M.patchWebmDuration(cut, dcut).bytes, "audio/webm"), dcut, 1));
const mcut = m24.slice(0, Math.floor(m24.length * 0.7));
const dmcut = M.parseDurationMs(mcut, "audio/mp4");
check("MP4 مقطوع ⇒ لا رمي، ومدّةٌ ≤ الكامل", dmcut === null || (dmcut >= 0 && dmcut <= dm24 + 1), String(dmcut));
check("بايتاتٌ عشوائية ⇒ null لكلّ أساس", ["audio/webm", "audio/mp4", "audio/ogg"].every((b) => M.parseDurationMs(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), b) === null));

// MP4 مجزّأ مصنوع: mvhd/mdhd بمدّة صفر والمدّةُ من الأجزاء — بثلاثة أشكال للمدد
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type, ...parts) => { const body = parts.flat(); return [...be32(8 + body.length), ...[...type].map((c) => c.charCodeAt(0)), ...body]; };
const full = (type, version, flags, ...parts) => box(type, [version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts);
const zeros = (n) => new Array(n).fill(0);
function mp4({ timescale, trexDur, frags }) {
  const out = [
    ...box("ftyp", [..."isom"].map((c) => c.charCodeAt(0)), be32(0)),
    ...box("moov",
      full("mvhd", 0, 0, zeros(8), be32(1000), be32(0), zeros(80)),
      box("trak",
        full("tkhd", 0, 3, zeros(8), be32(1), zeros(64)),
        box("mdia",
          full("mdhd", 0, 0, zeros(8), be32(timescale), be32(0), zeros(4)),
          full("hdlr", 0, 0, be32(0), [..."soun"].map((c) => c.charCodeAt(0)), zeros(13)))),
      box("mvex", full("trex", 0, 0, be32(1), be32(1), be32(trexDur), be32(0), be32(0)))),
  ];
  for (const f of frags) {
    const tfhdFlags = f.tfhdDur ? 0x08 : 0;
    const trunFlags = f.durs ? 0x100 : 0;
    const samples = f.durs ? f.durs.flatMap((d) => be32(d)) : [];
    out.push(...box("moof",
      box("traf",
        full("tfhd", 0, tfhdFlags, be32(1), f.tfhdDur ? be32(f.tfhdDur) : []),
        f.base !== undefined ? full("tfdt", 0, 0, be32(f.base)) : [],
        full("trun", 0, trunFlags, be32(f.n), samples))));
    out.push(...box("mdat", zeros(4)));
  }
  return new Uint8Array(out);
}
const safariLike = mp4({ timescale: 44100, trexDur: 1024, frags: [{ n: 43, base: 0 }, { n: 43, base: 43 * 1024 }] });
check("MP4 بتخطيط سفاري (مدّةُ trex الافتراضية) ⇒ ٨٦×١٠٢٤/٤٤١٠٠", near(M.parseDurationMs(safariLike, "audio/mp4"), (86 * 1024 / 44100) * 1000, 1));
const tfhdLike = mp4({ timescale: 48000, trexDur: 0, frags: [{ n: 50, tfhdDur: 960, base: 0 }, { n: 25, tfhdDur: 960, base: 48000 }] });
check("MP4 بمدّة tfhd ⇒ ١٫٥ ث", near(M.parseDurationMs(tfhdLike, "audio/mp4"), 1500, 1));
const perSample = mp4({ timescale: 1000, trexDur: 0, frags: [{ n: 3, durs: [100, 200, 300] }, { n: 2, durs: [50, 50] }] });
check("MP4 بمدّة لكلّ عيّنة بلا tfdt ⇒ مجموعُها (٧٠٠)", near(M.parseDurationMs(perSample, "audio/mp4"), 700, 1));
const shifted = mp4({ timescale: 1000, trexDur: 0, frags: [{ n: 2, durs: [500, 500], base: 3000 }] });
check("MP4 يبدأ من ٣ ث ⇒ المدّةُ ١ ث لا ٤", near(M.parseDurationMs(shifted, "audio/mp4"), 1000, 1));

// Ogg/Opus مصنوع: OpusHead بـpre-skip ٣١٢ وآخرُ حُبيبة ٢ ث + ٣١٢
function oggPage(granule, payload, headerType = 0) {
  const g = []; let v = BigInt(granule);
  for (let i = 0; i < 8; i++) { g.push(Number(v & 0xffn)); v >>= 8n; }
  const segs = []; let left = payload.length;
  while (left >= 255) { segs.push(255); left -= 255; }
  segs.push(left);
  return [..."OggS"].map((c) => c.charCodeAt(0)).concat([0, headerType], g, zeros(12), [segs.length], segs, payload);
}
const opusHead = [..."OpusHead"].map((c) => c.charCodeAt(0)).concat([1, 1, 312 & 255, 312 >> 8, 0x80, 0xbb, 0, 0, 0, 0, 0]);
const ogg = new Uint8Array([...oggPage(0, opusHead, 2), ...oggPage(0, [..."OpusTags"].map((c) => c.charCodeAt(0)).concat(zeros(8))), ...oggPage(48000, zeros(40)), ...oggPage(96000 + 312, zeros(40), 4)]);
check("Ogg/Opus ⇒ (الحُبيبةُ − pre-skip) ÷ ٤٨٠٠٠ = ٢ ث", near(M.parseDurationMs(ogg, "audio/ogg"), 2000, 1));
check("Ogg مقطوعٌ بنصّ صفحةٍ أخيرة ⇒ آخرُ صفحةٍ كاملة", near(M.parseDurationMs(ogg.slice(0, ogg.length - 10), "audio/ogg"), 1000 - 312 / 48, 1));
check("البصمة: sha256 بحروفٍ صغيرة وتطابق node", (await M.sha256Hex(w12)) === sha(w12));

/* ── (ج) رفُّ الجهاز ────────────────────────────────────────────────────── */
console.log("— رفُّ الجهاز");
const buf = (n, v = 1) => new Uint8Array(n).fill(v).buffer;
{
  const db = S.memShelf();
  const m = new S.ChunkMirror(db, "c1", () => 5);
  await m.append(buf(10)); await m.append(buf(20)); await m.append(buf(30));
  check("المرآةُ السليمة: ثلاثُ قطعٍ والتحقّقُ يمرّ", (await m.verify()) === true && (await db.getChunks("c1")).length === 3 && !m.memoryOnly);
}
{
  const db = S.memShelf();
  let fail = 1, reopened = 0;
  const flaky = { ...db, async putChunk(r) { if (r.seq === 2 && fail-- > 0) throw Object.assign(new Error("x"), { name: "UnknownError" }); return db.putChunk(r); }, async reopen() { reopened++; } };
  const m = new S.ChunkMirror(flaky, "c2");
  for (const n of [5, 6, 7, 8]) await m.append(buf(n));
  check("فشلٌ عابر ⇒ إعادةُ فتحٍ مرّة والقطعةُ تُكتب", reopened === 1 && !m.memoryOnly && (await m.verify()) === true);
}
{
  const db = S.memShelf();
  let reopened = 0;
  const broken = { ...db, async putChunk(r) { if (r.seq >= 2) throw Object.assign(new Error("x"), { name: "UnknownError" }); return db.putChunk(r); }, async reopen() { reopened++; } };
  const m = new S.ChunkMirror(broken, "c3");
  for (const n of [5, 6, 7, 8]) await m.append(buf(n));
  check("فشلٌ ثانٍ ⇒ الذاكرةُ وحدها، والبايتاتُ كلُّها ما زالت للرفع", m.memoryOnly && reopened === 1 && M.concatBytes(m.mem).length === 26);
  check("التحقّقُ يقولها (لا «على هالجهاز»)", (await m.verify()) === false);
}
{
  const db = S.memShelf();
  let reopened = 0;
  const full = { ...db, async putChunk() { throw Object.assign(new Error("x"), { name: "QuotaExceededError" }); }, async reopen() { reopened++; } };
  const m = new S.ChunkMirror(full, "c4");
  await m.append(buf(3)); await m.append(buf(4));
  check("امتلاءُ المساحة ⇒ الذاكرةُ فوراً بلا إعادة فتح", m.memoryOnly && reopened === 0 && m.mem.length === 2);
}
{
  const m = new S.ChunkMirror(null, "c5");
  await m.append(buf(3));
  check("بلا قاعدة (متصفّحٌ خاصّ) ⇒ الذاكرة", m.memoryOnly && m.mem.length === 1);
}
{
  const rec = (seq) => ({ id: "x", seq, at_ms: 0, buf: buf(seq + 1) });
  const r1 = S.contiguousRun([rec(3), rec(0), rec(1)]);
  check("المتّصلُ من ٠: ٠ و١ ثمّ ثغرة (٣ تُترك)", r1.parts.length === 2 && r1.dropped === 1 && !r1.headMissing);
  const r2 = S.contiguousRun([rec(1), rec(2)]);
  check("بلا القطعة ٠ ⇒ بلا رأس (لا يُشغَّل، والبايتاتُ تبقى)", r2.headMissing && r2.parts.length === 0);
  check("بلا قطع ⇒ لا شيء ولا «بلا رأس»", !S.contiguousRun([]).headMissing);
}
{
  const c = { id: "r1", state: "recording", alive_at: 1000 };
  check("قفلُه محجوز ⇒ حيّ", S.isClipLive(c, { heldLocks: new Set([S.REC_LOCK("r1")]), liveIds: new Set(), now: 999999 }));
  check("قفلُه حرّ ⇒ انقطع فوراً (ولو آخرُ قطعةٍ للتوّ)", !S.isClipLive(c, { heldLocks: new Set(), liveIds: new Set(), now: 1001 }));
  check("بمجموعة التبويب ⇒ حيّ", S.isClipLive(c, { heldLocks: new Set(), liveIds: new Set(["r1"]), now: 999999 }));
  check("بلا Web Locks: < ١٠ ث حيّ", S.isClipLive(c, { heldLocks: null, liveIds: new Set(), now: 10500 }));
  check("بلا Web Locks: ≥ ١٠ ث انقطع", !S.isClipLive(c, { heldLocks: null, liveIds: new Set(), now: 11000 }));
  check("غيرُ «يُسجَّل» ليس حياً", !S.isClipLive({ ...c, state: "recorded" }, { heldLocks: new Set([S.REC_LOCK("r1")]), liveIds: new Set(["r1"]), now: 0 }));
}
check("الانتظار ٥ ث ← ٣٠ ← ٢ د ← ١٠ د ← ١٠ د", [1, 2, 3, 4, 9].map(S.backoffMs).join() === "5000,30000,120000,600000,600000");
{
  const clips = [
    { id: "a", who: { user: "u1", clinic: "c" }, state: "uploading" },
    { id: "b", who: { user: "u1", clinic: "c" }, state: "failed" },
    { id: "c", who: { user: "u1", clinic: "c" }, state: "saved" },
    { id: "d", who: { user: "u1", clinic: "c" }, state: "recording" },
    { id: "e", who: { user: "u2", clinic: "c" }, state: "waiting" },
    { id: "f", who: null, state: "recorded" },
  ];
  const flag = S.pendingFlag(clips);
  check("العلم: u1 ثلاثة (منها فاشل وما يُسجَّل الآن)، والمرتفعُ لا يُعدّ", JSON.stringify(flag.u1) === "[3,1]" && JSON.stringify(flag.u2) === "[1,0]" && JSON.stringify(flag["?"]) === "[1,0]");
  const mine = S.pendingCounts(flag, "u1");
  check("تسجيلاتي ٣ (١ فاشل)، ولحساباتٍ أخرى ٢", mine.mine === 3 && mine.mineFailed === 1 && mine.others === 2);
  events.length = 0;
  S.writePendingFlag(flag);
  check("يُكتب ويُعلن، ويُقرأ كما هو", events.includes(S.PENDING_EVENT) && JSON.stringify(S.readPendingFlag()) === JSON.stringify(flag));
  S.writePendingFlag({});
  check("الفارغ يمسح المفتاح", localStorage.getItem(S.PENDING_KEY) === null && JSON.stringify(S.readPendingFlag()) === "{}");
  localStorage.setItem(S.PENDING_KEY, "{bad json");
  check("علمٌ مشوَّه ⇒ فارغ لا رمي", JSON.stringify(S.readPendingFlag()) === "{}");
}
check("المساحة: أقلُّ من ١٥ ميغا ⇒ تحذير، والمجهولُ لا", S.lowSpace({ quota: 100e6, usage: 90e6 }) && !S.lowSpace({ quota: 100e6, usage: 10e6 }) && !S.lowSpace(null));

console.log(fails ? `✗ voice-test: ${passes} نجح، ${fails} فشل` : `✓ voice-test: ${passes} نجح، 0 فشل`);
if (fails) process.exit(1);
