#!/usr/bin/env node
// ============================================================================
// doctorVet — تطبيق ربط جهاز المختبر (ملف واحد، بلا ترمنل).
//
// دبل-كلك يشغّله: يفتح صفحة عربية بالمتصفح، يبحث عن جهاز المختبر بالشبكة
// وحده، يربطه، ويكتب الإعداد بنفسه. الطبيب لا يفتح ترمنل ولا يعدّل JSON
// ولا ينسخ رموزاً — الملف يجيء من السستم مقترناً مسبقاً بعيادته.
//
// لماذا خادم محلي بدل نافذة تطبيق؟ لأن المتصفح موجود على كل حاسوب، فتبقى
// النسخة ملفاً واحداً يعمل على ويندوز وماك بلا تثبيت ولا حزم. الخادم لا
// يستمع إلا على 127.0.0.1 — لا يراه أحد خارج هذا الحاسوب.
//
// التشغيل: node lab-bridge.app.mjs   (أو دبل-كلك على ملف التشغيل المرافق)
// ============================================================================

import http from "node:http";
import net from "node:net";
import os from "node:os";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

/* ============================ الاقتران المسبق ============================
 * يُحقن عند التنزيل من إعدادات السستم: رابط السحابة ومفتاحها ورمز الجهاز.
 * فالطبيب لا يكتب شيئاً من هذا. القيمة الافتراضية `null` تعمداً — حتى لو نُسخ
 * الملف من المستودع بلا حقن يبقى برنامجاً صالحاً، ويقرأ الإعداد المجاور
 * (توافقاً مع النسخ القديمة) بدل أن ينهار. */
const PAIRING = /*@pairing*/ null;

/* fetch الأصلي داخل Node يحتاج ١٨ فما فوق — نقولها بالعربي بدل انهيار غامض. */
const NODE_MAJOR = Number((process.versions.node || "0").split(".")[0]);
if (NODE_MAJOR < 18) {
  console.error(`\n✗ نسخة Node قديمة (${process.versions.node}). حمّل أحدث نسخة من nodejs.org ثم شغّل التطبيق من جديد.\n`);
  process.exit(1);
}

const HERE = dirname(fileURLToPath(import.meta.url));
/** إعداد خاص بكل جهاز، حتى تتعايش عدة أجهزة بنفس المجلد بلا تصادم. */
const deviceKey = () => {
  const t = PAIRING && PAIRING.token ? String(PAIRING.token) : "";
  if (!t) return "config";
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return h.toString(36);
};
const CONFIG_PATH = join(HERE, `lab-bridge.${deviceKey()}.json`);
const LEGACY_CONFIG_PATH = join(HERE, "lab-bridge.config.json");
const UI_PORT_FIRST = 7317;

/* =============================== الترميز (framing) =============================== */
const dec = (arr) => Buffer.from(arr).toString("latin1");

function mllpFramer() {
  let buf = [];
  const START = 0x0b, END1 = 0x1c, END2 = 0x0d;
  return {
    push(chunk) {
      const frames = [];
      for (const b of chunk) buf.push(b);
      for (;;) {
        const s = buf.indexOf(START);
        if (s < 0) { buf = []; break; }
        const e = buf.indexOf(END1, s + 1);
        if (e < 0 || buf[e + 1] !== END2) { if (s > 0) buf = buf.slice(s); break; }
        frames.push(dec(buf.slice(s + 1, e)));
        buf = buf.slice(e + 2);
      }
      return frames;
    },
    flush() { buf = []; return []; },
  };
}

function astmFramer() {
  let buf = [];
  let assembled = [];
  const STX = 0x02, ETX = 0x03, ETB = 0x17, EOT = 0x04, CR = 0x0d, LF = 0x0a;
  const takeFrame = () => {
    const s = buf.indexOf(STX);
    if (s < 0) return false;
    let term = -1;
    for (let i = s + 1; i < buf.length; i++) { if (buf[i] === ETX || buf[i] === ETB) { term = i; break; } }
    if (term < 0) { if (s > 0) buf = buf.slice(s); return false; }
    if (term + 3 >= buf.length) { if (s > 0) buf = buf.slice(s); return false; }
    assembled.push(dec(buf.slice(s + 2, term)));
    let end = term + 3;
    while (end < buf.length && (buf[end] === CR || buf[end] === LF)) end++;
    buf = buf.slice(end);
    return true;
  };
  return {
    push(chunk) {
      const frames = [];
      for (const b of chunk) buf.push(b);
      for (;;) {
        while (takeFrame()) { /* drain */ }
        const eot = buf.indexOf(EOT);
        if (eot >= 0) {
          if (assembled.length) frames.push(assembled.join("\r"));
          assembled = [];
          buf = buf.slice(eot + 1);
          continue;
        }
        break;
      }
      return frames;
    },
    flush() { const out = assembled.length ? [assembled.join("\r")] : []; assembled = []; buf = []; return out; },
  };
}

function idleFramer() {
  let buf = "";
  return {
    push(chunk) { buf += dec(chunk); return []; },
    flush() { const out = buf.trim() ? [buf] : []; buf = ""; return out; },
  };
}

/** لا يُحسم النمط ببايت شارد: أجهزة كثيرة تنبض ببايت واحد كل ثوانٍ. */
function autoFramer() {
  let inner = null;
  let sniff = [];
  const pick = () => {
    const vt = sniff.indexOf(0x0b);
    if (vt >= 0 && sniff.length - vt > 8) return mllpFramer();
    const stx = sniff.indexOf(0x02);
    if (stx >= 0 && sniff.length - stx > 4) return astmFramer();
    if (sniff.length > 512) return idleFramer();
    return null;
  };
  return {
    push(chunk) {
      if (!inner) {
        for (const b of chunk) sniff.push(b);
        inner = pick();
        if (inner) { const seed = sniff; sniff = []; return inner.push(seed); }
        if (sniff.length > 4096) sniff = sniff.slice(-4096);
        return [];
      }
      return inner.push(chunk);
    },
    flush() { if (inner) return inner.flush(); const out = sniff.length ? [dec(sniff)] : []; sniff = []; return out; },
  };
}

const framerFor = (mode) =>
  mode === "hl7" || mode === "mllp" ? mllpFramer()
    : mode === "astm" ? astmFramer()
      : mode === "generic" || mode === "idle" ? idleFramer()
        : autoFramer();

const ENQ = 0x05, ACK = 0x06, ETX = 0x03, ETB = 0x17;
function ackBytesFor(chunk) {
  let n = 0;
  for (const b of chunk) if (b === ENQ || b === ETX || b === ETB) n++;
  return n ? Buffer.alloc(n, ACK) : null;
}

/* =============================== الحالة والسجل =============================== */
const LOG_MAX = 200;
const state = {
  status: "idle",        // idle | connecting | connected | listening | error
  detail: "",
  log: [],
  sent: 0,
  lastAt: null,
  lastChars: 0,
  scanning: false,
  scanProgress: 0,
};

const ts = () => new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
function log(kind, text) {
  state.log.unshift({ at: ts(), kind, text });
  if (state.log.length > LOG_MAX) state.log.length = LOG_MAX;
  console.log(`[${kind}] ${text}`);
}

