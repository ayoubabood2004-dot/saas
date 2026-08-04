#!/usr/bin/env node
// ============================================================================
// lab-bridge — المُستقبِل الصغير لنظام doctorVet (نسخة ذاتية الاكتفاء).
//
// يشتغل على أي حاسوب قرب جهاز التحاليل: يقرأ الجهاز (شبكة/سريال)، يفهم لغته
// تلقائياً (HL7 / ASTM / نص)، ويرسل كل نتيجة كاملة لصندوق المختبر بالسحابة
// مستخدماً رمز الجهاز السري. بلا كتابة، بلا واير طويل — الجهاز يقدر يكون بغرفة
// ثانية ويوصل عبر الشبكة (LAN).
//
// التشغيل:
//   1) ثبّت Node.js 18+ من nodejs.org
//   2) حط ملف lab-bridge.config.json (المُنزّل من الإعدادات) بنفس المجلد
//   3) node lab-bridge.mjs
//
// أوضاع الشبكة (tcp-listen / tcp-connect) بلا أي تثبيت إضافي. وضع السريال
// يحتاج:  npm i serialport
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import net from "node:net";

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

function autoFramer() {
  let inner = null;
  let sniff = [];
  return {
    push(chunk) {
      if (!inner) {
        for (const b of chunk) sniff.push(b);
        if (sniff.includes(0x0b)) inner = mllpFramer();
        else if (sniff.includes(0x02)) inner = astmFramer();
        else if (sniff.length > 256) inner = idleFramer();
        if (inner) { const seed = sniff; sniff = []; return inner.push(seed); }
        return [];
      }
      return inner.push(chunk);
    },
    flush() { if (inner) return inner.flush(); const out = sniff.length ? [dec(sniff)] : []; sniff = []; return out; },
  };
}

function framerFor(mode) {
  if (mode === "hl7" || mode === "mllp") return mllpFramer();
  if (mode === "astm") return astmFramer();
  if (mode === "generic" || mode === "idle") return idleFramer();
  return autoFramer();
}

const ENQ = 0x05, ACK = 0x06, ETX = 0x03, ETB = 0x17;
function ackBytesFor(chunk) {
  let n = 0;
  for (const b of chunk) if (b === ENQ || b === ETX || b === ETB) n++;
  return n ? Buffer.alloc(n, ACK) : null;
}

/* =============================== الإعداد =============================== */
const HERE = dirname(fileURLToPath(import.meta.url));

function loadConfig() {
  let file = {};
  try { file = JSON.parse(readFileSync(join(HERE, "lab-bridge.config.json"), "utf8")); }
  catch { /* fall back to env */ }
  const e = process.env;
  const cfg = {
    url: e.LAB_BRIDGE_URL || file.url,
    anonKey: e.LAB_BRIDGE_ANON_KEY || file.anonKey,
    token: e.LAB_BRIDGE_TOKEN || file.token,
    device: e.LAB_BRIDGE_DEVICE || file.device || "جهاز المختبر",
    mode: e.LAB_BRIDGE_MODE || file.mode || "tcp-listen",
    host: e.LAB_BRIDGE_HOST || file.host || "0.0.0.0",
    port: Number(e.LAB_BRIDGE_PORT || file.port || 9100),
    framing: e.LAB_BRIDGE_FRAMING || file.framing || "auto",
    serialPath: e.LAB_BRIDGE_SERIAL_PATH || file.serialPath,
    baudRate: Number(e.LAB_BRIDGE_BAUD || file.baudRate || 9600),
    idleMs: Number(e.LAB_BRIDGE_IDLE_MS || file.idleMs || 1500),
  };
  if (!cfg.url || !cfg.anonKey || !cfg.token) {
    console.error("✗ ناقص إعداد: url + anonKey + token مطلوبة. حمّل ملف الإعداد من إعدادات السستم (ربط أجهزة المختبر).");
    process.exit(1);
  }
  return cfg;
}

const cfg = loadConfig();
const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (...a) => console.log(`[${ts()}]`, ...a);

