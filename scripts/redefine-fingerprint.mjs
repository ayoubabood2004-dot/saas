#!/usr/bin/env node
/* إعادةُ التعريف تُفحص بنصّها (0252–0255، 0259، 0260، 0261): كلُّ دالّةٍ قائمةٍ تُعاد كتابتُها (MANIFEST: اثنتان وعشرون دالّةً
 * باثنتين وثلاثين إعادة، لكلٍّ منها حارسُها بالهجرة) «نصَّ مصدرها حرفاً وفوقه أسطرٌ معلَّمة» — والانحرافُ
 * عن المصدر بلا علامةٍ هو ما أسقط 0241 (نسخةٌ قديمة دُهست بصمت).
 *
 * لكلّ سطرٍ بالقائمة: جسمُ الدالّة بالهجرة الهدف، بعد حذف كلّ سطرٍ ينتهي بـ`-- +NNNN` وفكّ كلّ
 * سطرٍ يبدأ بـ`-- -NNNN `، يساوي جسمَها بهجرة المصدر حرفاً (بلا مسافات). وقبل التعريف نداءُ
 * `_drift_assert('<sig>', '<md5>', '-- +NNNN')` وبصمتُه بصمةُ جسم المصدر — فالهجرةُ ترفض أن تنزل
 * على قاعدةٍ نسختُها غيرُ نسخة المستودع، بدل أن تدهسها.
 * وكلُّ `create or replace function public.X(` بهذه الهجرات يقابله `revoke all on function public.X(`
 * … `from public, anon` بنفس الملفّ: 0163 يسحب anon من المعرِّفات وحدها، والحزمةُ تعيده فتخفي غيابه. */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const MIG = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const FEATURE = ["0252", "0253", "0254", "0255", "0259", "0260", "0261"];

/* (الدالّة، عددُ وسائطها الداخلة، توقيعُ الحارس، المصدر، الهدف[، "pending"]). الهدفُ يُعيد كتابةَ نصّ المصدر.
 * "pending": إعادةٌ مقرَّرةٌ لم تُكتب بعد — تُقال بسطرٍ ما دام الهدفُ لا يعيدها، وتُفحص كاملةً من أوّل ما يعيدها
 * (فبصمةُ حارسها وعلاماتُها تُمسك من أوّل سطر، بلا انتظار سطرٍ يُضاف هنا). */
