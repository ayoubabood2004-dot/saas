#!/usr/bin/env node
/* ============================================================================
 * db-guard — حارسُ القاعدة، على نفس مبدأ i18n-guard.
 *
 * مستشار Supabase يشوف القاعدة الحيّة، فما ينفع بفحصٍ قبل النشر: يحتاج مفتاحاً
 * سرّياً بمستودعٍ عام، وما يشتغل إلا بعد ما تنزل الهجرة — أي بعد فوات الأوان.
 * هذا الحارس يقرأ `supabase/migrations/` وحدها، بلا شبكةٍ ولا مفتاح، فيمسك
 * نفس الأصناف الأربعة قبل ما تُرفع الهجرة أصلاً.
 *
 * الفحوص:
 *   fk-no-index      مفتاحٌ أجنبيّ بلا فهرسٍ يبدأ بعموده — حذفُ الأب يمسح
 *                    الجدول الابن كاملاً بحثاً عن الصفوف، ويقفله وهو يمسح.
 *   rls-initplan     `auth.uid()` عاريةً داخل سياسة — تنفَّذ مرّةً لكل صفّ
 *                    بدل مرّةٍ واحدة. مع ألف صفّ: ألف نداء.
 *   duplicate-index  فهرسان بنفس الجدول ونفس الأعمدة — كلفةُ كتابةٍ مضاعفة
 *                    بلا مكسبِ قراءة.
 *   definer-path     دالّة SECURITY DEFINER بلا `set search_path` — يقدر
 *                    مستخدمٌ يزرع دالّةً بمخطّطه فتُنفَّذ بصلاحية المالك.
 *
 * الأساس (db-baseline.json) يُشدّ ولا يُرخى: العدد المسموح ينزل تلقائياً كل
 * مرّة تنزل، وما يرتفع إلا بتحريرٍ يدويّ مقصود.
 * ==========================================================================*/

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIG_DIR = join(ROOT, "supabase", "migrations");
const BASELINE = join(ROOT, "scripts", "db-baseline.json");

/* -- تنظيف: نشيل التعليقات والنصوص حتى لا تُقرأ كأنها بناء -------------- */

/** يشيل التعليقات، ويرجّع النصّ المنظّف مع أجسام $$…$$ مفصولةً على حدة.
 *
 * أجسام الدوال تنفصل لأنّ داخلها SQL نصّيّ (`execute format('create policy …')`)
 * لو بقي مدموجاً لقرأه المحلّل كأنه بناءٌ حقيقيّ بأسماءٍ مثل `%1$s`. */
function strip(sql) {
  let out = "";
  const bodies = [];
  for (let i = 0; i < sql.length; i++) {
    const two = sql.slice(i, i + 2);
    if (two === "--") { const j = sql.indexOf("\n", i); if (j < 0) break; out += " ".repeat(j - i); i = j - 1; continue; }
    if (two === "/*") { const j = sql.indexOf("*/", i + 2); const e = j < 0 ? sql.length : j + 2; out += sql.slice(i, e).replace(/[^\n]/g, " "); i = e - 1; continue; }
    const tag = sql.slice(i).match(/^\$[a-z_]*\$/i);
    if (tag) {
      const close = sql.indexOf(tag[0], i + tag[0].length);
      const e = close < 0 ? sql.length : close + tag[0].length;
      bodies.push(sql.slice(i + tag[0].length, close < 0 ? sql.length : close));
      out += sql.slice(i, e).replace(/[^\n]/g, " ");
      i = e - 1;
      continue;
    }
    if (sql[i] === "'") { const j = sql.indexOf("'", i + 1); const e = j < 0 ? sql.length : j + 1; out += sql.slice(i, e); i = e - 1; continue; }
    out += sql[i];
  }
  return { sql: out, bodies };
}

/** السياسات المولَّدة داخل حلقة: `execute format('create policy %1$s_x on %1$s …', t)`
 *  مع قائمة الجداول المعدودة بالحلقة. نرجّع نصّ السياسة وقائمة جداولها. */