/* =============================== الإرسال للسحابة =============================== */
async function forward(raw) {
  const body = JSON.stringify({ p_token: cfg.token, p_raw: raw });
  const endpoint = cfg.url.replace(/\/+$/, "") + "/rest/v1/rpc/ingest_device_message";
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
      body,
    });
    if (!res.ok) { log(`✗ رفض السحابة (${res.status}):`, (await res.text()).slice(0, 200)); return false; }
    log(`✓ أُرسلت رسالة (${raw.length} حرف) لصندوق المختبر.`);
    return true;
  } catch (err) {
    log("✗ تعذّر الاتصال بالسحابة — سنعيد المحاولة عند الرسالة التالية:", err.message);
    return false;
  }
}

function makeReader(onFrame, writeBack) {
  const framer = framerFor(cfg.framing);
  let idle;
  const armIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(() => { for (const f of framer.flush()) onFrame(f); }, cfg.idleMs);
  };
  return {
    feed(chunk) {
      const ack = ackBytesFor(chunk);
      if (ack && writeBack) { try { writeBack(ack); } catch { /* best effort */ } }
      for (const f of framer.push(chunk)) onFrame(f);
      armIdle();
    },
    end() { clearTimeout(idle); for (const f of framer.flush()) onFrame(f); },
  };
}

const onMessage = (raw) => { if (raw && raw.trim()) void forward(raw); };

function startTcpListen() {
  const server = net.createServer((socket) => {
    const who = `${socket.remoteAddress}:${socket.remotePort}`;
    log(`↔ اتصل جهاز: ${who}`);
    const reader = makeReader(onMessage, (b) => socket.write(b));
    socket.on("data", (d) => reader.feed(d));
    socket.on("close", () => { reader.end(); log(`× انفصل: ${who}`); });
    socket.on("error", (e) => log(`! خطأ اتصال ${who}:`, e.message));
  });
  server.on("error", (e) => { console.error("✗ تعذّر فتح المنفذ:", e.message); process.exit(1); });
  server.listen(cfg.port, cfg.host, () => {
    log(`▶ المُستقبِل «${cfg.device}» يستمع على ${cfg.host}:${cfg.port} (${cfg.framing}).`);
    log(`  بإعدادات الجهاز (LIS/Host) حط عنوان هذا الحاسوب والمنفذ ${cfg.port}.`);
  });
}

function startTcpConnect() {
  const connect = () => {
    const socket = net.connect(cfg.port, cfg.host, () => log(`▶ اتصلنا بالجهاز ${cfg.host}:${cfg.port} (${cfg.framing}).`));
    const reader = makeReader(onMessage, (b) => socket.write(b));
    socket.on("data", (d) => reader.feed(d));
    socket.on("close", () => { reader.end(); log("× انقطع الاتصال — إعادة المحاولة بعد ٥ ثوان…"); setTimeout(connect, 5000); });
    socket.on("error", (e) => log("! خطأ:", e.message));
  };
  connect();
}

async function startSerial() {
  let SerialPort;
  try { ({ SerialPort } = await import("serialport")); }
  catch {
    console.error("✗ وضع السريال يحتاج مكتبة serialport. ثبّتها بـ:  npm i serialport");
    console.error("  أو استخدم وضع الشبكة (tcp-listen) — لا يحتاج أي تثبيت.");
    process.exit(1);
  }
  if (!cfg.serialPath) { console.error("✗ حدّد serialPath (مثال: COM3 أو /dev/ttyUSB0)."); process.exit(1); }
  const port = new SerialPort({ path: cfg.serialPath, baudRate: cfg.baudRate });
  const reader = makeReader(onMessage, (b) => port.write(b));
  port.on("open", () => log(`▶ المنفذ التسلسلي ${cfg.serialPath} @ ${cfg.baudRate} (${cfg.framing}).`));
  port.on("data", (d) => reader.feed(d));
  port.on("close", () => reader.end());
  port.on("error", (e) => { console.error("✗ خطأ منفذ تسلسلي:", e.message); process.exit(1); });
}

log(`doctorVet lab-bridge — الوضع: ${cfg.mode}`);
if (cfg.mode === "tcp-listen") startTcpListen();
else if (cfg.mode === "tcp-connect") startTcpConnect();
else if (cfg.mode === "serial") void startSerial();
else { console.error(`✗ وضع غير معروف: ${cfg.mode} (استخدم tcp-listen | tcp-connect | serial)`); process.exit(1); }

process.on("SIGINT", () => { log("إيقاف المُستقبِل."); process.exit(0); });