/* =============================== الإعداد =============================== */
function readConfig() {
  try { return JSON.parse(readFileSync(CONFIG_PATH, "utf8")); } catch { /* نجرّب القديم */ }
  try { return JSON.parse(readFileSync(LEGACY_CONFIG_PATH, "utf8")); } catch { return {}; }
}
function writeConfig(cfg) {
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

/** الاقتران: المحقون أولاً، وإلا ما بالملف المجاور (توافق مع النسخ القديمة). */
function pairing() {
  const file = readConfig();
  const p = PAIRING && PAIRING.token ? PAIRING : file;
  return { url: p.url, anonKey: p.anonKey, token: p.token, device: p.device || "جهاز المختبر", clinic: p.clinic || "" };
}

function connection() {
  const c = readConfig();
  if (!c.mode) return null;
  return {
    mode: c.mode,
    host: c.host || "0.0.0.0",
    port: Number(c.port || 9100),
    name: c.device || pairing().device,
    brand: c.brand || "",
    room: c.room || "",
  };
}

/** حد أعلى للنصوص القادمة من الواجهة — ملف الإعداد يبقى صغيراً ومقروءاً. */
const clip = (s, n) => String(s ?? "").trim().slice(0, n);

function saveConnection({ name, brand, room, mode, host, port }) {
  const p = pairing();
  const n = Number(port);
  writeConfig({
    url: p.url, anonKey: p.anonKey, token: p.token,
    device: clip(name, 60) || p.device,
    brand: clip(brand, 40),
    room: clip(room, 60),
    mode,
    host: mode === "tcp-listen" ? "0.0.0.0" : clip(host, 45),
    port: Number.isFinite(n) && n > 0 && n < 65536 ? n : 9100,
    framing: "auto", idleMs: 1500,
    savedAt: new Date().toISOString(),
  });
}

/** عناوين هذا الحاسوب على الشبكة — يكتبها الطبيب بإعدادات الجهاز بوضع الاستقبال. */
function hostIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) if (ni.family === "IPv4" && !ni.internal) out.push(ni.address);
  }
  return out;
}

/* ========================= التشغيل التلقائي مع الحاسوب =========================
 * العيادة تحتاجه شغّالاً دائماً، والطبيب ما يتذكر يشغّله كل صباح. نستعمل ما
 * يوفّره كل نظام بنفسه — بلا خدمات ولا صلاحيات مدير ولا برامج طرف ثالث:
 *   · ويندوز: ملف بمجلد Startup يشتغل عند تسجيل الدخول، وفيه حلقة تعيد
 *     التشغيل بعد ٥ ثوانٍ لو توقّف المحرك لأي سبب.
 *   · ماك: LaunchAgent بمجلد المستخدم. KeepAlive تعطينا إعادة التشغيل مجاناً.
 * كلاهما داخل مجلد المستخدم — يُلغى بحذف ملف واحد، ولا يمس النظام. */
const ENGINE_PATH = fileURLToPath(import.meta.url);
const AGENT_LABEL = "vet.doctorvet.lab";