function dynamicPolicies(body) {
  const out = [];
  for (const m of body.matchAll(/create\s+policy\s+([^\s']+)\s+on\s+([^\s']+)([\s\S]*?)'/gi)) {
    // جداول الحلقة: foreach t in array[...]  /  in select unnest(array[...])
    const arr = body.match(/array\s*\[([\s\S]*?)\]/i);
    const tables = arr ? [...arr[1].matchAll(/'([\w.]+)'/g)].map((x) => norm(x[1])) : [];
    out.push({ name: m[1], onExpr: m[2], body: m[3].replace(/\s+/g, " ").trim(), tables });
  }
  return out;
}

/** يقصّ من موضعٍ بعد قوسٍ فاتح حتى قوسه المقابل، ويرجّع [المحتوى، الفهرس بعده]. */
function balanced(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === "'") { i = s.indexOf("'", i + 1); if (i < 0) break; continue; }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return [s.slice(open + 1, i), i + 1]; }
  }
  return [s.slice(open + 1), s.length];
}

const norm = (n) => (n || "").trim().replace(/^public\./i, "").replace(/^"|"$/g, "").toLowerCase();
const cols = (list) => list.split(",").map((c) => norm(c.trim().split(/\s+/)[0].replace(/\(.*$/, ""))).filter(Boolean);

/* -- بناء نموذج المخطّط من الهجرات بترتيبها ------------------------------ */

export function buildModel(dir = MIG_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  /** @type {Map<string,{fks:Array,indexes:Array,policies:Array}>} */
  const tables = new Map();
  const funcs = [];
  const tbl = (name) => {
    const k = norm(name);
    if (!tables.has(k)) tables.set(k, { fks: [], indexes: [], policies: [] });
    return tables.get(k);
  };

  for (const file of files) {
    const { sql, bodies } = strip(readFileSync(join(dir, file), "utf8"));

    /* سياساتٌ مولَّدة بحلقة — تُنسب لكل جدولٍ بالقائمة */
    for (const body of bodies) {
      for (const dp of dynamicPolicies(body)) {
        for (const tn of dp.tables) tbl(tn).policies.push({ name: `${tn}${dp.name.replace(/^%\d+\$s/, "")}`, table: tn, body: dp.body, file, dynamic: true });
      }
    }

    /* create table X ( ... ) — أعمدةٌ بمرجعٍ مضمّن */
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)\s*\(/gi)) {
      const t = tbl(m[1]);
      const [body] = balanced(sql, m.index + m[0].length - 1);
      // نقسم على الفواصل بالمستوى الأعلى وحده
      let depth = 0, cur = "";
      const parts = [];
      for (const ch of body) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
        cur += ch;
      }
      parts.push(cur);
      for (const p of parts) {
        /* المفتاح الأساسي والفريد يولّدان فهرساً ضمنياً — نسجّلهما فهارس */
        const pk = p.match(/primary\s+key\s*\(([^)]*)\)/i) || p.match(/unique\s*\(([^)]*)\)/i);
        if (pk) t.indexes.push({ name: `${norm(m[1])}_pkey`, cols: cols(pk[1]), where: "", unique: true, file, implicit: true });
        else if (/\b(primary\s+key|unique)\b/i.test(p) && !/\(/.test(p.split(/\s+/)[0])) {
          const c = norm(p.trim().split(/\s+/)[0]);
          if (c) t.indexes.push({ name: `${norm(m[1])}_${c}_key`, cols: [c], where: "", unique: true, file, implicit: true });
        }
        const fkc = p.match(/foreign\s+key\s*\(([^)]*)\)\s*references/i);
        if (fkc) { for (const c of cols(fkc[1])) t.fks.push({ col: c, file }); continue; }
        if (!/\breferences\b/i.test(p)) continue;
        const col = norm(p.trim().split(/\s+/)[0]);
        if (col) t.fks.push({ col, file });
      }
    }

    /* alter table X add column ... references / add constraint ... foreign key */
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."]+)([\s\S]*?);/gi)) {
      const t = tbl(m[1]);
      const body = m[2];
      for (const a of body.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([\w."]+)[^,;]*?\breferences\b/gi)) {
        t.fks.push({ col: norm(a[1]), file });
      }
      for (const a of body.matchAll(/foreign\s+key\s*\(([^)]*)\)/gi)) {
        for (const c of cols(a[1])) t.fks.push({ col: c, file });
      }
      for (const a of body.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?([\w."]+)/gi)) {
        const c = norm(a[1]);
        tables.set(norm(m[1]), { ...t, fks: t.fks.filter((f) => f.col !== c) });
      }
    }

    /* create index — الاسم، الجدول، الأعمدة، والشرط الجزئي */
    for (const m of sql.matchAll(/create\s+(unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([\w."]+)\s+on\s+(?:only\s+)?([\w."]+)\s*(?:using\s+\w+\s*)?\(/gi)) {
      const t = tbl(m[3]);
      const [body, end] = balanced(sql, m.index + m[0].length - 1);
      const tail = sql.slice(end, sql.indexOf(";", end) + 1 || undefined);
      const where = (tail.match(/\bwhere\b([\s\S]*?);/i)?.[1] ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      t.indexes.push({ name: norm(m[2]), cols: cols(body), where, unique: !!m[1], file });
    }
    for (const m of sql.matchAll(/drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?([\w."]+)/gi)) {
      const n = norm(m[1]);
      for (const t of tables.values()) t.indexes = t.indexes.filter((i) => i.name !== n);
    }

    /* create policy "n" on t ... using(...) with check(...) */
    for (const m of sql.matchAll(/create\s+policy\s+("(?:[^"]*)"|[\w]+)\s+on\s+([\w."]+)([\s\S]*?);(?=\s*(?:--|\n|$|[a-z]))/gi)) {
      const t = tbl(m[2]);
      const name = norm(m[1]);
      t.policies.push({ name, table: norm(m[2]), body: m[3].replace(/\s+/g, " ").trim(), file });
    }
    for (const m of sql.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?("(?:[^"]*)"|[\w]+)\s+on\s+([\w."]+)/gi)) {
      const t = tbl(m[2]);
      const n = norm(m[1]);
      t.policies = t.policies.filter((p) => p.name !== n);
    }

    /* دوال SECURITY DEFINER */
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(/gi)) {
      const [, end] = balanced(sql, m.index + m[0].length - 1);
      const head = sql.slice(end, end + 600).toLowerCase();
      if (/security\s+definer/.test(head)) {
        funcs.push({ name: norm(m[1]), searchPath: /set\s+search_path/.test(head), file });
      }
    }
  }
  return { tables, funcs };
}

