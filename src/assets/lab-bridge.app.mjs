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
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

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
  return { url: p.url, anonKey: p.anonKey, token: p.token, device: p.device || "جهاز المختبر" };
}

function connection() {
  const c = readConfig();
  if (!c.mode) return null;
  return {
    mode: c.mode,
    host: c.host || "0.0.0.0",
    port: Number(c.port || 9100),
    name: c.device || pairing().device,
  };
}

function saveConnection({ name, mode, host, port }) {
  const p = pairing();
  writeConfig({
    url: p.url, anonKey: p.anonKey, token: p.token,
    device: name || p.device,
    mode, host, port: Number(port),
    framing: "auto", idleMs: 1500,
  });
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
  :root{--bg:#0b1220;--card:#141c2e;--line:#22304a;--ink:#eaf1ff;--muted:#93a4c4;--brand:#1266d8;--ok:#16a34a;--warn:#d97706;--err:#dc2626}
  body{font-family:-apple-system,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;padding:24px 16px}
  .wrap{max-width:760px;margin:0 auto}
  .head{display:flex;align-items:center;gap:12px;margin-bottom:20px}
  .logo{width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,#1266d8,#39a0ff);display:grid;place-items:center;font-size:22px}
  h1{font-size:20px;font-weight:800}.sub{color:var(--muted);font-size:13px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;margin-bottom:14px}
  .pill{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:7px 14px;font-size:13px;font-weight:800}
  .dot{width:9px;height:9px;border-radius:99px;background:currentColor}
  .dot.live{animation:p 1.4s infinite}@keyframes p{50%{opacity:.35}}
  .ok{background:rgba(22,163,74,.16);color:#4ade80}.warn{background:rgba(217,119,6,.16);color:#fbbf24}
  .err{background:rgba(220,38,38,.16);color:#f87171}.idle{background:rgba(147,164,196,.14);color:var(--muted)}
  h2{font-size:15px;font-weight:800;margin-bottom:12px}
  label{display:block;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px}
  input{width:100%;background:#0e1626;border:1px solid var(--line);border-radius:12px;padding:11px 13px;color:var(--ink);font-size:14px;font-family:inherit}
  input:focus{outline:none;border-color:var(--brand)}
  .row{display:flex;gap:10px;flex-wrap:wrap}.row>*{flex:1;min-width:130px}
  button{background:var(--brand);color:#fff;border:0;border-radius:12px;padding:12px 18px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;transition:.15s}
  button:hover{filter:brightness(1.1)}button:active{transform:scale(.98)}button:disabled{opacity:.5;cursor:default}
  button.ghost{background:transparent;border:1px solid var(--line);color:var(--muted)}
  button.danger{background:rgba(220,38,38,.15);color:#f87171}
  .found{display:flex;align-items:center;gap:12px;background:#0e1626;border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:8px}
  .found b{font-family:ui-monospace,monospace;font-size:14px}
  .found button{padding:8px 14px;font-size:13px}
  .bar{height:6px;background:#0e1626;border-radius:99px;overflow:hidden;margin-top:10px}
  .bar>i{display:block;height:100%;background:linear-gradient(90deg,#1266d8,#39a0ff);transition:width .3s}
  .stat{display:flex;gap:20px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
  .stat div{font-size:12px;color:var(--muted)}.stat b{display:block;font-size:17px;color:var(--ink);margin-top:2px}
  .log{background:#08101d;border:1px solid var(--line);border-radius:12px;padding:10px;max-height:230px;overflow:auto;font-size:12px;line-height:1.9}
  .log div{display:flex;gap:8px}.log time{color:#5b6b8a;font-family:ui-monospace,monospace;flex:0 0 auto}
  .log .ok{background:none;color:#4ade80}.log .err{background:none;color:#f87171}.log .info{background:none;color:var(--muted)}
  .hint{font-size:12px;color:var(--muted);line-height:1.8;margin-top:10px}
  .sep{text-align:center;color:var(--muted);font-size:12px;margin:14px 0}
  .empty{text-align:center;color:var(--muted);padding:22px 0;font-size:13px}
</style></head><body><div class="wrap">
  <div class="head">
    <div class="logo">🔬</div>
    <div><h1>ربط جهاز المختبر</h1><div class="sub">doctorVet — نتائج الجهاز تدخل السستم تلقائياً</div></div>
  </div>
  <div id="app"><div class="card"><div class="empty">جاري التحميل…</div></div></div>
</div>
<script>
const $ = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; };
let S = null, scanRes = null, busy = false;

const PILL = { connected:['ok','متصل بالجهاز'], listening:['warn','ننتظر الجهاز'], connecting:['warn','نحاول الاتصال'], error:['err','خطأ'], idle:['idle','متوقف'] };

async function api(path, body) {
  const r = await fetch(path, body ? { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) } : {});
  return r.json();
}
async function refresh(){ S = await api('/api/state'); render(); }

function render(){
  const app = document.getElementById('app');
  app.innerHTML = '';
  if (!S) return;
  const [cls, label] = PILL[S.status] || PILL.idle;

  if (!S.paired) {
    app.appendChild($('<div class="card"><h2>هذا الملف غير مقترن بعيادة</h2><div class="hint">حمّل التطبيق من داخل السستم: الإعدادات ← ربط أجهزة المختبر ← «حمّل تطبيق الربط». النسخة التي تنزّلها من هناك تجيء مقترنة بعيادتك تلقائياً.</div></div>'));
    return;
  }

  // ── حالة الاتصال ──
  const head = $('<div class="card"></div>');
  head.appendChild($('<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">'
    + '<span class="pill ' + cls + '"><span class="dot ' + (S.status==='connected'?'live':'') + '"></span>' + label + '</span>'
    + '<span style="font-size:13px;color:var(--muted)">' + (S.detail||'') + '</span></div>'));
  if (S.configured) {
    head.appendChild($('<div class="stat"><div>الجهاز<b>' + S.deviceName + '</b></div>'
      + '<div>العنوان<b style="font-family:ui-monospace,monospace;font-size:14px">' + S.address + '</b></div>'
      + '<div>نتائج وصلت<b>' + S.sent + '</b></div>'
      + '<div>آخر نتيجة<b>' + (S.lastAt || '—') + '</b></div></div>'));
  }
  const acts = $('<div class="row" style="margin-top:14px"></div>');
  if (S.configured) {
    const toggle = $('<button>' + (S.running ? 'إيقاف' : 'تشغيل') + '</button>');
    if (S.running) toggle.className = 'ghost';
    toggle.onclick = async () => { toggle.disabled = true; await api(S.running ? '/api/stop' : '/api/start', {}); refresh(); };
    acts.appendChild(toggle);
    const change = $('<button class="ghost">تغيير الجهاز</button>');
    change.onclick = async () => { await api('/api/forget', {}); scanRes = null; refresh(); };
    acts.appendChild(change);
  }
  const test = $('<button class="ghost">جرّب الاتصال بالسستم</button>');
  test.onclick = async () => {
    test.disabled = true; test.textContent = 'نرسل…';
    const r = await api('/api/test', {});
    test.textContent = r.ok ? '✓ وصلت للسستم' : '✗ ما وصلت — شوف السجل';
    setTimeout(refresh, 2200);
  };
  acts.appendChild(test);
  head.appendChild(acts);
  app.appendChild(head);

  // ── معالج الإعداد ──
  if (!S.configured) {
    const c = $('<div class="card"><h2>اختر جهاز المختبر</h2></div>');
    const btn = $('<button style="width:100%">🔍 ابحث عن الجهاز في الشبكة</button>');
    btn.disabled = busy;
    btn.onclick = async () => {
      busy = true; btn.disabled = true; btn.textContent = 'نبحث… قد يستغرق نصف دقيقة';
      const bar = $('<div class="bar"><i style="width:0%"></i></div>');
      c.appendChild(bar);
      const t = setInterval(async () => { const st = await api('/api/state'); bar.firstChild.style.width = (st.scanProgress||0) + '%'; }, 600);
      const r = await api('/api/scan', {});
      clearInterval(t); busy = false; scanRes = r.hosts || [];
      refresh();
    };
    c.appendChild(btn);
    c.appendChild($('<div class="hint">التطبيق يفحص كل الأجهزة على شبكة العيادة ويعرض ما يصلح منها. تأكد أن جهاز المختبر مشغّل وموصول بالراوتر بكيبل الشبكة.</div>'));

    if (scanRes) {
      c.appendChild($('<div class="sep">— النتائج —</div>'));
      if (!scanRes.length) c.appendChild($('<div class="empty">ما لقينا جهازاً. تأكد أن الجهاز مشغّل وعلى نفس الراوتر، أو أدخل عنوانه يدوياً تحت.</div>'));
      for (const h of scanRes) {
        const row = $('<div class="found"><span style="font-size:18px">🖨️</span><div style="flex:1"><b>' + h.ip + '</b><div style="font-size:11px;color:var(--muted)">منفذ ' + h.port + '</div></div></div>');
        const b = $('<button>اربط</button>');
        b.onclick = async () => { b.disabled = true; b.textContent='...'; await api('/api/save', { mode:'tcp-connect', host:h.ip, port:h.port }); scanRes=null; refresh(); };
        row.appendChild(b); c.appendChild(row);
      }
    }

    c.appendChild($('<div class="sep">— أو أدخل العنوان يدوياً —</div>'));
    const man = $('<div class="row"></div>');
    man.appendChild($('<div><label>عنوان الجهاز (IP)</label><input id="mh" placeholder="192.168.0.233" dir="ltr"/></div>'));
    man.appendChild($('<div><label>المنفذ</label><input id="mp" value="5100" dir="ltr"/></div>'));
    c.appendChild(man);
    const mb = $('<button style="width:100%;margin-top:10px">اربط بهذا العنوان</button>');
    mb.onclick = async () => {
      const host = document.getElementById('mh').value.trim(), port = document.getElementById('mp').value.trim();
      if (!host) return;
      mb.disabled = true; await api('/api/save', { mode:'tcp-connect', host, port }); scanRes=null; refresh();
    };
    c.appendChild(mb);

    const alt = $('<button class="ghost" style="width:100%;margin-top:8px">جهازي يرسل بنفسه (وضع الاستقبال)</button>');
    alt.onclick = async () => { await api('/api/save', { mode:'tcp-listen', host:'0.0.0.0', port:9100 }); scanRes=null; refresh(); };
    c.appendChild(alt);
    c.appendChild($('<div class="hint">استخدم «وضع الاستقبال» إذا كانت إعدادات جهازك تطلب عنوان الحاسوب والمنفذ — عندها يرسل الجهاز إلينا بدل أن نتصل به.</div>'));
    app.appendChild(c);
  }

  // ── السجل ──
  const lc = $('<div class="card"><h2>السجل</h2></div>');
  const box = $('<div class="log"></div>');
  if (!S.log.length) box.appendChild($('<div class="empty">لا يوجد نشاط بعد.</div>'));
  for (const l of S.log) box.appendChild($('<div><time>' + l.at + '</time><span class="' + l.kind + '">' + l.text + '</span></div>'));
  lc.appendChild(box);
  lc.appendChild($('<div class="hint">اترك هذا التطبيق شغّالاً أثناء دوام العيادة — النتائج تدخل السستم لحظة خروجها من الجهاز.</div>'));
  app.appendChild(lc);
}

refresh();
setInterval(() => { if (!busy) refresh(); }, 2500);
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
      deviceName: conn?.name || p.device,
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
    saveConnection({ name: b.name, mode: b.mode, host: b.host, port: b.port });
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