export const MANIFEST = [
  ["retail_checkout", 2, "public.retail_checkout(jsonb,jsonb)", "0242", "0252"],
  ["edit_invoice_lines_unguarded", 3, "public.edit_invoice_lines_unguarded(uuid,jsonb,text)", "0241", "0252"],
  ["product_movements", 2, "public.product_movements(uuid,integer)", "0242", "0252"],
  ["deduct_stock_pooled", 3, "public.deduct_stock_pooled(uuid,numeric,uuid)", "0066", "0253"],
  ["record_purchase", 2, "public.record_purchase(jsonb,jsonb)", "0214", "0253"],
  ["update_purchase", 3, "public.update_purchase(uuid,jsonb,jsonb)", "0214", "0253"],
  ["return_invoice_items", 4, "public.return_invoice_items(uuid,jsonb,text,text)", "0241", "0253"],
  ["delete_invoice", 1, "public.delete_invoice(uuid)", "0066", "0253"],
  ["restore_product", 1, "public.restore_product(uuid)", "0197", "0253"],
  ["inventory_tidy_uncat", 0, "public.inventory_tidy_uncat()", "0184", "0253"],
  ["pool_product", 2, "public.pool_product(uuid,uuid)", "0171", "0253"],
  ["restore_company", 1, "public.restore_company(uuid)", "0203", "0253"],
  ["restore_company_section", 1, "public.restore_company_section(uuid)", "0197", "0253"],
  ["stock_count_decide", 2, "public.stock_count_decide(uuid[],boolean)", "0217", "0254"],
  ["stock_count_state", 0, "public.stock_count_state()", "0216", "0254"],
  ["products_trash_consumption", 0, "public.products_trash_consumption()", "0252", "0254"],
  ["retail_checkout", 2, "public.retail_checkout(jsonb,jsonb)", "0252", "0255"],
  ["edit_invoice_lines_unguarded", 3, "public.edit_invoice_lines_unguarded(uuid,jsonb,text)", "0252", "0255"],
  ["record_purchase", 2, "public.record_purchase(jsonb,jsonb)", "0253", "0255"],
  ["update_purchase", 3, "public.update_purchase(uuid,jsonb,jsonb)", "0253", "0255"],
  ["stock_count_submit", 1, "public.stock_count_submit(jsonb)", "0217", "0255"],
  ["products_trash_consumption", 0, "public.products_trash_consumption()", "0254", "0255"],
  ["purchase_effect_snap", 1, "public.purchase_effect_snap(public.products)", "0211", "0255"],
  ["verify_consumption_wiring", 0, "public.verify_consumption_wiring()", "0252", "0255"],
  // sql2 §1b: 0254 تملأ waste بإعادة تعريف قارئ 0252 (أعمدتُها هناك) — بحارسٍ على جسم 0252 الأخير.
  ["invoice_consumption_get", 1, "public.invoice_consumption_get(uuid[])", "0252", "0254"],
  // 0259: التعبئةُ متعدّدةُ المستويات — الطيُّ يحمل المغلّفَ والكراتين، والفكُّ والاسترجاعُ يحرّرانها، و«رتّب» لا يطوي ما له تعبئة.
  ["merge_products", 2, "public.merge_products(uuid,uuid)", "0184", "0259"],
  ["restore_product", 1, "public.restore_product(uuid)", "0253", "0259"],
  ["inventory_tidy_uncat", 0, "public.inventory_tidy_uncat()", "0253", "0259"],
  // 0260: خصمُ الشركة على فاتورة الشراء — total صافٍ، وكلُّ سطرٍ يحمل نصيبَه من الخصم بكلفة المتوسّط.
  ["record_purchase", 2, "public.record_purchase(jsonb,jsonb)", "0255", "0260"],
  ["update_purchase", 3, "public.update_purchase(uuid,jsonb,jsonb)", "0255", "0260"],
  // 0260: فحصُ التوصيل يعرف مجموعتي 0259 و0260 — إعادةُ 0253 وحدها تُرجع أجسامَهما لنصّها وعلامتُها فيه.
  ["verify_consumption_wiring", 0, "public.verify_consumption_wiring()", "0255", "0260"],
  // 0261: الراجيتةُ «ملف طبي» بسجلّ الحركات — audit_kind نصُّ 0242 (آخرُ من عرّفها) وسطرٌ معلَّم.
  ["audit_kind", 3, "public.audit_kind(text,text,jsonb)", "0242", "0261"],
];

const files = readdirSync(MIG).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const fileOf = (num) => files.find((f) => f.startsWith(num + "_"));
const strip = (s) => s.replace(/[ \t\n\r\f\v]/g, "");

/* الشِفرةُ بلا تعليقاتها — مرآةُ `public._drift_code` (0252) حرفاً بحرف، والبصمةُ md5 ما يبقى بلا مسافات.
 *
 * لماذا: الإنتاجُ (٣/١١) رفض 0252 بـdrift_body على ١٢ دالّة، وقياسُها كلّها: **الشِفرةُ نصُّ المستودع حرفاً، والتعليقاتُ
 * وحدها غائبةٌ أو بنصٍّ أقدم** — الهجراتُ القديمة طُبّقت بأدواتٍ تحذف التعليق (سطراً كاملاً، أو كلَّه، أو بنصّ مسودّة).
 * والحارسُ يحرس الشِفرة: تعليقٌ لا يغيّر سلوكاً، فالبصمةُ لا تراه.
 *
 * التعليقُ `--` حتى نهاية السطر و`/* … *\/` (متداخلاً كبوستغريس) **خارج** النصوص وحدها: '…' و"…" (بتضعيف الحرف) و$وسم$…$وسم$
 * — فـformat('-- +%s') شِفرةٌ لا تعليق. وما لا يُغلق: النصُّ يبقى إلى الآخر، والتعليقُ يُحذف إلى الآخر. */