/* -- الفحوص --------------------------------------------------------------- */

/** الدوالّ التي تُنفَّذ لكل صفّ إن جاءت عاريةً داخل سياسة. */
export const HELPERS = ["auth.uid", "auth.jwt", "auth.role", "auth_clinic", "auth_role", "is_clinic_staff", "is_platform_admin", "has_permission"];
/** الصيغة الملفوفة الصحيحة: `(select f(…))` — تُستثنى من الفحص. */
const RE_WRAPPED = /\(\s*select\s+[\w.]+\s*\([^()]*\)(\s+as\s+\w+)?\s*\)/gi;

export function analyze(model) {
  const findings = [];
  for (const [name, t] of model.tables) {
    // fk-no-index: عمودُ المفتاح لازم يكون أوّلَ أعمدة فهرسٍ ما، وبلا شرطٍ جزئي
    const lead = new Set(t.indexes.filter((i) => !i.where).map((i) => i.cols[0]));
    const seen = new Set();
    for (const fk of t.fks) {
      if (seen.has(fk.col) || lead.has(fk.col)) continue;
      seen.add(fk.col);
      findings.push({ rule: "fk-no-index", where: `${name}.${fk.col}`, file: fk.file });
    }
    // duplicate-index
    const sig = new Map();
    for (const i of t.indexes) {
      const k = `${i.cols.join(",")}|${i.where}`;
      if (sig.has(k)) findings.push({ rule: "duplicate-index", where: `${name}: ${i.name} = ${sig.get(k)}`, file: i.file });
      else sig.set(k, i.name);
    }
    // rls-initplan: نداءٌ عارٍ داخل السياسة، خارج (select …)
    //
    // ما نكتفي بـ auth.uid() مثل مستشار Supabase. `auth_clinic()` أثقل منها
    // بكثير: هي SECURITY DEFINER فما تُدمَج بالخطة أبداً، وجسمها استعلامٌ على
    // memberships. عاريةً داخل السياسة تُنفَّذ **مرّةً لكل صفّ** — قراءة ألف
    // فاتورة = ألف استعلامِ عضوية. وبـ(select …) تصير InitPlan: مرّةً واحدة.
    for (const p of t.policies) {
      const bare = p.body.replace(RE_WRAPPED, "«ok»");
      for (const fn of HELPERS) {
        if (new RegExp(`(?:^|[^\\w.])${fn.replace(".", "\\.")}\\s*\\(`, "i").test(bare)) {
          findings.push({ rule: "rls-initplan", where: `${name}: ${p.name} → ${fn}()`, file: p.file });
        }
      }
      // policy-self-ref: سياسةٌ تستعلم من الجدول الذي تحميه. بوستغريس يرفضها
      // عند إعادة كتابة الاستعلام (42P17 infinite recursion) لكلّ طلبٍ بدورٍ
      // عاديّ — والحزمةُ لا تراها لأنها superuser. مقيسٌ ثلاثَ مرّات بالإنتاج
      // (0157 → 0159، ثم 0049/0051/0161 → 0162): تجميدُ الأعمدة يكون بمحفّز.
      if (new RegExp(`\\bfrom\\s+(?:public\\.)?${name}\\b`, "i").test(bare)) {
        findings.push({ rule: "policy-self-ref", where: `${name}: ${p.name}`, file: p.file });
      }
    }
  }
  for (const f of model.funcs) {
    if (!f.searchPath) findings.push({ rule: "definer-path", where: f.name, file: f.file });
  }
  return findings;
}

