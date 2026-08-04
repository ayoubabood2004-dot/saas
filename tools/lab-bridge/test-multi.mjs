// ============================================================================
// test-multi — proof that ONE receiver box handles MANY analyzers at once.
// Writes a multi-device config (CBC on 9100 + Biochemistry on 9101), launches
// the REAL lab-bridge.mjs against a mock cloud, drives a simulator into each
// port, and asserts every message arrived under its OWN device token.
// ============================================================================

import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const results = [];
const ok = (n, p, x = "") => { results.push(p); console.log(`${p ? "PASS" : "FAIL"} — ${n}${x ? " :: " + x : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- mock cloud: record each ingest {token, raw} ----
const received = [];
const cloud = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c));
  req.on("end", () => {
    if (req.url.includes("ingest_device_message")) { try { received.push(JSON.parse(b)); } catch { /* ignore */ } res.writeHead(200); res.end('"ok"'); }
    else { res.writeHead(404); res.end(); }
  });
});
await new Promise((r) => cloud.listen(0, "127.0.0.1", r));
const cloudPort = cloud.address().port;

// ---- pick two free ports for the two analyzers ----
async function freePort() { const s = net.createServer(); await new Promise((r) => s.listen(0, "127.0.0.1", r)); const p = s.address().port; await new Promise((r) => s.close(r)); return p; }
const portCBC = await freePort();
const portChem = await freePort();

const TOK_CBC = "tok-cbc-0123456789abcdef";
const TOK_CHEM = "tok-chem-0123456789abcdef";
const cfgPath = join(HERE, ".test-multi.config.json");
writeFileSync(cfgPath, JSON.stringify({
  url: `http://127.0.0.1:${cloudPort}`, anonKey: "k",
  devices: [
    { name: "CBC", token: TOK_CBC, mode: "tcp-listen", host: "127.0.0.1", port: portCBC, framing: "auto", idleMs: 300 },
    { name: "Biochemistry", token: TOK_CHEM, mode: "tcp-listen", host: "127.0.0.1", port: portChem, framing: "auto", idleMs: 300 },
  ],
}));

const bridge = spawn(process.execPath, [join(HERE, "lab-bridge.mjs")], {
  env: { ...process.env, LAB_BRIDGE_CONFIG: cfgPath }, stdio: ["ignore", "pipe", "pipe"],
});
let listening = 0;
bridge.stdout.on("data", (d) => { const s = String(d); if (s.includes("يستمع على")) listening += (s.match(/يستمع على/g) || []).length; });
bridge.stderr.on("data", (d) => process.stderr.write(`[bridge-err] ${d}`));
for (let i = 0; i < 50 && listening < 2; i++) await sleep(100);
ok("both analyzers listening on one box", listening >= 2, `listening=${listening}`);

// ---- drive each analyzer ----
function send(port, bytes) {
  // The receiver keeps sockets open, so resolve on a timer (not on 'close') and
  // then hard-destroy — otherwise the half-open socket would hang the test.
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1", () => {
      s.write(Buffer.from(bytes));
      setTimeout(() => { try { s.destroy(); } catch { /* ignore */ } resolve(); }, 250);
    });
    s.on("error", () => resolve());
  });
}
const enc = (str) => [...Buffer.from(str, "latin1")];
// CBC via HL7 (MLLP)
const cbcMsg = ["MSH|^~\\&|BC|LAB|||1||ORU^R01|1|P|2.3", "OBX|1|NM|WBC||18.5|10^3/uL|6-17|H"].join("\r") + "\r";
await send(portCBC, [0x0b, ...enc(cbcMsg), 0x1c, 0x0d]);
// Biochemistry via ASTM (STX/ETX + EOT)
const chemRecs = "1" + ["H|\\^&|||Chem", "R|1|^^^GLU|320|mg/dL|70-110|H", "R|2|^^^CREA|5.5|mg/dL|0.5-1.8|H", "L|1|N"].join("\r");
await send(portChem, [0x02, ...enc(chemRecs), 0x03, ...enc("A5"), 0x0d, 0x0a, 0x04]);
await sleep(900);

const cbc = received.filter((r) => r.p_token === TOK_CBC);
const chem = received.filter((r) => r.p_token === TOK_CHEM);
ok("CBC message arrived under CBC token", cbc.length === 1 && cbc[0].p_raw.includes("WBC"), JSON.stringify(cbc.map((x) => x.p_raw.slice(0, 20))));
ok("Biochemistry message arrived under Biochem token", chem.length === 1 && chem[0].p_raw.includes("GLU") && chem[0].p_raw.includes("CREA"));
ok("tokens are NOT crossed", !cbc.some((r) => r.p_raw.includes("GLU")) && !chem.some((r) => r.p_raw.includes("WBC")));
ok("exactly two messages total", received.length === 2, `total=${received.length}`);

bridge.kill("SIGINT");
await new Promise((r) => cloud.close(r));
try { unlinkSync(cfgPath); } catch { /* ignore */ }
await sleep(100);
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