export function codeOf(s) {
  let out = "", i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n) {
        if (s[j] === c) { if (s[j + 1] === c) { j += 2; continue; } break; }
        j++;
      }
      if (j >= n) { out += s.slice(i); i = n; } else { out += s.slice(i, j + 1); i = j + 1; }
    } else if (c === "-" && s[i + 1] === "-") {
      const j = s.indexOf("\n", i);
      i = j < 0 ? n : j;
    } else if (c === "/" && s[i + 1] === "*") {
      let depth = 1, j = i + 2;
      while (j < n && depth > 0) {
        if (s[j] === "/" && s[j + 1] === "*") { depth++; j += 2; }
        else if (s[j] === "*" && s[j + 1] === "/") { depth--; j += 2; }
        else j++;
      }
      i = j;
    } else if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(s.slice(i, i + 80));
      if (!m) { out += c; i++; continue; }
      const tag = m[0], k = s.indexOf(tag, i + tag.length);
      if (k < 0) { out += s.slice(i); i = n; } else { out += s.slice(i, k + tag.length); i = k + tag.length; }
    } else { out += c; i++; }
  }
  return out;
}
/* بصمةُ الحارس: md5 الشِفرة بلا تعليقٍ ولا مسافات — `md5(public._drift_code(prosrc))` بالقاعدة. */
export const md5 = (s) => createHash("md5").update(strip(codeOf(s)), "utf8").digest("hex");

/* آخرُ تعريفٍ للدالّة بالملفّ (بعدد وسائطها الداخلة) — نصُّ ما بين علامتَي الدولار. */
export function bodyOf(txt, fn, nIn) {
  const re = new RegExp("create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?" + fn + "\\s*\\(", "gi");
  let found = null, m;
  while ((m = re.exec(txt))) {
    const open = m.index + m[0].length - 1;
    let depth = 0, j = open;
    for (; j < txt.length; j++) { if (txt[j] === "(") depth++; else if (txt[j] === ")" && --depth === 0) break; }
    const args = txt.slice(open + 1, j).replace(/--[^\n]*/g, "").trim();
    const nArgs = args ? args.split(/,(?![^(]*\))/).filter((a) => !/^\s*out\s/i.test(a)).length : 0;
    if (nArgs !== nIn) continue;
    const q = txt.slice(j).match(/\bas\s+(\$[A-Za-z_0-9]*\$)/i);
    if (!q) continue;
    const start = j + q.index + q[0].length;
    const end = txt.indexOf(q[1], start);
    if (end < 0) continue;
    found = txt.slice(start, end);
  }
  return found;
}

/* نصُّ الهدف بعد فكّ علاماته: يُحذف المضاف ويُستعاد المستبدَل. */
export function unmark(body, target) {
  const add = new RegExp("--\\s*\\+" + target + "\\s*$");
  const del = new RegExp("^\\s*--\\s*-" + target + "(?: (.*))?$");
  return body.split(/\r?\n/).filter((l) => !add.test(l)).map((l) => { const d = l.match(del); return d ? (d[1] ?? "") : l; }).join("\n");
}

function firstDiff(a, b) {
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `عند الحرف ${i}: المصدر «…${a.slice(Math.max(0, i - 40), i + 40)}…» والهدف «…${b.slice(Math.max(0, i - 40), i + 40)}…»`;
}

