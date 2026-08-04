#!/usr/bin/env node
// ============================================================================
// lab-bridge — the small "receiver" that carries a lab analyzer's results to
// doctorVet over the network. Run it on any computer near the analyzer; it
// reads the machine (TCP or serial), frames each complete message, and forwards
// it to the clinic's cloud inbox using the device token. No typing, no long
// cables — the analyzer can sit in another room and reach the receiver over LAN.
//
//   Zero dependencies for TCP modes (Node 18+ built-ins only).
//   Serial mode uses the optional `serialport` package (npm i serialport).
//
// Config: lab-bridge.config.json beside this file (downloaded from the app's
// Settings → «ربط أجهزة المختبر»), or environment variables:
//   LAB_BRIDGE_URL, LAB_BRIDGE_ANON_KEY, LAB_BRIDGE_TOKEN, LAB_BRIDGE_DEVICE,
//   LAB_BRIDGE_MODE (tcp-listen|tcp-connect|serial), LAB_BRIDGE_PORT,
//   LAB_BRIDGE_HOST, LAB_BRIDGE_FRAMING (auto|hl7|astm|generic),
//   LAB_BRIDGE_SERIAL_PATH, LAB_BRIDGE_BAUD
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import net from "node:net";
import { framerFor, ackBytesFor } from "./framing.mjs";

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

// ---- forward one complete message to the cloud (token-authed RPC) ----
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

// ---- shared per-connection reader: frame bytes, ACK ASTM, idle-flush ----
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

// ---- TCP listen: the analyzer (or its LIS host setting) sends here ----
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

// ---- TCP connect: the analyzer LISTENS, we dial out to it ----
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

// ---- Serial: USB/RS-232 straight from the analyzer (optional dependency) ----
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
