#!/usr/bin/env node
// ============================================================================
// lab-bridge — the small "receiver" that carries lab analyzers' results to
// doctorVet over the network. Run it on any computer near the analyzers; it
// reads each machine (TCP or serial), frames every complete message, and
// forwards it to the clinic's cloud inbox using that device's token.
//
//   ★ ONE box, MANY analyzers: a clinic with a CBC + biochemistry (+ more)
//     lists them all under `devices` in the config — this single process opens
//     a reader per machine, each with its own token so results stay labelled.
//
//   Zero dependencies for TCP modes (Node 18+ built-ins only).
//   Serial mode uses the optional `serialport` package (npm i serialport).
//
// Config: lab-bridge.config.json beside this file (or $LAB_BRIDGE_CONFIG), or
// single-device environment variables (LAB_BRIDGE_URL/ANON_KEY/TOKEN/MODE/…).
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import net from "node:net";
import { framerFor, ackBytesFor } from "./framing.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (...a) => console.log(`[${ts()}]`, ...a);

function loadConfig() {
  let file = {};
  const path = process.env.LAB_BRIDGE_CONFIG || join(HERE, "lab-bridge.config.json");
  try { file = JSON.parse(readFileSync(path, "utf8")); } catch { /* fall back to env */ }
  const e = process.env;
  const url = e.LAB_BRIDGE_URL || file.url;
  const anonKey = e.LAB_BRIDGE_ANON_KEY || file.anonKey;
  if (!url || !anonKey) {
    console.error("✗ ناقص إعداد: url + anonKey مطلوبة. حمّل ملف الإعداد من إعدادات السستم (ربط أجهزة المختبر).");
    process.exit(1);
  }

  // Multi-device (`devices` array) OR single-device (flat/env) — normalise to a list.
  let devices = Array.isArray(file.devices) && file.devices.length ? file.devices : null;
  if (!devices) {
    devices = [{
      name: e.LAB_BRIDGE_DEVICE || file.device || "جهاز المختبر",
      token: e.LAB_BRIDGE_TOKEN || file.token,
      mode: e.LAB_BRIDGE_MODE || file.mode,
      host: e.LAB_BRIDGE_HOST || file.host,
      port: e.LAB_BRIDGE_PORT || file.port,
      framing: e.LAB_BRIDGE_FRAMING || file.framing,
      serialPath: e.LAB_BRIDGE_SERIAL_PATH || file.serialPath,
      baudRate: e.LAB_BRIDGE_BAUD || file.baudRate,
      idleMs: e.LAB_BRIDGE_IDLE_MS || file.idleMs,
    }];
  }
  devices = devices.map((d, i) => ({
    name: d.name || `جهاز ${i + 1}`,
    token: d.token,
    mode: d.mode || "tcp-listen",
    host: d.host || "0.0.0.0",
    port: Number(d.port || 9100 + i),
    framing: d.framing || "auto",
    serialPath: d.serialPath,
    baudRate: Number(d.baudRate || 9600),
    idleMs: Number(d.idleMs || 1500),
  }));
  const bad = devices.find((d) => !d.token || String(d.token).length < 16);
  if (bad) { console.error(`✗ جهاز «${bad.name}» بلا رمز صالح. حمّل ملف الإعداد من جديد.`); process.exit(1); }
  // Two tcp-listen devices can't share a port.
  const ports = devices.filter((d) => d.mode !== "serial").map((d) => d.port);
  if (new Set(ports).size !== ports.length) { console.error("✗ منفذان متطابقان — أعطِ كل جهاز شبكي منفذاً مختلفاً (9100, 9101, …)."); process.exit(1); }
  return { url, anonKey, devices };
}

const cfg = loadConfig();

// ---- forward one complete message to the cloud, with THIS device's token ----
async function forward(dev, raw) {
  const body = JSON.stringify({ p_token: dev.token, p_raw: raw });
  const endpoint = cfg.url.replace(/\/+$/, "") + "/rest/v1/rpc/ingest_device_message";
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
      body,
    });
    if (!res.ok) { log(`✗ [${dev.name}] رفض السحابة (${res.status}):`, (await res.text()).slice(0, 160)); return; }
    log(`✓ [${dev.name}] أُرسلت رسالة (${raw.length} حرف) لصندوق المختبر.`);
  } catch (err) {
    log(`✗ [${dev.name}] تعذّر الاتصال بالسحابة — سنعيد المحاولة عند الرسالة التالية:`, err.message);
  }
}

