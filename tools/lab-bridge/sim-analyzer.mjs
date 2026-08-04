#!/usr/bin/env node
// ============================================================================
// sim-analyzer — pretend to be a lab machine so you can test the receiver end
// to end without the real hardware. It dials the receiver's TCP-listen port and
// streams a sample panel in the wire dialect you pick, honouring ASTM ACKs.
//
//   node sim-analyzer.mjs [astm|hl7|generic] [host] [port]
//   (defaults: astm 127.0.0.1 9100)
// ============================================================================

import net from "node:net";

const kind = process.argv[2] || "astm";
const host = process.argv[3] || "127.0.0.1";
const port = Number(process.argv[4] || 9100);

const STX = 0x02, ETX = 0x03, EOT = 0x04, ENQ = 0x05, CR = 0x0d, LF = 0x0a;
const b = (s) => Buffer.from(s, "latin1");

// ---- build a byte stream for each dialect ----
function astmStream() {
  const recs = [
    "H|\\^&|||Sim^Analyzer",
    "P|1||SIM001||حيوان محاكاة",
    "O|1|S1||^^^CBC",
    "R|1|^^^WBC|15.2|10*3/uL|6-17|H",
    "R|2|^^^HGB|11.0|g/dL|12-18|L",
    "R|3|^^^PLT|300|10*9/L|200-500|N",
    "R|4|^^^CREA|3.1|mg/dL|0.5-1.8|H",
    "L|1|N",
  ];
  // one framed data packet: <STX>1 <records joined by CR> <ETX> chk chk <CR><LF>
  const payload = "1" + recs.join("\r");
  return Buffer.concat([Buffer.from([ENQ]), Buffer.from([STX]), b(payload), Buffer.from([ETX]), b("A5"), Buffer.from([CR, LF]), Buffer.from([EOT])]);
}
function hl7Stream() {
  const msg = [
    "MSH|^~\\&|SIM|LAB|||20260804||ORU^R01|9|P|2.3",
    "PID|1||SIM001||حيوان محاكاة",
    "OBR|1||S1|CBC",
    "OBX|1|NM|WBC^White Blood Cells||15.2|10^3/uL|6-17|H",
    "OBX|2|NM|HGB^Hemoglobin||11.0|g/dL|12-18|L",
    "OBX|3|NM|PLT^Platelets||300|10^3/uL|200-500|N",
  ].join("\r") + "\r";
  return Buffer.concat([Buffer.from([0x0b]), b(msg), Buffer.from([0x1c, 0x0d])]); // MLLP
}
function genericStream() {
  return b("WBC 15.2 10^3/uL H\r\nHGB 11.0 g/dL L\r\nPLT 300 10^3/uL N\r\n");
}

const bytes = kind === "hl7" ? hl7Stream() : kind === "generic" ? genericStream() : astmStream();

const sock = net.connect(port, host, () => {
  console.log(`▶ محاكاة جهاز (${kind}) → ${host}:${port}`);
  // Stream in two chunks to exercise the framer's reassembly across reads.
  const mid = Math.floor(bytes.length / 2);
  sock.write(bytes.subarray(0, mid));
  setTimeout(() => sock.write(bytes.subarray(mid)), 60);
  setTimeout(() => sock.end(), 400);
});
sock.on("data", (d) => { if (d.includes(0x06)) console.log(`  ← استلمنا ACK (${d.length})`); });
sock.on("close", () => { console.log("× انتهت المحاكاة."); process.exit(0); });
sock.on("error", (e) => { console.error("✗", e.message); process.exit(1); });