/* -- التشغيل: يقارن بالأساس، ويشدّه إذا نزل العدد ------------------------ */

function main() {
  const findings = analyze(buildModel());
  const counts = {};
  for (const f of findings) counts[f.rule] = (counts[f.rule] ?? 0) + 1;

  let base = {};
  try { base = JSON.parse(readFileSync(BASELINE, "utf8")); } catch { /* أوّل تشغيل */ }
  const allow = base.allow ?? {};

  const rules = [...new Set([...Object.keys(counts), ...Object.keys(allow)])].sort();
  let failed = false;
  const nextAllow = {};

  for (const rule of rules) {
    const now = counts[rule] ?? 0;
    const cap = allow[rule] ?? 0;
    nextAllow[rule] = Math.min(now, cap);
    if (now > cap) {
      failed = true;
      console.error(`\n✗ ${rule}: ${now} > المسموح ${cap}`);
      for (const f of findings.filter((x) => x.rule === rule)) console.error(`    ${f.where}   (${f.file})`);
    } else if (now < cap) {
      console.log(`↓ ${rule}: ${cap} → ${now}`);
    }
  }

  if (failed) {
    console.error("\ndb-guard: هجرةٌ جديدة زادت مشاكل القاعدة. صلّحها، أو ارفع السقف بـ scripts/db-baseline.json بقصد.\n");
    process.exit(1);
  }

  const next = { note: base.note ?? "الأساس يشدّ ولا يرخى — db-guard ينزّله تلقائياً.", allow: nextAllow };
  const prev = JSON.stringify({ note: base.note ?? next.note, allow }, null, 2);
  if (JSON.stringify(next, null, 2) !== prev) writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`db-guard: ${findings.length} ملاحظة، كلها ضمن الأساس.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) main();