// ---- per-connection reader: frame bytes, ACK ASTM control bytes, idle-flush ----
function makeReader(dev, writeBack) {
  const framer = framerFor(dev.framing);
  const onMsg = (raw) => { if (raw && raw.trim()) void forward(dev, raw); };
  let idle;
  const arm = () => { clearTimeout(idle); idle = setTimeout(() => { for (const f of framer.flush()) onMsg(f); }, dev.idleMs); };
  return {
    feed(chunk) {
      const ack = ackBytesFor(chunk);
      if (ack && writeBack) { try { writeBack(ack); } catch { /* best effort */ } }
      for (const f of framer.push(chunk)) onMsg(f);
      arm();
    },
    end() { clearTimeout(idle); for (const f of framer.flush()) onMsg(f); },
  };
}

function startTcpListen(dev) {
  const server = net.createServer((socket) => {
    const who = `${socket.remoteAddress}:${socket.remotePort}`;
    log(`↔ [${dev.name}] اتصل جهاز: ${who}`);
    const reader = makeReader(dev, (b) => socket.write(b));
    socket.on("data", (d) => reader.feed(d));
    socket.on("close", () => { reader.end(); log(`× [${dev.name}] انفصل: ${who}`); });
    socket.on("error", (e) => log(`! [${dev.name}] خطأ ${who}:`, e.message));
  });
  server.on("error", (e) => { console.error(`✗ [${dev.name}] تعذّر فتح المنفذ ${dev.port}:`, e.message); process.exit(1); });
  server.listen(dev.port, dev.host, () => {
    log(`▶ [${dev.name}] يستمع على ${dev.host}:${dev.port} (${dev.framing}). وجّه الجهاز لعنوان هذا الحاسوب والمنفذ ${dev.port}.`);
  });
}

function startTcpConnect(dev) {
  const connect = () => {
    const socket = net.connect(dev.port, dev.host, () => log(`▶ [${dev.name}] اتصلنا بالجهاز ${dev.host}:${dev.port} (${dev.framing}).`));
    const reader = makeReader(dev, (b) => socket.write(b));
    socket.on("data", (d) => reader.feed(d));
    socket.on("close", () => { reader.end(); log(`× [${dev.name}] انقطع — إعادة المحاولة بعد ٥ ثوان…`); setTimeout(connect, 5000); });
    socket.on("error", (e) => log(`! [${dev.name}] خطأ:`, e.message));
  };
  connect();
}

async function startSerial(dev) {
  let SerialPort;
  try { ({ SerialPort } = await import("serialport")); }
  catch { console.error(`✗ [${dev.name}] وضع السريال يحتاج مكتبة serialport (npm i serialport) — أو استخدم وضع الشبكة.`); return; }
  if (!dev.serialPath) { console.error(`✗ [${dev.name}] حدّد serialPath (مثال COM3 أو /dev/ttyUSB0).`); return; }
  const port = new SerialPort({ path: dev.serialPath, baudRate: dev.baudRate });
  const reader = makeReader(dev, (b) => port.write(b));
  port.on("open", () => log(`▶ [${dev.name}] المنفذ التسلسلي ${dev.serialPath} @ ${dev.baudRate} (${dev.framing}).`));
  port.on("data", (d) => reader.feed(d));
  port.on("close", () => reader.end());
  port.on("error", (e) => console.error(`✗ [${dev.name}] خطأ منفذ تسلسلي:`, e.message));
}

log(`doctorVet lab-bridge — ${cfg.devices.length} جهاز مربوط`);
for (const dev of cfg.devices) {
  if (dev.mode === "tcp-listen") startTcpListen(dev);
  else if (dev.mode === "tcp-connect") startTcpConnect(dev);
  else if (dev.mode === "serial") void startSerial(dev);
  else console.error(`✗ [${dev.name}] وضع غير معروف: ${dev.mode} (استخدم tcp-listen | tcp-connect | serial)`);
}

process.on("SIGINT", () => { log("إيقاف المُستقبِل."); process.exit(0); });
