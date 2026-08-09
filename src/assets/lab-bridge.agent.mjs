#!/usr/bin/env node
// ============================================================================
// lab-bridge — المُستقبِل الصغير لنظام doctorVet (نسخة ذاتية الاكتفاء).
//
// يشتغل على أي حاسوب قرب أجهزة التحاليل: يقرأ كل جهاز (شبكة/سريال)، يفهم لغته
// تلقائياً (HL7 / ASTM / نص)، ويرسل كل نتيجة كاملة لصندوق المختبر بالسحابة
// مستخدماً رمز ذاك الجهاز السري. بلا كتابة، بلا واير طويل.
//
//   ★ صندوق واحد لعدة أجهزة: عيادة عندها CBC + كيمياء (وغيرهم) تحطهم كلهم
//     ضمن devices بملف الإعداد — هذا البرنامج الواحد يفتح قارئاً لكل جهاز،
//     كل واحد برمزه حتى تبقى النتائج مُعرّفة بمصدرها.
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
  /**
   * اختيار النمط لا يجوز أن يُحسم ببايت شارد. أجهزة كثيرة (مثل Mindray BC
   * على الشبكة) ترسل «نبضة» بايت واحد كل ثوانٍ لتقول «أنا حي» — لو قفلنا
   * النمط عليها لظلّ المستقبل ينتظر تغليفاً لا يجيء، وتُرمى النتيجة الحقيقية
   * بصمت. لذلك نطلب محتوى كافياً بعد العلامة قبل الحسم.
   */
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
        if (sniff.length > 4096) sniff = sniff.slice(-4096); // لا تتضخم بلا حد
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
const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (...a) => console.log(`[${ts()}]`, ...a);

function loadConfig() {
  let file = {};
  const path = process.env.LAB_BRIDGE_CONFIG || join(HERE, "lab-bridge.config.json");
  try { file = JSON.parse(readFileSync(path, "utf8")); }
  catch { /* fall back to env */ }
  const e = process.env;
  const url = e.LAB_BRIDGE_URL || file.url;
  const anonKey = e.LAB_BRIDGE_ANON_KEY || file.anonKey;
  if (!url || !anonKey) {
    console.error("✗ ناقص إعداد: url + anonKey مطلوبة. حمّل ملف الإعداد من إعدادات السستم (ربط أجهزة المختبر).");
    process.exit(1);
  }
  // عدة أجهزة (مصفوفة devices) أو جهاز واحد (حقول مسطّحة/بيئة) — نوحّدها كقائمة.
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
    // "debug": true بملف الإعداد يطبع كل دفعة واصلة (حجمها وأول بايتاتها) —
    // يختصر تشخيص أي جهاز جديد من ساعات إلى دقائق.
    debug: !!(d.debug ?? file.debug),
  }));
  const bad = devices.find((d) => !d.token || String(d.token).length < 16);
  if (bad) { console.error(`✗ جهاز «${bad.name}» بلا رمز صالح. حمّل ملف الإعداد من جديد.`); process.exit(1); }
  const ports = devices.filter((d) => d.mode !== "serial").map((d) => d.port);
  if (new Set(ports).size !== ports.length) { console.error("✗ منفذان متطابقان — أعطِ كل جهاز شبكي منفذاً مختلفاً (9100, 9101, …)."); process.exit(1); }
  return { url, anonKey, devices };
}

const cfg = loadConfig();

/* =============================== الإرسال للسحابة =============================== */
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

/** أقل حجم يُعتبر «نتيجة حقيقية» بشبكة الأمان — أصغر منه نبضة أو ضجيج. */
const MIN_RAW_BYTES = 40;

function makeReader(dev, writeBack) {
  const framer = framerFor(dev.framing);
  let emitted = 0;
  let raw = []; // نسخة خام لكل ما وصل منذ آخر إرسال — شبكة الأمان
  const onMsg = (msg) => { if (msg && msg.trim()) { emitted++; void forward(dev, msg); } };
  let idle;
  /**
   * عند سكون الخط: أفرغ المُغلِّف. وإذا لم يخرج منه شيء رغم وصول بيانات
   * معتبرة، أرسل الخام كما هو بدل أن يضيع بصمت — المحرك السحابي يفهم
   * HL7/ASTM/نص، فالخام أفضل ألف مرة من لا شيء. هذا ما يمنع «الجهاز أرسل
   * ولا شيء وصل» نهائياً.
   */
  const settle = () => {
    const before = emitted;
    for (const f of framer.flush()) onMsg(f);
    if (emitted === before && raw.length >= MIN_RAW_BYTES) {
      log(`↯ [${dev.name}] بيانات بلا تغليف معروف (${raw.length} بايت) — نرسلها خاماً.`);
      onMsg(dec(raw));
    }
    raw = [];
  };
  const arm = () => { clearTimeout(idle); idle = setTimeout(settle, dev.idleMs); };
  return {
    feed(chunk) {
      const ack = ackBytesFor(chunk);
      if (ack && writeBack) { try { writeBack(ack); } catch { /* best effort */ } }
      for (const b of chunk) raw.push(b);
      if (dev.debug) log(`· [${dev.name}] وصل ${chunk.length} بايت: ${Buffer.from(chunk).subarray(0, 16).toString("hex")}`);
      for (const f of framer.push(chunk)) onMsg(f);
      arm();
    },
    end() { clearTimeout(idle); settle(); },
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
