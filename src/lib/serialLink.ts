// ============================================================================
// serialLink — read a lab analyzer straight from the browser over RS-232 (via
// a USB-to-serial adapter) using the Web Serial API. Zero install: the clinic
// PC's Chrome/Edge talks to the analyzer's DB9/USB port directly.
//
// The analyzer streams bytes continuously; a message only makes sense once a
// COMPLETE frame has arrived. We buffer bytes and hand them to a pluggable
// framer that knows the wire framing (MLLP for HL7, STX/ETX+checksum for ASTM,
// or an idle-gap fallback for plain line protocols). Each complete frame is
// emitted as a string for labLink to detect + parse.
//
// Browser reality: Web Serial is Chrome/Edge desktop only (not Safari/iOS/
// Firefox). serialSupported() gates the UI; unsupported clinics use the camera
// OCR path or the LAN bridge instead.
// ============================================================================

/** True when this browser can talk to a serial device directly. */
export function serialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export interface SerialOpenOptions {
  baudRate?: number;   // analyzers commonly 9600 (Mindray/Rayto) or 19200
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
}

/** A framer turns a growing byte buffer into zero-or-more complete text frames.
 *  It MUTATES nothing external — it returns the frames it recognised and the
 *  bytes still pending (an incomplete tail kept for the next chunk). */
export interface Framer {
  /** Feed newly-read bytes; get back any complete frames + the leftover tail. */
  push(chunk: Uint8Array): { frames: string[]; };
  /** Flush whatever is buffered (called on idle timeout / disconnect). */
  flush(): string[];
}

/* ------------------------------- Framers ------------------------------- */
const decoder = () => new TextDecoder("latin1"); // analyzers are ASCII/latin1; avoids UTF-8 mangling of control bytes

/** MLLP (HL7 over TCP/serial): 0x0B <message> 0x1C 0x0D. */
export function mllpFramer(): Framer {
  let buf: number[] = [];
  const START = 0x0b, END1 = 0x1c, END2 = 0x0d;
  return {
    push(chunk) {
      const frames: string[] = [];
      for (const b of chunk) buf.push(b);
      // Extract every complete START..END1 END2 window.
      for (;;) {
        const s = buf.indexOf(START);
        if (s < 0) { buf = []; break; }           // no start yet — drop noise
        const e = buf.indexOf(END1, s + 1);
        if (e < 0 || buf[e + 1] !== END2) { if (s > 0) buf = buf.slice(s); break; }
        frames.push(decoder().decode(new Uint8Array(buf.slice(s + 1, e))));
        buf = buf.slice(e + 2);
      }
      return { frames };
    },
    flush() { buf = []; return []; },
  };
}

/** ASTM E1381 low-level: <STX> frame# text <ETX|ETB> chk chk <CR><LF>. We keep
 *  the payload between STX and ETX/ETB (the high-level H/P/O/R/L records) and
 *  concatenate multi-frame transmissions until the LIS session's <EOT>. */
export function astmFramer(): Framer {
  let buf: number[] = [];
  let assembled: string[] = [];
  const STX = 0x02, ETX = 0x03, ETB = 0x17, EOT = 0x04, CR = 0x0d, LF = 0x0a;
  const takeFrame = () => {
    const s = buf.indexOf(STX);
    if (s < 0) return false;
    // find ETX or ETB after STX
    let term = -1, kind = ETX;
    for (let i = s + 1; i < buf.length; i++) { if (buf[i] === ETX || buf[i] === ETB) { term = i; kind = buf[i]; break; } }
    if (term < 0) { if (s > 0) buf = buf.slice(s); return false; }
    // need 2 checksum chars + CRLF after the terminator
    if (term + 3 >= buf.length) { if (s > 0) buf = buf.slice(s); return false; }
    // payload = bytes between STX+2 (skip the single-digit frame number) and terminator
    const payload = decoder().decode(new Uint8Array(buf.slice(s + 2, term)));
    assembled.push(payload);
    // consume through CRLF (term + checksum(2) + CR + LF)
    let end = term + 3;
    while (end < buf.length && (buf[end] === CR || buf[end] === LF)) end++;
    buf = buf.slice(end);
    void kind; void CR; void LF;
    return true;
  };
  return {
    push(chunk) {
      const frames: string[] = [];
      for (const b of chunk) buf.push(b);
      // If an EOT is seen, the transmission is complete → emit assembled records.
      for (;;) {
        while (takeFrame()) { /* drain complete frames */ }
        const eot = buf.indexOf(EOT);
        if (eot >= 0) {
          if (assembled.length) frames.push(assembled.join("\r"));
          assembled = [];
          buf = buf.slice(eot + 1);
          continue;
        }
        break;
      }
      return { frames };
    },
    flush() { const out = assembled.length ? [assembled.join("\r")] : []; assembled = []; buf = []; return out; },
  };
}

/** Idle-gap framer: plain analyzers that just print lines then pause. Anything
 *  buffered is emitted when no bytes arrive for `idleMs` (driven by the reader
 *  loop's flush call). Good universal fallback when framing is unknown. */
export function idleFramer(): Framer {
  let buf = "";
  return {
    push(chunk) { buf += decoder().decode(chunk); return { frames: [] }; },
    flush() { const out = buf.trim() ? [buf] : []; buf = ""; return out; },
  };
}