let fail = 0, checked = 0;
const bad = (msg) => { fail++; console.error(`  ✗ ${msg}`); };

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const present = FEATURE.filter((n) => fileOf(n));
  const pending = [];
  for (const [fn, nIn, sig, src, tgt, state] of MANIFEST) {
    if (!present.includes(tgt)) continue;               // هجرةٌ لم تُكتب بعد: لا يُفحص سطرُها
    const sf = fileOf(src), tf = fileOf(tgt);
    if (!sf) { bad(`${fn}: ما لكيت هجرةَ المصدر ${src}`); continue; }
    const sb = bodyOf(readFileSync(join(MIG, sf), "utf8"), fn, nIn);
    const ttxt = readFileSync(join(MIG, tf), "utf8");
    const tb = bodyOf(ttxt, fn, nIn);
    if (sb == null) { bad(`${fn}: ما لكيت تعريفها بـ${sf}`); continue; }
    if (tb == null && state === "pending") { pending.push(`${fn} (${src} → ${tgt}، بصمةُ المصدر ${md5(sb)})`); continue; }
    if (tb == null) { bad(`${fn}: ${tf} ما يعيد تعريفها`); continue; }
    checked++;
    const a = strip(sb), b = strip(unmark(tb, tgt));
    if (a !== b) bad(`${fn} (${src} → ${tgt}): النصُّ بعد فكّ العلامات غيرُ نصّ المصدر — ${firstDiff(a, b)}`);
    if (!new RegExp("--\\s*\\+" + tgt).test(tb)) bad(`${fn} (${tgt}): لا سطرَ معلَّماً بـ-- +${tgt} — إعادةُ تعريفٍ بلا تغيير؟`);
    const esc = sig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const g = ttxt.match(new RegExp("_drift_assert\\(\\s*'" + esc + "'\\s*,\\s*'([0-9a-f]{32})'\\s*,\\s*'([^']*)'\\s*\\)"));
    if (!g) bad(`${fn} (${tgt}): ما لكيت _drift_assert('${sig}', …) قبل التعريف`);
    else {
      if (g[1] !== md5(sb)) bad(`${fn} (${tgt}): بصمةُ الحارس ${g[1]} وبصمةُ جسم ${src} ${md5(sb)}`);
      if (g[2] !== `-- +${tgt}`) bad(`${fn} (${tgt}): علامةُ الحارس «${g[2]}» والمتوقَّع «-- +${tgt}»`);
      if (ttxt.indexOf(g[0]) > ttxt.search(new RegExp("create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?" + fn + "\\s*\\(", "i")))
        bad(`${fn} (${tgt}): الحارسُ بعد التعريف — لازم قبله`);
    }
  }
  // كلُّ دالّةٍ تُنشأ بهذه الهجرات تُسحب من anon بنفس الملفّ
  let revoked = 0;
  for (const num of present) {
    const f = fileOf(num), txt = readFileSync(join(MIG, f), "utf8");
    const code = txt.replace(/--[^\n]*/g, "");
    const names = new Set([...code.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z_0-9]+)\s*\(/gi)].map((m) => m[1].toLowerCase()));
    const bare = [...code.matchAll(/create\s+or\s+replace\s+function\s+(?!public\.)([a-z_0-9]+)\s*\(/gi)].map((m) => m[1]);
    for (const b of bare) bad(`${f}: ${b} بلا public. — كلُّ دالّةٍ جديدة تُسمّى بمخطّطها`);
    for (const n of names) {
      checked++; revoked++;
      if (!new RegExp("revoke\\s+all\\s+on\\s+function\\s+public\\." + n + "\\s*\\([^)]*\\)\\s+from\\s+public\\s*,\\s*anon\\b", "i").test(code))
        bad(`${f}: public.${n} بلا «revoke all on function public.${n}(…) from public, anon»`);
    }
  }
  if (!checked) { console.error("redefine-fingerprint: ما فحصتُ شيئاً — المسارُ غلط أو الهجراتُ غائبة"); process.exit(1); }
  if (fail) { console.error(`redefine-fingerprint: ${fail} فشل`); process.exit(1); }
  console.log(`redefine-fingerprint: ${checked - revoked} إعادةَ تعريفٍ طابقت مصدرها، و${revoked} دالّةً سُحبت من anon (${present.join("، ") || "—"})`);
  for (const p of pending) console.log(`  … مقرَّرةٌ لم تُكتب بعد (تُفحص من أوّل ما تُكتب): ${p}`);
}
