// ============================================================================
// framing.mjs — turn a growing byte stream from a lab analyzer into complete
// text messages. Mirror of the browser's src/lib/serialLink.ts framers so the
// receiver agent and the app speak exactly the same wire dialects:
//   • MLLP  — HL7 over TCP/serial:  0x0B <message> 0x1C 0x0D
//   • ASTM  — E1381 low-level frames <STX>…<ETX|ETB>chkchk<CR><LF>, assembled
//             per E1394 session and emitted at <EOT>
//   • idle  — plain line printers: emit whatever buffered on an idle gap
//   • auto  — sniff the first bytes and lock onto MLLP / ASTM / idle
// Each complete message is handed to labLink (in the cloud + app) to parse.
// Zero dependencies — pure Node built-ins.
// ============================================================================

const dec = (arr) => Buffer.from(arr).toString("latin1"); // analyzers are ASCII/latin1

export function mllpFramer() {
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

export function astmFramer() {
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
    assembled.push(dec(buf.slice(s + 2, term))); // skip the single-digit frame number
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

export function idleFramer() {
  let buf = "";
  return {
    push(chunk) { buf += dec(chunk); return []; },
    flush() { const out = buf.trim() ? [buf] : []; buf = ""; return out; },
  };
}

export function autoFramer() {
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

export function framerFor(mode) {
  if (mode === "hl7" || mode === "mllp") return mllpFramer();
  if (mode === "astm") return astmFramer();
  if (mode === "generic" || mode === "idle") return idleFramer();
  return autoFramer();
}

// ASTM E1381 handshake: reply ACK (0x06) to ENQ (0x05) and after every frame
// terminator (ETX 0x03 / ETB 0x17) — real analyzers abort the transfer without
// it. Returns the ACK bytes to write back for a given inbound chunk (or null).
const ENQ = 0x05, ACK = 0x06, ETX = 0x03, ETB = 0x17;
export function ackBytesFor(chunk) {
  let n = 0;
  for (const b of chunk) if (b === ENQ || b === ETX || b === ETB) n++;
  return n ? Buffer.alloc(n, ACK) : null;
}
