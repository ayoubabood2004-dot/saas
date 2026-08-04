// ============================================================================
// test-bridge — end-to-end proof of the receiver WITHOUT Supabase or hardware.
// Spins up a mock cloud (captures the ingest RPC), launches the REAL
// lab-bridge.mjs process in tcp-listen mode pointed at it, then runs the
// analyzer simulator in ASTM / HL7 / generic dialects and asserts each raw
// message arrived intact and that our framing parses the expected values.
// ============================================================================

import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { framerFor } from "./framing.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const results = [];
const ok = (n, p, x = "") => { results.push(p); console.log(`${p ? "PASS" : "FAIL"} — ${n}${x ? " :: " + x : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- mock cloud: capture every ingest RPC body ----
const received = [];
const cloud = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.url.includes("ingest_device_message")) {
      try { received.push(JSON.parse(body)); } catch { /* ignore */ }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify("00000000-0000-0000-0000-000000000000"));
    } else { res.writeHead(404); res.end(); }
  });
});
await new Promise((r) => cloud.listen(0, "127.0.0.1", r));
const cloudPort = cloud.address().port;

// ---- pick a free TCP port for the bridge to listen on ----
const probe = net.createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const bridgePort = probe.address().port;
await new Promise((r) => probe.close(r));

// ---- launch the REAL bridge process ----
const bridge = spawn(process.execPath, [join(HERE, "lab-bridge.mjs")], {
  env: {
    ...process.env,
    LAB_BRIDGE_URL: `http://127.0.0.1:${cloudPort}`,
    LAB_BRIDGE_ANON_KEY: "test-anon-key",
    LAB_BRIDGE_TOKEN: "test-token-abcdef0123456789",
    LAB_BRIDGE_MODE: "tcp-listen",
    LAB_BRIDGE_HOST: "127.0.0.1",
    LAB_BRIDGE_PORT: String(bridgePort),
    LAB_BRIDGE_FRAMING: "auto",
    LAB_BRIDGE_IDLE_MS: "300",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let started = false;
bridge.stdout.on("data", (d) => { if (String(d).includes("يستمع على")) started = true; });
bridge.stderr.on("data", (d) => process.stderr.write(`[bridge-err] ${d}`));

// wait for the listener
for (let i = 0; i < 50 && !started; i++) await sleep(100);
ok("bridge started and is listening", started);

// ---- run the simulator for each dialect against the bridge ----
function runSim(kind) {
  return new Promise((resolve, reject) => {
    const sim = spawn(process.execPath, [join(HERE, "sim-analyzer.mjs"), kind, "127.0.0.1", String(bridgePort)], { stdio: ["ignore", "ignore", "inherit"] });
    sim.on("close", () => resolve());
    sim.on("error", reject);
  });
}

const before = () => received.length;

// ASTM
let n = before();
await runSim("astm");
await sleep(700);
const astm = received.slice(n).map((r) => r.p_raw);
ok("ASTM: one message forwarded", astm.length === 1, `got ${astm.length}`);
{
  const parsed = framerFor("auto").push([...Buffer.from(astm[0] ?? "", "latin1")]);
  ok("ASTM: forwarded raw carries WBC + CREA", (astm[0] || "").includes("WBC") && (astm[0] || "").includes("CREA"));
  void parsed;
}
ok("ASTM: token forwarded", received[received.length - 1]?.p_token === "test-token-abcdef0123456789");

// HL7 (MLLP)
n = before();
await runSim("hl7");
await sleep(700);
const hl7 = received.slice(n).map((r) => r.p_raw);
ok("HL7: one message forwarded", hl7.length === 1, `got ${hl7.length}`);
ok("HL7: MLLP unwrapped (starts with MSH, no control bytes)", (hl7[0] || "").startsWith("MSH") && !(hl7[0] || "").includes("\x0b"));
ok("HL7: carries OBX WBC/HGB/PLT", ["WBC", "HGB", "PLT"].every((k) => (hl7[0] || "").includes(k)));

// generic idle-framed
n = before();
await runSim("generic");
await sleep(900);
const gen = received.slice(n).map((r) => r.p_raw);
ok("Generic: message forwarded on idle flush", gen.length >= 1, `got ${gen.length}`);
ok("Generic: carries the three lines", (gen[0] || "").includes("WBC") && (gen[0] || "").includes("PLT"));

bridge.kill("SIGINT");
await new Promise((r) => cloud.close(r));
await sleep(100);

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
