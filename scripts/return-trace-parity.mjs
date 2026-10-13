/* ============================================================================
 * أثرُ المرتجع — **نصُّ الخادم ونصُّ المرآة من نفس الحمولة** (returnTrace.ts ↔ retail_return 0136).
 *
 * صفحةُ /outbox تحكم «وصل هذا المرتجعُ الخادمَ؟» بمطابقة سطور «مرتجع» **نصّاً كاملاً**: الاسمُ بعد
 * btrim، و« × الكمية» بلا أصفار حين ≠ ١، والزبونُ والملاحظة؛ والمبلغُ round(round3(كمية) ×
 * round2(سعر)، ٢). مرآةٌ تفترق عن الخادم بحرف تقول «ما لكينا» عن مرتجعٍ وصل — فيُرفع مرّتين.
 * فالحزمةُ (run.sh) تنادي retail_return الحقيقيّة بكلّ حالةٍ هنا وتقارن ما كتبته بما تتوقّعه المرآة.
 *
 * والدالّةُ تُحمَّل **من المصدر بـesbuild لا نسخةً منها**.
 *
 *   node scripts/return-trace-parity.mjs <outDir>   ⇒ <outDir>/return-trace.sql
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = process.argv[2];
if (!out) { console.error("usage: node scripts/return-trace-parity.mjs <outDir>"); process.exit(2); }

const built = await esbuild.build({ entryPoints: ["src/lib/returnTrace.ts"], bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent" });
const dir = mkdtempSync(join(tmpdir(), "rtp-"));
const f = join(dir, "m.mjs");
writeFileSync(f, built.outputFiles[0].text);
const T = await import(pathToFileURL(f).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

/** حالاتٌ تمسّ كلَّ فرعٍ بنصّ الخادم وكلَّ تقريب. */
const CASES = [
  { items: [{ name: "درونتال", qty: -2, unit_price: 5000 }], meta: { customer_name: "حسن" } },
  { items: [{ name: "  طوق  ", qty: 1, unit_price: 2500 }], meta: {} },
  { items: [{ name: "", qty: -1, unit_price: 750 }], meta: { note: "كسر" } },
  { items: [{ name: "علف", qty: -1.5, unit_price: 1000.005 }], meta: { customer_name: "   ", note: " بدون " } },
  { items: [{ name: "شامبو", qty: "-3", unit_price: "1250.5" }], meta: { customer_name: "أبو علي", note: "(مفتوح)" } },
  { items: [{ name: "ذرّة", qty: -0.0004, unit_price: 9 }, { name: "y", qty: -1, unit_price: 100 }], meta: {} },
  { items: [{ name: "z", qty: -1.0005, unit_price: 333.335 }], meta: {} },
  { items: [{ name: "مجاني", qty: -10, unit_price: 0 }, { name: "p", qty: -2, unit_price: 0.004 }, { name: "q", qty: -3, unit_price: 2 }], meta: {} },
  { items: [{ name: "big", qty: -100, unit_price: 12345.67 }], meta: { customer_name: "شركة الندى" } },
  { items: [{ name: " نصف كيلو ", qty: -2.5, unit_price: 4000 }], meta: {} },
  { items: [{ name: "\tتاب ", qty: -1, unit_price: 0.015 }], meta: { note: "x" } },
  { items: [{ name: "واحد", qty: "1.000", unit_price: 10 }, { name: "تقريباً واحد", qty: -0.9995, unit_price: 10 }], meta: {} },
  { items: [{ name: 123, qty: -12.34, unit_price: 0.5 }], meta: { customer_name: "  سارة  ", note: "" } },
  { items: [{ name: "درونتال", qty: -2, unit_price: 5000 }, { name: "درونتال", qty: -2, unit_price: 5000 }], meta: { customer_name: "حسن" } },
  /* أنصافُ فلسٍ بمبالغ كبيرة: الفاصلةُ العائمة كانت تقرّبها للأسفل والخادمُ للأعلى (تدقيقٌ عدائيّ ١٣/١٠). */
  { items: [{ name: "علف بالكيلو", qty: -16.141, unit_price: 4375 }], meta: {} },
  { items: [{ name: "علف ٢", qty: -17.141, unit_price: 3835 }], meta: {} },
  { items: [{ name: "لقاح", qty: -4.5, unit_price: 16729.67 }], meta: { customer_name: "مزرعة" } },
  { items: [{ name: "أُس", qty: "-2e0", unit_price: "1.5e3" }, { name: "صغيرٌ جدّاً", qty: -1e-7, unit_price: 5 }], meta: {} },
  { items: [{ name: "كبير", qty: -99999.999, unit_price: 99999.99 }, { name: "بمسافات", qty: " -2.5 ", unit_price: " 333.333 " }], meta: {} },
];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
let sql = `drop table if exists _rtp_expected; drop table if exists _rtp_out;
create table _rtp_expected (case_no int, description text, amount numeric);
create table _rtp_out (case_no int, id uuid, description text, amount numeric);
`;
let rows = 0;
CASES.forEach((c, i) => {
  for (const l of T.expectedReturnRows({ p_items: c.items, p_meta: c.meta })) {
    sql += `insert into _rtp_expected values (${i}, ${q(l.desc)}, ${l.amount});\n`;
    rows++;
  }
});
/* كلُّ حالةٍ بنداءٍ حقيقيّ باسم العيادة :clinic، وما كتبته يُلتقط بمعرّفاته (ليُنظَّف بعدها). */
sql += `create or replace function _rtp_run(p_clinic uuid) returns void language plpgsql as $fn$
declare v_before uuid[];
begin
  perform set_config('request.jwt.claim.sub', p_clinic::text, true);
`;
CASES.forEach((c, i) => {
  const meta = { ...c.meta, client_ref: `RTP-${i}` };
  sql += `  select coalesce(array_agg(id), '{}') into v_before from expenses where clinic_id = p_clinic;
  perform retail_return(${q(JSON.stringify(c.items))}::jsonb, ${q(JSON.stringify(meta))}::jsonb);
  insert into _rtp_out select ${i}, id, description, amount from expenses where clinic_id = p_clinic and category = 'مرتجع' and not (id = any(v_before));
`;
});
sql += `end $fn$;
`;
writeFileSync(join(out, "return-trace.sql"), sql);
console.log(`✓ return-trace-parity: ${CASES.length} حالة، ${rows} سطراً متوقَّعاً`);