function autostartFile() {
  if (process.platform === "win32") {
    return join(os.homedir(), "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "doctorvet-lab.cmd");
  }
  if (process.platform === "darwin") {
    return join(os.homedir(), "Library", "LaunchAgents", `${AGENT_LABEL}.plist`);
  }
  return null; // أنظمة أخرى: الميزة تُخفى بالواجهة
}

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function autostartBody() {
  if (process.platform === "win32") {
    return [
      "@echo off",
      "chcp 65001 >nul",
      "title doctorVet Lab",
      "rem أنشأه تطبيق doctorVet — احذف هذا الملف لإيقاف التشغيل التلقائي.",
      ":loop",
      `node "${ENGINE_PATH}"`,
      "timeout /t 5 /nobreak >nul",
      "goto loop",
      "",
    ].join("\r\n");
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    `  <key>Label</key><string>${AGENT_LABEL}</string>`,
    "  <key>ProgramArguments</key><array>",
    `    <string>${xml(process.execPath)}</string>`,
    `    <string>${xml(ENGINE_PATH)}</string>`,
    "  </array>",
    `  <key>WorkingDirectory</key><string>${xml(HERE)}</string>`,
    "  <key>RunAtLoad</key><true/>",
    "  <key>KeepAlive</key><true/>",
    "</dict></plist>",
    "",
  ].join("\n");
}

function autostartOn() {
  const f = autostartFile();
  if (!f) return false;
  try { return readFileSync(f, "utf8").includes(ENGINE_PATH); } catch { return false; }
}

function setAutostart(enable) {
  const f = autostartFile();
  if (!f) return { ok: false, error: "نظام التشغيل هذا غير مدعوم." };
  try {
    if (enable) {
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, autostartBody(), "utf8");
      // على الماك يجب تحميل الوكيل ليعمل الآن لا بعد إعادة التشغيل فقط.
      if (process.platform === "darwin") launchctl(["load", "-w", f]);
      log("ok", "انفعّل التشغيل التلقائي مع الحاسوب.");
    } else {
      if (process.platform === "darwin") launchctl(["unload", "-w", f]);
      rmSync(f, { force: true });
      log("info", "انلغى التشغيل التلقائي.");
    }
    return { ok: true, enabled: enable };
  } catch (e) {
    log("err", `تعذّر تغيير التشغيل التلقائي: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

/** أفضل جهد — فشل launchctl لا يبطل كتابة الملف (يشتغل بعد إعادة التشغيل). */
function launchctl(args) {
  try { spawnSync("launchctl", args, { stdio: "ignore" }); } catch { /* ignore */ }
}

/* =============================== الإرسال للسحابة =============================== */
async function forward(raw) {
  const p = pairing();
  if (!p.url || !p.anonKey || !p.token) {
    log("err", "الملف غير مقترن بعيادة — حمّله من إعدادات السستم.");
    return;
  }
  const endpoint = p.url.replace(/\/+$/, "") + "/rest/v1/rpc/ingest_device_message";
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: p.anonKey, Authorization: `Bearer ${p.anonKey}` },
      body: JSON.stringify({ p_token: p.token, p_raw: raw }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      if (/invalid device token/i.test(body)) {
        log("err", "الرمز غير صالح أو مُلغى — أضف جهازاً بالسستم وحمّل التطبيق من جديد.");
      } else {
        log("err", `السحابة رفضت (${res.status}): ${body}`);
      }
      return;
    }
    state.sent += 1;
    state.lastAt = new Date().toISOString();
    state.lastChars = raw.length;
    log("ok", `وصلت نتيجة (${raw.length} حرف) إلى صندوق المختبر.`);
  } catch (err) {
    log("err", `تعذّر الاتصال بالإنترنت — نعيد المحاولة بالنتيجة القادمة: ${err.message}`);
  }
}

/* =============================== قارئ الرسائل =============================== */
const MIN_RAW_BYTES = 40;
const startsNewMessage = (s) => /^\s*(MSH\||H\|)/.test(s);

function makeReader(idleMs, writeBack) {
  const framer = framerFor("auto");
  let raw = [];
  let pending = [];
  let idle;
  const flushPending = () => {
    if (!pending.length) return;
    const groups = [];
    for (const part of pending) {
      if (!groups.length || startsNewMessage(part)) groups.push([part]);
      else groups[groups.length - 1].push(part);
    }
    pending = [];
    for (const g of groups) { const msg = g.join("\r"); if (msg.trim()) void forward(msg); }
  };
  const settle = () => {
    for (const f of framer.flush()) { if (f.trim().length >= MIN_RAW_BYTES) pending.push(f); }
    if (!pending.length && raw.length >= MIN_RAW_BYTES) pending.push(dec(raw));
    raw = [];
    flushPending();
  };
  const arm = () => { clearTimeout(idle); idle = setTimeout(settle, idleMs); };
  return {
    feed(chunk) {
      const ack = ackBytesFor(chunk);
      if (ack && writeBack) { try { writeBack(ack); } catch { /* best effort */ } }
      for (const b of chunk) raw.push(b);
      for (const f of framer.push(chunk)) { if (f.trim()) pending.push(f); }
      arm();
    },
    end() { clearTimeout(idle); settle(); },
  };
}

/* =============================== المحرّك =============================== */
let server = null;      // في وضع الاستماع
let socket = null;      // في وضع الاتصال
let retryTimer = null;
let stopped = true;

function stopBridge() {
  stopped = true;
  clearTimeout(retryTimer);
  try { socket?.destroy(); } catch { /* ignore */ }
  try { server?.close(); } catch { /* ignore */ }
  socket = null; server = null;
  state.status = "idle";
  state.detail = "";
}

function startBridge() {
  const conn = connection();
  if (!conn) { state.status = "idle"; state.detail = "لم يُختَر جهاز بعد."; return; }
  stopBridge();
  stopped = false;

  if (conn.mode === "tcp-listen") {
    state.status = "listening";
    state.detail = `ننتظر الجهاز على المنفذ ${conn.port}`;
    server = net.createServer((s) => {
      log("info", `اتصل الجهاز: ${s.remoteAddress}`);
      state.status = "connected";
      state.detail = `الجهاز متصل (${s.remoteAddress})`;
      const reader = makeReader(1500, (b) => s.write(b));
      s.on("data", (d) => reader.feed(d));
      s.on("close", () => { reader.end(); state.status = "listening"; state.detail = `ننتظر الجهاز على المنفذ ${conn.port}`; });
      s.on("error", () => { /* تُغلق تلقائياً */ });
    });
    server.on("error", (e) => { state.status = "error"; state.detail = `تعذّر فتح المنفذ ${conn.port}: ${e.message}`; log("err", state.detail); });
    server.listen(conn.port, "0.0.0.0", () => log("info", `ننتظر الجهاز على المنفذ ${conn.port}.`));
    return;
  }

  const connect = () => {
    if (stopped) return;
    state.status = "connecting";
    state.detail = `نتصل بـ ${conn.host}:${conn.port}…`;
    socket = net.connect(conn.port, conn.host, () => {
      state.status = "connected";
      state.detail = `متصل بـ ${conn.host}:${conn.port}`;
      log("ok", `اتصلنا بالجهاز ${conn.host}:${conn.port}.`);
    });
    const reader = makeReader(1500, (b) => socket?.write(b));
    socket.on("data", (d) => reader.feed(d));
    socket.on("close", () => {
      reader.end();
      if (stopped) return;
      state.status = "connecting";
      state.detail = "انقطع — نعيد المحاولة بعد ٥ ثوانٍ…";
      retryTimer = setTimeout(connect, 5000);
    });
    socket.on("error", (e) => { state.detail = `خطأ: ${e.message}`; });
  };
  connect();
}

/* =============================== البحث عن الجهاز =============================== */
/** المنافذ التي تستعملها أجهزة التحاليل الشائعة (Mindray وغيره). */
const CANDIDATE_PORTS = [5100, 9100, 6000, 3000, 4000, 5000, 8000, 2000];

function localSubnets() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family !== "IPv4" || ni.internal) continue;
      const parts = ni.address.split(".");
      if (parts.length === 4) out.push({ base: `${parts[0]}.${parts[1]}.${parts[2]}`, self: ni.address });
    }
  }
  return out;
}

function probe(host, port, timeout = 400) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const finish = (ok) => { if (done) return; done = true; try { s.destroy(); } catch { /* ignore */ } resolve(ok); };
    s.setTimeout(timeout);
    s.once("connect", () => finish(true));
    s.once("timeout", () => finish(false));
    s.once("error", () => finish(false));
    try { s.connect(port, host); } catch { finish(false); }
  });
}

async function scanNetwork() {
  if (state.scanning) return [];
  state.scanning = true;
  state.scanProgress = 0;
  const found = [];
  try {
    const nets = localSubnets();
    const targets = [];
    for (const { base, self } of nets) {
      for (let i = 1; i <= 254; i++) {
        const ip = `${base}.${i}`;
        if (ip === self) continue;
        targets.push(ip);
      }
    }
    log("info", `نبحث عن الجهاز في ${targets.length} عنواناً…`);
    let done = 0;
    const CONCURRENCY = 64;
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const idx = cursor++;
        if (idx >= targets.length) return;
        const ip = targets[idx];
        for (const port of CANDIDATE_PORTS) {
          if (await probe(ip, port)) { found.push({ ip, port }); break; }
        }
        done += 1;
        state.scanProgress = Math.round((done / targets.length) * 100);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    log(found.length ? "ok" : "info", found.length ? `لقينا ${found.length} جهازاً محتملاً.` : "ما لقينا أي جهاز — تأكد أن الجهاز مشغّل وعلى نفس الراوتر.");
  } finally {
    state.scanning = false;
    state.scanProgress = 100;
  }
  return found;
}

/* =============================== واجهة المتصفح =============================== */
const HTML = String.raw`<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>ربط جهاز المختبر — doctorVet</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    --brand:#1266d8; --brand-dark:#0f52ad; --brand-tint:#eff6ff;
    --bg:#f1f5f9; --card:#fff; --line:#e2e8f0; --line-soft:#eef2f7;
    --ink:#0f172a; --muted:#64748b; --faint:#94a3b8;
    --ok:#16a34a; --ok-tint:#ecfdf5; --warn:#d97706; --warn-tint:#fffbeb;
    --err:#dc2626; --err-tint:#fef2f2;
    --shadow:0 1px 2px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.06);
  }
  body{font-family:-apple-system,'Segoe UI',system-ui,'Noto Sans Arabic',sans-serif;
       background:var(--bg);color:var(--ink);min-height:100vh;padding:28px 16px 48px;line-height:1.6}
  .wrap{max-width:600px;margin:0 auto}
  .wrap.wide{max-width:820px}

  /* ── الترويسة ── */
  .brandbar{display:flex;align-items:center;gap:13px;margin-bottom:22px}
  .mark{width:50px;height:50px;border-radius:16px;flex:0 0 auto;display:grid;place-items:center;font-size:24px;
        background:linear-gradient(135deg,#1266d8,#3f9bff);box-shadow:0 6px 18px rgba(18,102,216,.28)}
  .brandbar h1{font-size:19px;font-weight:800;letter-spacing:-.02em}
  .brandbar p{font-size:12.5px;color:var(--muted)}

  /* ── البطاقات ── */
  .card{background:var(--card);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);overflow:hidden}
  .card+.card{margin-top:14px}
  .card-head{padding:20px 22px 0}
  .card-body{padding:20px 22px 22px}
  .card h2{font-size:16.5px;font-weight:800;letter-spacing:-.01em}
  .card h2+.sub{font-size:12.5px;color:var(--muted);margin-top:4px}

  /* ── مؤشر الخطوات ── */
  .steps{display:flex;align-items:flex-start;padding:20px 22px 4px;gap:0}
  .st{flex:1;display:flex;flex-direction:column;align-items:center;gap:7px;position:relative}
  .st::before,.st::after{content:'';position:absolute;top:14px;height:2px;background:var(--line);width:50%}
  .st::before{right:50%}.st::after{left:50%}
  .st:first-child::before,.st:last-child::after{display:none}
  .st.done::before,.st.done::after,.st.now::before{background:var(--brand)}
  .bub{width:29px;height:29px;border-radius:50%;display:grid;place-items:center;font-size:12.5px;font-weight:800;
       background:var(--card);border:2px solid var(--line);color:var(--faint);position:relative;z-index:1;transition:.18s}
  .st.now .bub{border-color:var(--brand);color:var(--brand);box-shadow:0 0 0 4px var(--brand-tint)}
  .st.done .bub{border-color:var(--brand);background:var(--brand);color:#fff}
  .st span{font-size:11px;color:var(--faint);font-weight:700;text-align:center}
  .st.now span{color:var(--brand)}
  .st.done span{color:var(--ink)}

  /* ── الحقول ── */
  .field{margin-bottom:15px}
  .field label{display:block;font-size:12.5px;font-weight:800;margin-bottom:6px}
  .field label .opt{color:var(--faint);font-weight:600}
  .field .hint{font-size:11.5px;color:var(--muted);margin-top:5px}
  input{width:100%;background:#fff;border:1.5px solid var(--line);border-radius:12px;padding:11px 13px;
        font-size:14.5px;font-family:inherit;color:var(--ink);transition:.15s}
  input::placeholder{color:#cbd5e1}
  input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3.5px var(--brand-tint)}
  input.bad{border-color:var(--err);box-shadow:0 0 0 3.5px var(--err-tint)}
  .err-txt{font-size:11.5px;color:var(--err);font-weight:700;margin-top:5px}
  .two{display:flex;gap:11px}.two>*{flex:1}.two .narrow{flex:0 0 116px}

  /* ── بطاقات الاختيار ── */
  .pick{display:flex;align-items:flex-start;gap:12px;width:100%;text-align:right;cursor:pointer;
        background:#fff;border:1.5px solid var(--line);border-radius:15px;padding:14px 15px;margin-bottom:10px;
        font-family:inherit;transition:.15s}
  .pick:hover{border-color:#c3d4ea;background:#fbfdff}
  .pick.on{border-color:var(--brand);background:var(--brand-tint);box-shadow:0 0 0 3.5px rgba(18,102,216,.09)}
  .pick .ico{width:38px;height:38px;flex:0 0 auto;border-radius:11px;display:grid;place-items:center;font-size:18px;background:#f1f5f9}
  .pick.on .ico{background:#dbeafe}
  .pick b{display:block;font-size:14px;font-weight:800;margin-bottom:2px}
  /* الوزن 800 يرثه من قاعدة button — بلا إعادة ضبط يطلع الشرح عريضاً كالعنوان. */
  .pick small{display:block;font-size:11.5px;font-weight:600;color:var(--muted);line-height:1.55}
  .tag{display:inline-block;font-size:10px;font-weight:800;color:var(--brand);background:#dbeafe;
       border-radius:99px;padding:1px 7px;margin-inline-start:6px;vertical-align:middle}

  /* ── الأزرار ── */
  .row{display:flex;gap:10px;margin-top:18px}
  button{font-family:inherit;font-weight:800;font-size:14.5px;border:0;border-radius:13px;padding:12.5px 20px;
         cursor:pointer;transition:.15s}
  .primary{background:var(--brand);color:#fff;flex:1;box-shadow:0 4px 14px rgba(18,102,216,.26)}
  .primary:hover{background:var(--brand-dark)}
  .primary:active{transform:scale(.985)}
  button:disabled{opacity:.55;cursor:default;box-shadow:none}
  .ghost{background:#fff;border:1.5px solid var(--line);color:var(--muted)}
  .ghost:hover{color:var(--ink);border-color:#cbd5e1}
  .link{background:none;color:var(--muted);padding:12.5px 4px;font-size:13px}
  .link:hover{color:var(--brand)}

  /* ── البحث ── */
  .bar{height:7px;background:#e8eef6;border-radius:99px;overflow:hidden;margin-top:13px}
  .bar>i{display:block;height:100%;width:0;background:linear-gradient(90deg,#1266d8,#57a9ff);transition:width .35s}
  .found{display:flex;align-items:center;gap:12px;background:#fff;border:1.5px solid var(--line);
         border-radius:13px;padding:12px 14px;margin-bottom:9px}
  .found:hover{border-color:#c3d4ea}
  .found .ip{font-family:ui-monospace,'SF Mono',monospace;font-size:14px;font-weight:700;direction:ltr}
  .found small{display:block;font-size:11px;color:var(--muted)}
  .found button{padding:8px 15px;font-size:12.5px}
  .sep{display:flex;align-items:center;gap:11px;margin:18px 0;color:var(--faint);font-size:11.5px;font-weight:700}
  .sep::before,.sep::after{content:'';flex:1;height:1px;background:var(--line)}
  .empty{text-align:center;color:var(--muted);font-size:13px;padding:26px 10px}

  /* ── المراجعة ── */
  .rev{border:1.5px solid var(--line);border-radius:15px;overflow:hidden}
  .rev div{display:flex;justify-content:space-between;gap:14px;padding:12px 15px;font-size:13.5px}
  .rev div+div{border-top:1px solid var(--line-soft)}
  .rev dt{color:var(--muted);font-weight:700;flex:0 0 auto}
  .rev dd{font-weight:800;text-align:left;word-break:break-word}
  .rev dd.mono{font-family:ui-monospace,monospace;direction:ltr}

  /* ── لوحة التشغيل ── */
  .pill{display:inline-flex;align-items:center;gap:8px;border-radius:99px;padding:7px 15px;font-size:13px;font-weight:800}
  .dot{width:9px;height:9px;border-radius:99px;background:currentColor}
  .dot.live{animation:pulse 1.5s infinite}@keyframes pulse{50%{opacity:.3}}
  .p-ok{background:var(--ok-tint);color:#15803d}.p-warn{background:var(--warn-tint);color:#b45309}
  .p-err{background:var(--err-tint);color:#b91c1c}.p-idle{background:#f1f5f9;color:var(--muted)}
  /* flex لا grid: الشبكة كانت تترك خلية فارغة رمادية لمّا العدد ما يملأ الصف. */
  .stats{display:flex;flex-wrap:wrap;background:#fff;border:1px solid var(--line);
         border-radius:15px;overflow:hidden;margin-top:16px}
  .stats div{flex:1 1 132px;padding:13px 15px;position:relative}
  .stats div+div::before{content:'';position:absolute;inset-block:11px;inset-inline-start:0;width:1px;background:var(--line-soft)}
  .stats dt{font-size:11.5px;color:var(--muted);font-weight:700}
  .stats dd{font-size:15px;font-weight:800;margin-top:3px}
  .stats dd.mono{font-family:ui-monospace,monospace;font-size:13.5px;direction:ltr}
  .log{background:#0b1220;border-radius:14px;padding:11px 13px;max-height:250px;overflow:auto;
       font-size:12px;line-height:1.95;direction:rtl}
  .log>div{display:flex;gap:9px}
  .log time{color:#5b6b8a;font-family:ui-monospace,monospace;flex:0 0 auto;font-size:11px}
  .log .ok{color:#4ade80}.log .err{color:#f87171}.log .info{color:#94a3b8}
  .log .empty{color:#5b6b8a}
  .note{font-size:12px;color:var(--muted);margin-top:13px;line-height:1.75}
  .auto{display:flex;align-items:center;gap:13px;margin-top:14px;padding:13px 15px;
        border:1.5px solid var(--line);border-radius:15px;background:#fff}
  .auto.on{border-color:#a7f3d0;background:var(--ok-tint)}
  .auto b{display:block;font-size:13.5px;font-weight:800}
  .auto.on b{color:#15803d}
  .auto small{display:block;font-size:11.5px;color:var(--muted);line-height:1.6;margin-top:2px}
  .banner{display:flex;gap:11px;align-items:flex-start;background:var(--warn-tint);border:1.5px solid #fde68a;
          border-radius:14px;padding:13px 15px;font-size:12.5px;color:#92400e;line-height:1.7}
  .foot{text-align:center;font-size:11.5px;color:var(--faint);margin-top:20px}
</style></head><body><div class="wrap" id="wrap">
  <div class="brandbar">
    <div class="mark">🔬</div>
    <div><h1>ربط جهاز المختبر</h1><p id="sub">doctorVet — نتائج الجهاز تدخل السستم تلقائياً</p></div>
  </div>
  <div id="app"><div class="card"><div class="card-body"><div class="empty">جاري التحميل…</div></div></div></div>
  <p class="foot">هذه الصفحة تعمل على هذا الحاسوب فقط — لا يراها أحد خارجه.</p>
</div>
<script>
/* يرجّع العنصر الوحيد، أو قطعة تحمل الكل لو كان النص أكثر من جذر —
 * إرجاع firstElementChild فقط كان يبلع الفقرات التوضيحية بصمت. */
const h = (html) => {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  if (d.children.length === 1) return d.firstElementChild;
  const frag = document.createDocumentFragment();
  while (d.firstChild) frag.appendChild(d.firstChild);
  return frag;
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let S = null;              // حالة الخادم
let stepNo = 1;            // خطوة المعالج
let editing = false;       // «تعديل الإعداد» من لوحة التشغيل
let seeded = false;        // عبّينا اسم الجهاز من الاقتران مرة واحدة
let scanRes = null, scanning = false, scanErr = '', saving = false, testing = 0;
const W = { name:'', brand:'', room:'', method:'', host:'', port:'' };
const STEP_NAMES = ['بيانات الجهاز','طريقة الربط','الاتصال','تأكيد'];
const METHODS = {
  auto:   { icon:'🔍', title:'دوّر على الجهاز تلقائياً', desc:'التطبيق يفحص شبكة العيادة ويعرض الأجهزة التي يلقاها. الأسهل — ابدأ من هنا.', rec:true },
  manual: { icon:'⌨️', title:'أعرف عنوان الجهاز',      desc:'اكتب عنوان IP والمنفذ بنفسك. استعملها إذا كان البحث ما لقى الجهاز.' },
  listen: { icon:'📥', title:'الجهاز يرسل بنفسه',       desc:'إعدادات جهازك تطلب عنوان الحاسوب ومنفذاً؟ عندها هو يرسل إلينا ونحن ننتظر.' },
};

async function api(path, body) {
  const r = await fetch(path, body ? { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) } : {});
  return r.json();
}
async function refresh() { S = await api('/api/state'); if (!seeded && S) { seeded = true; W.name = S.deviceName || ''; } render(); }

/* نلتقط ما كتبه المستخدم قبل أي إعادة رسم حتى لا يضيع. */
function grab() {
  ['name','brand','room','host','port'].forEach((k) => {
    const el = document.getElementById('f_' + k);
    if (el) W[k] = el.value.trim();
  });
}
function goto(n) { grab(); stepNo = n; render(); }

function render() {
  const app = document.getElementById('app');
  const wrap = document.getElementById('wrap');
  const sub = document.getElementById('sub');
  app.innerHTML = '';
  if (!S) return;
  if (S.clinic) sub.textContent = 'مربوط بـ ' + S.clinic;
  if (!S.paired) { app.appendChild(viewUnpaired()); wrap.className = 'wrap'; return; }
  if (S.configured && !editing) { wrap.className = 'wrap wide'; app.appendChild(viewDashboard()); app.appendChild(viewLog()); return; }
  wrap.className = 'wrap';
  app.appendChild(viewWizard());
}

/* ═══════════ الملف غير مقترن ═══════════ */
function viewUnpaired() {
  return h('<div class="card"><div class="card-head"><h2>هذا الملف غير مقترن بعيادة</h2>'
    + '<p class="sub">النسخة الصحيحة تجيء مقترنة بعيادتك تلقائياً.</p></div>'
    + '<div class="card-body"><div class="banner"><span>⚠️</span><div>حمّل التطبيق من داخل السستم:<br>'
    + '<b>الإعدادات ← ربط أجهزة المختبر ← حمّل تطبيق الربط</b></div></div></div></div>');
}

/* ═══════════ المعالج ═══════════ */
function viewWizard() {
  const card = h('<div class="card"></div>');
  const steps = h('<div class="steps"></div>');
  STEP_NAMES.forEach((nm, i) => {
    const n = i + 1;
    const cls = n < stepNo ? 'st done' : n === stepNo ? 'st now' : 'st';
    steps.appendChild(h('<div class="' + cls + '"><div class="bub">' + (n < stepNo ? '✓' : n) + '</div><span>' + nm + '</span></div>'));
  });
  card.appendChild(steps);
  card.appendChild(h('<div style="height:1px;background:var(--line-soft);margin:18px 0 0"></div>'));
  const body = h('<div class="card-body"></div>');
  ({ 1: step1, 2: step2, 3: step3, 4: step4 }[stepNo])(body);
  card.appendChild(body);
  return card;
}

/* الخطوة ١ — بيانات الجهاز */
function step1(b) {
  b.appendChild(h('<h2>بيانات الجهاز</h2><p class="sub">تُحفظ مع الإعداد وتظهر في السستم حتى تعرف أي جهاز أرسل النتيجة.</p>'));
  b.appendChild(h('<div style="height:16px"></div>'));

  const f1 = h('<div class="field"><label for="f_name">اسم الجهاز</label>'
    + '<input id="f_name" placeholder="مثال: جهاز CBC — غرفة المختبر" value="' + esc(W.name) + '" autocomplete="off"/>'
    + '<div class="hint">اسم تعرفه أنت. يظهر مع كل نتيجة تصل.</div></div>');
  b.appendChild(f1);

  b.appendChild(h('<div class="field"><label for="f_brand">شركة الجهاز <span class="opt">(اختياري)</span></label>'
    + '<input id="f_brand" list="brands" placeholder="Mindray، Sysmex، Rayto…" value="' + esc(W.brand) + '" dir="ltr" autocomplete="off"/>'
    + '<datalist id="brands"><option>Mindray</option><option>Sysmex</option><option>Abbott</option>'
    + '<option>Horiba</option><option>Rayto</option><option>Dirui</option><option>Genrui</option><option>Boule</option></datalist>'
    + '<div class="hint">تساعدنا لو احتجت دعماً فنياً لاحقاً.</div></div>'));

  b.appendChild(h('<div class="field"><label for="f_room">موقع الجهاز <span class="opt">(اختياري)</span></label>'
    + '<input id="f_room" placeholder="مثال: غرفة المختبر — الطابق الأول" value="' + esc(W.room) + '" autocomplete="off"/></div>'));

  const row = h('<div class="row"></div>');
  const next = h('<button class="primary">التالي ←</button>');
  next.onclick = () => {
    grab();
    const el = document.getElementById('f_name');
    if (!W.name) {
      el.classList.add('bad'); el.focus();
      if (!el.parentElement.querySelector('.err-txt')) el.parentElement.appendChild(h('<div class="err-txt">اكتب اسماً للجهاز حتى تميّزه لاحقاً.</div>'));
      return;
    }
    goto(2);
  };
  row.appendChild(next);
  b.appendChild(row);
  setTimeout(() => { const el = document.getElementById('f_name'); if (el && !W.name) el.focus(); }, 30);
}

/* الخطوة ٢ — طريقة الربط */
function step2(b) {
  b.appendChild(h('<h2>كيف نوصل للجهاز؟</h2><p class="sub">اختر طريقة — تكدر ترجع وتغيّرها بأي وقت.</p>'));
  b.appendChild(h('<div style="height:16px"></div>'));
  Object.keys(METHODS).forEach((k) => {
    const m = METHODS[k];
    const card = h('<button class="pick' + (W.method === k ? ' on' : '') + '">'
      + '<span class="ico">' + m.icon + '</span>'
      + '<span><b>' + m.title + (m.rec ? '<span class="tag">موصى به</span>' : '') + '</b><small>' + m.desc + '</small></span></button>');
    card.onclick = () => {
      const changed = W.method !== k;
      W.method = k;
      if (changed) { scanRes = null; W.host = ''; W.port = k === 'listen' ? '9100' : '5100'; }
      goto(3);
    };
    b.appendChild(card);
  });
  const row = h('<div class="row"></div>');
  const back = h('<button class="link">→ رجوع</button>');
  back.onclick = () => goto(1);
  row.appendChild(back);
  b.appendChild(row);
}

/* الخطوة ٣ — الاتصال */
function step3(b) {
  if (W.method === 'auto') return step3auto(b);
  if (W.method === 'manual') return step3manual(b);
  return step3listen(b);
}

function navRow(b, backTo, nextFn, nextLabel, enabled) {
  const row = h('<div class="row"></div>');
  const back = h('<button class="ghost">→ رجوع</button>');
  back.onclick = () => goto(backTo);
  row.appendChild(back);
  if (nextFn) {
    const nx = h('<button class="primary">' + nextLabel + '</button>');
    nx.disabled = enabled === false;
    nx.onclick = nextFn;
    row.appendChild(nx);
  }
  b.appendChild(row);
}

function step3auto(b) {
  b.appendChild(h('<h2>البحث عن الجهاز</h2><p class="sub">نفحص كل عناوين شبكة العيادة على المنافذ الشائعة.</p>'));
  b.appendChild(h('<div style="height:16px"></div>'));
  b.appendChild(h('<div class="banner"><span>💡</span><div>تأكد أن جهاز المختبر <b>مشغّل</b> وموصول بالراوتر بكيبل الشبكة قبل البحث.</div></div>'));
  b.appendChild(h('<div style="height:14px"></div>'));

  if (!scanRes && !scanning) {
    if (scanErr) b.appendChild(h('<div class="banner" style="background:var(--err-tint);border-color:#fecaca;color:#991b1b"><span>✕</span><div>تعذّر البحث: ' + esc(scanErr) + '<br>جرّب مرة ثانية، أو ارجع واكتب عنوان الجهاز يدوياً.</div></div><div style="height:14px"></div>'));
    const go = h('<button class="primary" style="width:100%">🔍 ' + (scanErr ? 'حاول من جديد' : 'ابدأ البحث') + '</button>');
    go.onclick = async () => {
      scanErr = ''; scanning = true; render();
      const bar = document.getElementById('scanbar');
      const tick = setInterval(async () => {
        try { const st = await api('/api/state'); if (bar) bar.style.width = (st.scanProgress || 0) + '%'; } catch { /* نكمل */ }
      }, 600);
      try {
        const r = await api('/api/scan', {});
        scanRes = r.hosts || [];
      } catch (e) {
        // بلا هذا المسار كانت الواجهة تعلق على «نبحث الآن…» للأبد بلا مخرج.
        scanErr = (e && e.message) || 'خطأ غير متوقع';
        scanRes = null;
      } finally {
        clearInterval(tick);
        scanning = false;
        render();
      }
    };
    b.appendChild(go);
  } else if (scanning) {
    b.appendChild(h('<p style="font-size:13.5px;font-weight:700">نبحث الآن… قد يستغرق نصف دقيقة.</p>'));
    b.appendChild(h('<div class="bar"><i id="scanbar"></i></div>'));
  } else {
    if (!scanRes.length) {
      b.appendChild(h('<div class="empty">ما لكينا أي جهاز.<br>تأكد أنه مشغّل وعلى نفس الراوتر، أو ارجع واختر «أعرف عنوان الجهاز».</div>'));
    } else {
      b.appendChild(h('<p style="font-size:13px;font-weight:800;margin-bottom:11px">لكينا ' + scanRes.length + ' جهازاً محتملاً — اختر جهازك:</p>'));
      scanRes.forEach((x) => {
        const row = h('<div class="found"><span style="font-size:19px">🖥️</span>'
          + '<div style="flex:1"><span class="ip">' + esc(x.ip) + '</span><small>منفذ ' + x.port + '</small></div></div>');
        const pick = h('<button class="primary" style="flex:0 0 auto;box-shadow:none">اختر</button>');
        pick.onclick = () => { W.host = x.ip; W.port = String(x.port); goto(4); };
        row.appendChild(pick);
        b.appendChild(row);
      });
    }
    const again = h('<button class="ghost" style="width:100%;margin-top:6px">🔄 ابحث من جديد</button>');
    again.onclick = () => { scanRes = null; render(); };
    b.appendChild(again);
  }
  navRow(b, 2, null);
}

function step3manual(b) {
  b.appendChild(h('<h2>عنوان الجهاز</h2><p class="sub">تلكاه بإعدادات الشبكة داخل الجهاز نفسه (LIS / Network).</p>'));
  b.appendChild(h('<div style="height:16px"></div>'));
  const two = h('<div class="two"></div>');
  two.appendChild(h('<div class="field" style="margin:0"><label for="f_host">عنوان IP</label>'
    + '<input id="f_host" placeholder="192.168.0.233" dir="ltr" value="' + esc(W.host) + '" autocomplete="off"/></div>'));
  two.appendChild(h('<div class="field narrow" style="margin:0"><label for="f_port">المنفذ</label>'
    + '<input id="f_port" dir="ltr" value="' + esc(W.port || '5100') + '" autocomplete="off"/></div>'));
  b.appendChild(two);
  b.appendChild(h('<div class="hint" style="margin-top:7px">المنفذ الشائع لأجهزة Mindray هو <b>5100</b>.</div>'));
  navRow(b, 2, () => {
    grab();
    const el = document.getElementById('f_host');
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(W.host)) {
      el.classList.add('bad'); el.focus();
      if (!el.parentElement.querySelector('.err-txt')) el.parentElement.appendChild(h('<div class="err-txt">اكتب عنواناً صحيحاً مثل 192.168.0.233</div>'));
      return;
    }
    if (!W.port) W.port = '5100';
    goto(4);
  }, 'التالي ←');
}

function step3listen(b) {
  b.appendChild(h('<h2>وضع الاستقبال</h2><p class="sub">نفتح منفذاً على هذا الحاسوب وننتظر الجهاز يرسل إلينا.</p>'));
  b.appendChild(h('<div style="height:16px"></div>'));
  b.appendChild(h('<div class="field"><label for="f_port">المنفذ الذي ننتظر عليه</label>'
    + '<input id="f_port" dir="ltr" value="' + esc(W.port || '9100') + '" autocomplete="off"/>'
    + '<div class="hint">حط نفس الرقم بإعدادات الجهاز (LIS / Host Port)، مع عنوان هذا الحاسوب.</div></div>'));
  if (S && S.hostIps && S.hostIps.length) {
    b.appendChild(h('<div class="banner"><span>🖧</span><div>عنوان هذا الحاسوب على الشبكة: '
      + '<b style="font-family:ui-monospace,monospace;direction:ltr">' + esc(S.hostIps.join('  ·  ')) + '</b><br>اكتبه بإعدادات الجهاز.</div></div>'));
  }
  navRow(b, 2, () => { grab(); if (!W.port) W.port = '9100'; goto(4); }, 'التالي ←');
}

/* الخطوة ٤ — مراجعة وحفظ */
function step4(b) {
  b.appendChild(h('<h2>راجع وتأكد</h2><p class="sub">تأكد أن كل شي صحيح قبل التشغيل.</p>'));
  b.appendChild(h('<div style="height:16px"></div>'));
  const rows = [
    ['اسم الجهاز', esc(W.name), false],
    W.brand ? ['الشركة', esc(W.brand), true] : null,
    W.room ? ['الموقع', esc(W.room), false] : null,
    ['طريقة الربط', METHODS[W.method].title, false],
    W.method === 'listen' ? ['ننتظر على المنفذ', esc(W.port), true] : ['عنوان الجهاز', esc(W.host) + ':' + esc(W.port), true],
  ].filter(Boolean);
  const rev = h('<div class="rev"></div>');
  rows.forEach((r) => rev.appendChild(h('<div><dt>' + r[0] + '</dt><dd' + (r[2] ? ' class="mono"' : '') + '>' + r[1] + '</dd></div>')));
  b.appendChild(rev);

  const row = h('<div class="row"></div>');
  const back = h('<button class="ghost">→ رجوع</button>');
  back.onclick = () => goto(3);
  const save = h('<button class="primary">✓ احفظ وشغّل</button>');
  save.onclick = async () => {
    if (saving) return;
    saving = true; save.disabled = true; back.disabled = true; save.textContent = 'نحفظ…';
    await api('/api/save', {
      name: W.name, brand: W.brand, room: W.room,
      mode: W.method === 'listen' ? 'tcp-listen' : 'tcp-connect',
      host: W.method === 'listen' ? '0.0.0.0' : W.host,
      port: W.port,
    });
    saving = false; editing = false; stepNo = 1; scanRes = null;
    await refresh();
  };
  row.appendChild(back); row.appendChild(save);
  b.appendChild(row);
}

/* ═══════════ لوحة التشغيل ═══════════ */
const PILL = { connected:['p-ok','متصل بالجهاز'], listening:['p-warn','ننتظر الجهاز'], connecting:['p-warn','نحاول الاتصال'], error:['p-err','خطأ بالاتصال'], idle:['p-idle','متوقف'] };

function viewDashboard() {
  const P = PILL[S.status] || PILL.idle;
  const card = h('<div class="card"></div>');
  const b = h('<div class="card-body"></div>');

  const top = h('<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"></div>');
  top.appendChild(h('<span class="pill ' + P[0] + '"><span class="dot' + (S.status === 'connected' ? ' live' : '') + '"></span>' + P[1] + '</span>'));
  if (S.detail) top.appendChild(h('<span style="font-size:12.5px;color:var(--muted)">' + esc(S.detail) + '</span>'));
  b.appendChild(top);

  const st = h('<div class="stats"></div>');
  st.appendChild(h('<div><dt>الجهاز</dt><dd>' + esc(S.deviceName) + '</dd></div>'));
  if (S.brand) st.appendChild(h('<div><dt>الشركة</dt><dd>' + esc(S.brand) + '</dd></div>'));
  if (S.room) st.appendChild(h('<div><dt>الموقع</dt><dd>' + esc(S.room) + '</dd></div>'));
  st.appendChild(h('<div><dt>العنوان</dt><dd class="mono">' + esc(S.address) + '</dd></div>'));
  st.appendChild(h('<div><dt>نتائج وصلت</dt><dd>' + S.sent + '</dd></div>'));
  st.appendChild(h('<div><dt>آخر نتيجة</dt><dd>' + (S.lastAt || '—') + '</dd></div>'));
  b.appendChild(st);

  const row = h('<div class="row"></div>');
  const toggle = h('<button class="' + (S.running ? 'ghost' : 'primary') + '">' + (S.running ? '⏸ إيقاف' : '▶ تشغيل') + '</button>');
  toggle.onclick = async () => { toggle.disabled = true; await api(S.running ? '/api/stop' : '/api/start', {}); refresh(); };
  row.appendChild(toggle);

  const test = h('<button class="ghost">' + (testing === 1 ? 'نرسل…' : testing === 2 ? '✓ وصلت للسستم' : testing === 3 ? '✗ ما وصلت' : '🧪 جرّب الاتصال') + '</button>');
  test.disabled = testing === 1;
  test.onclick = async () => {
    testing = 1; render();
    const r = await api('/api/test', {});
    testing = r.ok ? 2 : 3; render();
    setTimeout(() => { testing = 0; refresh(); }, 2600);
  };
  row.appendChild(test);

  const edit = h('<button class="ghost">⚙ تعديل الإعداد</button>');
  edit.onclick = () => {
    W.name = S.deviceName || ''; W.brand = S.brand || ''; W.room = S.room || '';
    W.method = S.mode === 'tcp-listen' ? 'listen' : 'manual';
    W.host = S.host || ''; W.port = String(S.port || '');
    editing = true; stepNo = 1; scanRes = null; render();
  };
  row.appendChild(edit);
  b.appendChild(row);

  if (S.autostartSupported) {
    const on = !!S.autostart;
    const row2 = h('<div class="auto' + (on ? ' on' : '') + '"></div>');
    row2.appendChild(h('<div style="flex:1"><b>' + (on ? '✓ يشتغل تلقائياً مع الحاسوب' : 'شغّله تلقائياً مع الحاسوب') + '</b>'
      + '<small>' + (on
        ? 'ما تحتاج تشغّله كل صباح، ولو توقّف يرجع لحاله. (لو نقلت مجلد البرنامج، أطفئ الخيار وفعّله من جديد.)'
        : 'يبدأ لحاله عند تشغيل الحاسوب، ويعيد المحاولة لو توقّف — مناسب لحاسوب المختبر.') + '</small></div>'));
    const sw = h('<button class="' + (on ? 'ghost' : 'primary') + '" style="flex:0 0 auto">' + (on ? 'إلغاء' : 'فعّل') + '</button>');
    sw.onclick = async () => {
      sw.disabled = true; sw.textContent = '...';
      const r = await api('/api/autostart', { enable: !on });
      if (!r.ok) alert('تعذّر: ' + (r.error || 'خطأ غير معروف'));
      refresh();
    };
    row2.appendChild(sw);
    b.appendChild(row2);
  }

  b.appendChild(h('<p class="note">اترك هذا التطبيق شغّالاً أثناء دوام العيادة — النتيجة تدخل السستم لحظة خروجها من الجهاز.'
    + ' تكدر تسكّر صفحة المتصفح بأمان، بس لا تسكّر النافذة السوداء.</p>'));
  card.appendChild(b);
  return card;
}

function viewLog() {
  const card = h('<div class="card"></div>');
  card.appendChild(h('<div class="card-head"><h2>سجل النشاط</h2></div>'));
  const b = h('<div class="card-body"></div>');
  const box = h('<div class="log"></div>');
  if (!S.log.length) box.appendChild(h('<div class="empty">لا يوجد نشاط بعد.</div>'));
  S.log.forEach((l) => box.appendChild(h('<div><time>' + esc(l.at) + '</time><span class="' + l.kind + '">' + esc(l.text) + '</span></div>')));
  b.appendChild(box);
  card.appendChild(b);
  return card;
}

refresh();
/* لا نحدّث تلقائياً أثناء المعالج — إعادة الرسم تمسح ما يكتبه المستخدم. */
setInterval(() => { if (S && S.configured && !editing && !scanning && testing === 0) refresh(); }, 2500);
</script></body></html>`;

/* =============================== الخادم المحلي =============================== */
function json(res, obj) {
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (d) => { b += d; });
    req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } });
  });
}

const ui = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(HTML);
    return;
  }
  if (url === "/api/state") {
    const p = pairing();
    const conn = connection();
    return json(res, {
      paired: !!(p.url && p.anonKey && p.token),
      configured: !!conn,
      running: !stopped,
      status: state.status,
      detail: state.detail,
      clinic: p.clinic || null,
      deviceName: conn?.name || p.device,
      brand: conn?.brand || "",
      room: conn?.room || "",
      mode: conn?.mode || "",
      host: conn?.host || "",
      port: conn?.port || "",
      hostIps: hostIps(),
      autostartSupported: !!autostartFile(),
      autostart: autostartOn(),
      address: conn ? (conn.mode === "tcp-listen" ? `المنفذ ${conn.port}` : `${conn.host}:${conn.port}`) : "—",
      sent: state.sent,
      lastAt: state.lastAt ? new Date(state.lastAt).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }) : null,
      scanProgress: state.scanProgress,
      log: state.log,
    });
  }
  if (url === "/api/scan" && req.method === "POST") {
    const hosts = await scanNetwork();
    return json(res, { hosts });
  }
  if (url === "/api/save" && req.method === "POST") {
    const b = await readBody(req);
    saveConnection({ name: b.name, brand: b.brand, room: b.room, mode: b.mode, host: b.host, port: b.port });
    log("info", `انحفظ الإعداد: ${b.mode === "tcp-listen" ? `استقبال على ${b.port}` : `${b.host}:${b.port}`}`);
    startBridge();
    return json(res, { ok: true });
  }
  if (url === "/api/test" && req.method === "POST") {
    /* يثبت أن الاقتران والإنترنت سليمان قبل أن يعتمد الطبيب على الجهاز. */
    const before = state.sent;
    await forward([
      "MSH|^~\\&|DOCTORVET|APP|||20260101||ORU^R01|1|P|2.3",
      "PID|1||TEST||حيوان تجريبي",
      "OBR|1||T1|CBC",
      "OBX|1|NM|WBC^White Blood Cells||12.4|10^3/uL|6-17|N",
      "OBX|2|NM|HGB^Hemoglobin||14.2|g/dL|12-18|N",
      "OBX|3|NM|PLT^Platelets||320|10^3/uL|200-500|N",
    ].join("\r") + "\r");
    return json(res, { ok: state.sent > before });
  }
  if (url === "/api/autostart" && req.method === "POST") {
    const b = await readBody(req);
    return json(res, setAutostart(!!b.enable));
  }
  if (url === "/api/start" && req.method === "POST") { startBridge(); return json(res, { ok: true }); }
  if (url === "/api/stop" && req.method === "POST") { stopBridge(); log("info", "أوقفنا الاستقبال."); return json(res, { ok: true }); }
  if (url === "/api/forget" && req.method === "POST") {
    stopBridge();
    const p = pairing();
    writeConfig({ url: p.url, anonKey: p.anonKey, token: p.token, device: p.device });
    return json(res, { ok: true });
  }
  res.writeHead(404); res.end();
});

function openBrowser(u) {
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", u]]
    : process.platform === "darwin" ? ["open", [u]]
      : ["xdg-open", [u]];
  try {
    const p = spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true });
    // فشل الفتح يجي كحدث لاحق لا كاستثناء — بلا هذا السطر ينهار التطبيق كله
    // على أي جهاز ما عنده أداة فتح المتصفح. الفتح كماليّ: الرابط مطبوع فوك.
    p.on("error", () => console.log("افتح الرابط يدوياً بالمتصفح."));
    p.unref();
  } catch { /* المستخدم يفتحه يدوياً */ }
}

function listen(port, tries = 8) {
  ui.once("error", (e) => {
    if (e.code === "EADDRINUSE" && tries > 0) { listen(port + 1, tries - 1); return; }
    console.error("تعذّر تشغيل الواجهة:", e.message);
    process.exit(1);
  });
  ui.listen(port, "127.0.0.1", () => {
    const u = `http://127.0.0.1:${port}`;
    console.log(`▶ افتح المتصفح على ${u}`);
    log("info", "التطبيق جاهز.");
    if (connection()) startBridge();
    openBrowser(u);
  });
}

listen(UI_PORT_FIRST);
process.on("SIGINT", () => { stopBridge(); process.exit(0); });