/** Pick a framer by name; "auto" starts idle and upgrades if it sees framing bytes. */
export function framerFor(mode: "hl7" | "astm" | "generic" | "auto"): Framer {
  if (mode === "hl7") return mllpFramer();
  if (mode === "astm") return astmFramer();
  if (mode === "generic") return idleFramer();
  return autoFramer();
}

/** Auto framer: sniffs the first bytes — MLLP start (0x0B) → HL7, STX (0x02) →
 *  ASTM, else idle-gap. Locks onto the first recognised framing. */
export function autoFramer(): Framer {
  let inner: Framer | null = null;
  let sniff: number[] = [];
  return {
    push(chunk) {
      if (!inner) {
        for (const b of chunk) sniff.push(b);
        if (sniff.includes(0x0b)) inner = mllpFramer();
        else if (sniff.includes(0x02)) inner = astmFramer();
        else if (sniff.length > 256) inner = idleFramer(); // enough non-framed bytes → plain
        if (inner) { const seed = new Uint8Array(sniff); sniff = []; return inner.push(seed); }
        return { frames: [] };
      }
      return inner.push(chunk);
    },
    flush() { if (inner) return inner.flush(); const out = sniff.length ? [decoder().decode(new Uint8Array(sniff))] : []; sniff = []; return out; },
  };
}

/* ----------------------------- Session ----------------------------- */
export interface SerialSession {
  close: () => Promise<void>;
  portLabel: string;
}

interface SerialHooks {
  onFrame: (raw: string) => void;
  onStatus?: (s: "reading" | "closed" | "error", detail?: string) => void;
  framing?: "hl7" | "astm" | "generic" | "auto";
  idleMs?: number;
}

// Minimal Web Serial typings (avoid depending on lib.dom's optional serial defs).
interface WSerialPort {
  open(o: SerialOpenOptions): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  getInfo?: () => { usbVendorId?: number; usbProductId?: number };
}
interface WSerial { requestPort(): Promise<WSerialPort>; }

/** Ask the user to pick a serial port (a user gesture MUST wrap this call),
 *  open it, and stream framed messages to onFrame until close(). */
export async function connectSerial(opts: SerialOpenOptions, hooks: SerialHooks): Promise<SerialSession> {
  if (!serialSupported()) throw new Error("Web Serial not supported in this browser");
  const serial = (navigator as unknown as { serial: WSerial }).serial;
  const port = await serial.requestPort(); // requires a user gesture upstream
  await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", ...opts });

  const framer = framerFor(hooks.framing ?? "auto");
  const idleMs = hooks.idleMs ?? 1200;
  let closed = false;

  // ASTM E1381 handshake: real analyzers (Mindray/Rayto…) send ENQ, expect the
  // host to ACK, then send frames each needing an ACK, then EOT. Without ACKs
  // the machine aborts the transfer. We reply ACK (0x06) to every ENQ (0x05)
  // and after every frame terminator (ETX 0x03 / ETB 0x17). Best-effort: if the
  // port isn't writable it's simply skipped, and reading still works.
  const ENQ = 0x05, ACK = 0x06, ETX = 0x03, ETB = 0x17;
  let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  try {
    const w = (port as unknown as { writable?: WritableStream<Uint8Array> }).writable;
    if (w) writer = w.getWriter();
  } catch { /* not writable — read-only device */ }
  const sendAck = () => { if (writer) writer.write(new Uint8Array([ACK])).catch(() => { /* ignore */ }); };
  const ackForControlBytes = (chunk: Uint8Array) => {
    if (!writer) return;
    for (const b of chunk) if (b === ENQ || b === ETX || b === ETB) sendAck();
  };
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { for (const f of framer.flush()) hooks.onFrame(f); }, idleMs);
  };

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const loop = async () => {
    hooks.onStatus?.("reading");
    try {
      // ONE reader for the port's lifetime. `done` means the stream closed
      // (device disconnected / port closed) — we stop, we do NOT re-acquire a
      // reader on a dead stream (that would spin forever).
      if (!port.readable) return;
      reader = port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;                     // stream ended → device gone
          if (value && value.length) {
            ackForControlBytes(value);          // keep the ASTM ENQ/ACK handshake alive
            const { frames } = framer.push(value);
            for (const f of frames) hooks.onFrame(f);
            armIdle();                          // any bytes reset the idle-flush timer
          }
        }
      } finally { try { reader.releaseLock(); } catch { /* already released */ } reader = undefined; }
      if (!closed) { closed = true; hooks.onStatus?.("closed"); } // normal end-of-stream
    } catch (e) {
      if (!closed) hooks.onStatus?.("error", e instanceof Error ? e.message : String(e));
    }
  };
  void loop();

  const info = port.getInfo?.();
  const portLabel = info?.usbVendorId ? `USB ${info.usbVendorId.toString(16)}:${(info.usbProductId ?? 0).toString(16)}` : "منفذ تسلسلي";

  return {
    portLabel,
    close: async () => {
      closed = true;
      if (idleTimer) clearTimeout(idleTimer);
      try { await reader?.cancel(); } catch { /* already released */ }
      try { writer?.releaseLock(); } catch { /* already released */ }
      try { await port.close(); } catch { /* already closed */ }
      hooks.onStatus?.("closed");
    },
  };
}
