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
 *   effect-blind     آخرُ تعريفٍ لـ`record_purchase`/`update_purchase` يلمس
 *                    المنتجات بلا `insert into purchase_effects` — الشراءُ يرجع
 *                    للصمت: يبدّل سعرَ الرفّ ويطابق بالاسم ولا يقول (0211).
 *   norm-reindex     هجرةٌ تعيد تعريفَ `search_norm` ولا تكتب `reindex index` لكلّ
 *                    فهرسٍ قائمٍ عليها (clinic_drugs_name_uq 0229، store_categories_name_uq
 *                    0233، clinic_drug_groups_name_uq 0239) — يبقى الفهرسُ
 *                    بمفاتيح الدالّة القديمة فيدخل التوأمُ أو يُرفض السليم بصمت.
 *   invoice-writers  دالّةٌ آخرُ جسمٍ لها يكتب `invoice_items` أو يحذف فاتورةً أو يقلب
 *                    حالتها، وليست بقائمة INVOICE_WRITERS بسببها — المستهلكاتُ (0252) تُصرف
 *                    بالبيعة وتُردّ بمحفّزاتٍ بعد قفل منتجات الفاتورة بترتيبها، فكاتبٌ جديدٌ
 *                    يُقرأ قبل أن يُضاف: هل يصرف؟ هل يمرّ عكسُه من المحفّزات بعد القفل؟
 *   consumption-wiring  آخرُ جسمٍ لـ`retail_checkout` بلا `_consumption_plan(`/`_consumption_apply(`،
 *                    أو التعديلُ بلا `_consumption_relink(`/`_invoice_lock_products(`، أو المرتجعُ
 *                    والحذفُ ومحفّزاتُ العكس بلا القفل، أو `product_movements` لا تقرأ الدفتر، أو
 *                    محفّزٌ من محفّزات العكس أُسقط أو عُطّل — إعادةُ هجرةٍ قديمة تفكّ الربطَ بصمت
 *                    (درسُ 0241)، وverify_consumption_wiring() تقوله بعد النشر، وهذا قبله.
 *                    ومنه: آخرُ `invoice_consumption_get` يقرأ دفعاتِه بـ`_cons_at_us(`.
 *   at-us-expr       جسمٌ أحدث (غيرُ `_cons_at_us` نفسها) يحسب ميكروثانيةً من الحقبة بنفسه —
 *                    `extract(epoch …)`/`date_part('epoch', …)` مضروباً بمليون (بأيّ كتابةٍ له: 1e6،
 *                    1_000_000، 10^6، power(10, 6)، 1000 * 1000). at_us دفعةُ الفعل،
 *                    والواجهةُ تقارن دفعاتِ سند الهدر بأحداث الدفتر بالتساوي (0252 §6): تعبيرٌ ثانٍ
 *                    أو عائمٌ (date_part يرجع double) يفتح الشطبَ المزدوج بصمت.
 *
 * الأساس (db-baseline.json) يُشدّ ولا يُرخى: العدد المسموح ينزل تلقائياً كل
 * مرّة تنزل، وما يرتفع إلا بتحريرٍ يدويّ مقصود.
 * ==========================================================================*/

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  const starts = [];
  for (let i = 0; i < sql.length; i++) {
    const two = sql.slice(i, i + 2);
    if (two === "--") { const j = sql.indexOf("\n", i); if (j < 0) break; out += " ".repeat(j - i); i = j - 1; continue; }
    if (two === "/*") { const j = sql.indexOf("*/", i + 2); const e = j < 0 ? sql.length : j + 2; out += sql.slice(i, e).replace(/[^\n]/g, " "); i = e - 1; continue; }
    const tag = sql.slice(i).match(/^\$[a-z_]*\$/i);
    if (tag) {
      const close = sql.indexOf(tag[0], i + tag[0].length);
      const e = close < 0 ? sql.length : close + tag[0].length;
      bodies.push(sql.slice(i + tag[0].length, close < 0 ? sql.length : close));
      starts.push(i);
      out += sql.slice(i, e).replace(/[^\n]/g, " ");
      i = e - 1;
      continue;
    }
    if (sql[i] === "'") { const j = sql.indexOf("'", i + 1); const e = j < 0 ? sql.length : j + 1; out += sql.slice(i, e); i = e - 1; continue; }
    out += sql[i];
  }
  return { sql: out, bodies, starts };
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

/** أجزاءُ قائمةٍ مفصولة بفواصل المستوى الأعلى — خارج الأقواس والنصوص (`default '{a,b}'`). */
function topSplit(list) {
  const parts = [];
  let cur = "", depth = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === "'") { const j = list.indexOf("'", i + 1); const e = j < 0 ? list.length : j + 1; cur += list.slice(i, e); i = e - 1; continue; }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (c === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}
/** عددُ الوسائط الداخلة (بلا `out`) — مفتاحُ الدالّة مع اسمها: التحميلُ الزائد دالّةٌ أخرى. */
const inArgs = (list) => topSplit(list).filter((p) => !/^out\s/i.test(p)).length;
/** نصُّ الجسم شِفرةً لا تعليقاً: تعليقٌ يذكر الكتابةَ لا يكتب. */
const code = (b) => b.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ").toLowerCase();

/** أحداثُ DDL للدوالّ والمحفّزات بموضعها: إنشاءُ دالّةٍ بجسمها، وحذفُها، وإنشاءُ محفّزٍ وحذفُه وتعطيلُه.
 *  ويُنزل إلى كلّ جسمٍ $…$ لم يفتحه `as` — كتلةُ `do` و`execute $fn$…$fn$` تجريان وقتَ الهجرة: غلافُ
 *  edit_invoice_lines (0113، 0241) يُنشأ هكذا، ونصُّ 0110 الذي يكتب السطور صار اسمُه _unguarded.
 *  أمّا جسمُ دالّةٍ (`as $$…$$`) فشِفرةُ تشغيلٍ لا هجرة: لا يُنزل إليه. */
function ddlEvents(src, base, ev) {
  const { sql, bodies, starts } = strip(src);
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(/gi)) {
    const [args, end] = balanced(sql, m.index + m[0].length - 1);
    const k = starts.findIndex((at) => at > end);
    if (k < 0 || sql.slice(end, starts[k]).includes(";")) continue;   // جسمٌ بلا $…$ لا يُقرأ هنا
    const name = norm(m[1]);
    ev.push({ at: base + m.index, op: "fn", key: `${name}/${inArgs(args)}`, name, body: code(bodies[k]) });
  }
  for (const m of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?([^;]*);/gi)) {
    for (const item of topSplit(m[1].replace(/\b(?:cascade|restrict)\b/gi, " "))) {
      const nm = item.match(/^([\w."]+)\s*(\()?/);
      if (!nm) continue;
      const name = norm(nm[1]);
      if (!nm[2]) { ev.push({ at: base + m.index, op: "fn-", name, all: true }); continue; }
      const [types] = balanced(item, item.indexOf("("));
      ev.push({ at: base + m.index, op: "fn-", key: `${name}/${inArgs(types)}` });
    }
  }
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+("[^"]+"|\w+)\s[^;]*?\bon\s+([\w."]+)/gi)) {
    ev.push({ at: base + m.index, op: "trg", key: `${norm(m[1])}@${norm(m[2])}` });
  }
  for (const m of sql.matchAll(/drop\s+trigger\s+(?:if\s+exists\s+)?("[^"]+"|\w+)\s+on\s+([\w."]+)/gi)) {
    ev.push({ at: base + m.index, op: "trg-", key: `${norm(m[1])}@${norm(m[2])}` });
  }
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."]+)\s+(enable|disable)\s+(?:always\s+|replica\s+)?trigger\s+("[^"]+"|\w+)/gi)) {
    ev.push({ at: base + m.index, op: m[2].toLowerCase() === "enable" ? "trg-on" : "trg-off", key: `${norm(m[3])}@${norm(m[1])}`, table: norm(m[1]), name: norm(m[3]) });
  }
  for (let k = 0; k < bodies.length; k++) {
    if (/\bas\s*$/i.test(sql.slice(Math.max(0, starts[k] - 16), starts[k]))) continue;
    const tag = src.slice(starts[k]).match(/^\$[a-z_]*\$/i)[0];
    ddlEvents(bodies[k], base + starts[k] + tag.length, ev);
  }
}

/* -- بناء نموذج المخطّط من الهجرات بترتيبها ------------------------------ */

export function buildModel(dir = MIG_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  /** @type {Map<string,{fks:Array,indexes:Array,policies:Array}>} */
  const tables = new Map();
  const funcs = [];
  /** آخرُ تعريفٍ لكلّ دالّةِ شراء — الأحدثُ يغلب، فالقديمُ الأعمى لا يُعدّ. */
  const purchaseFns = new Map();
  /** فهارسُ على تعبيرٍ بـsearch_norm، وكلُّ هجرةٍ تعيد تعريفَ search_norm (norm-reindex). */
  const normIndexes = [];
  const normDefs = [];
  /** أحدثُ جسمٍ لكلّ دالّة («الاسم/عددُ الوسائط»، بترتيب الهجرات، والحذفُ يُحترم): ما ينزل
   *  بالقاعدة آخرُ تعريف لا أيُّ تعريف — invoice-writers وconsumption-wiring تقرآنه. */
  const fnBodies = new Map();
  /** المحفّزاتُ القائمة بعد كلّ الهجرات: «الاسم@الجدول» → {file, enabled}. */
  const triggers = new Map();
  const tbl = (name) => {
    const k = norm(name);
    if (!tables.has(k)) tables.set(k, { fks: [], indexes: [], policies: [] });
    return tables.get(k);
  };

  for (const file of files) {
    const raw = readFileSync(join(dir, file), "utf8");
    const { sql, bodies, starts } = strip(raw);

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
      if (/\bsearch_norm\s*\(/i.test(body)) normIndexes.push({ name: norm(m[2]), file });
    }
    for (const m of sql.matchAll(/drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?([\w."]+)/gi)) {
      const n = norm(m[1]);
      for (const t of tables.values()) t.indexes = t.indexes.filter((i) => i.name !== n);
      for (let k = normIndexes.length - 1; k >= 0; k--) if (normIndexes[k].name === n) normIndexes.splice(k, 1);
    }

    /* norm-reindex: فهرسٌ فريدٌ على search_norm(name) (0229) يحفظ مفاتيحَ الدالّة **لحظةَ
     * البناء**. إعادةُ تعريفها بهجرةٍ لاحقة لا تعيد بناءه — فيبقى بمفاتيحَ قديمة: يدخل
     * التوأمُ أو يُرفض اسمٌ سليم، بصمت. فكلُّ هجرةٍ تعيد تعريفَها لازم تكتب reindex له. */
    if (/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?search_norm"?\s*\(/i.test(sql)) {
      normDefs.push({ file, reindexed: [...sql.matchAll(/reindex\s+index\s+(?:concurrently\s+)?([\w."]+)/gi)].map((x) => norm(x[1])) });
    }

    /* create/drop policy — **بترتيب الموضع لا بمرورين**.
     *
     * كان المروران منفصلين: كلُّ `create` يُجمع أوّلاً ثم كلُّ `drop` يُطبَّق.
     * وعرفُ البيت أن تُكتب السياسةُ هكذا:
     *     drop policy if exists p on t;
     *     create policy p on t …;
     * فالمرورُ الثاني كان يمحو ما أنشأه الأوّلُ **بنفس الملفّ** — أي أن كلَّ
     * سياسةٍ حديثةٍ كانت غيرَ مرئيةٍ للحارس. ومقيسٌ بالتجربة: إرجاعُ سياسةٍ إلى
     * نداءٍ عارٍ كان يمرّ أخضرَ، بينما أساسُ الحارس يقول بنصّه إن وظيفته «يمنع
     * سياسةً جديدة تُكتب بنداء عارٍ». حارسٌ يدّعي ما لا يفعل أسوأُ من لا حارس. */
    const polOps = [];
    for (const m of sql.matchAll(/create\s+policy\s+("(?:[^"]*)"|[\w]+)\s+on\s+([\w."]+)([\s\S]*?);(?=\s*(?:--|\n|$|[a-z]))/gi)) {
      polOps.push({ at: m.index, kind: "create", name: norm(m[1]), table: m[2], body: m[3] });
    }
    for (const m of sql.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?("(?:[^"]*)"|[\w]+)\s+on\s+([\w."]+)/gi)) {
      polOps.push({ at: m.index, kind: "drop", name: norm(m[1]), table: m[2] });
    }
    polOps.sort((a, b) => a.at - b.at);
    for (const op of polOps) {
      const t = tbl(op.table);
      if (op.kind === "drop") t.policies = t.policies.filter((p) => p.name !== op.name);
      else t.policies.push({ name: op.name, table: norm(op.table), body: op.body.replace(/\s+/g, " ").trim(), file });
    }

    /* effect-blind: جسمُ الدالّة أوّلُ $$…$$ بعد رأسها، بلا تعليقاته (تعليقٌ يذكر
     * `purchase_effects` لا يكتب فيه). */
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(record_purchase|update_purchase)\s*\(/gi)) {
      const k = starts.findIndex((at) => at > m.index);
      if (k < 0) continue;
      const body = bodies[k].replace(/--[^\n]*/g, "").toLowerCase();
      purchaseFns.set(m[1].toLowerCase(), {
        file,
        touches: /update\s+products\s+set|insert\s+into\s+products\b/.test(body),
        says: /insert\s+into\s+purchase_effects\b/.test(body),
      });
    }

    /* دوال SECURITY DEFINER */
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(/gi)) {
      const [, end] = balanced(sql, m.index + m[0].length - 1);
      const head = sql.slice(end, end + 600).toLowerCase();
      if (/security\s+definer/.test(head)) {
        funcs.push({ name: norm(m[1]), searchPath: /set\s+search_path/.test(head), file });
      }
    }

    /* أحدثُ الأجسام والمحفّزات — بترتيب الموضع داخل الملفّ، كالسياسات (drop ثم create عرفُ البيت). */
    const ev = [];
    ddlEvents(raw, 0, ev);
    ev.sort((a, b) => a.at - b.at);
    for (const e of ev) {
      if (e.op === "fn") fnBodies.set(e.key, { name: e.name, file, body: e.body });
      else if (e.op === "fn-") { for (const k of [...fnBodies.keys()]) if (e.all ? k.startsWith(`${e.name}/`) : k === e.key) fnBodies.delete(k); }
      else if (e.op === "trg") triggers.set(e.key, { file, enabled: true });
      else if (e.op === "trg-") triggers.delete(e.key);
      else {
        const on = e.op === "trg-on";
        const every = e.name === "all" || e.name === "user";   // `disable trigger all` يطال محفّزاتِ الجدول كلَّها
        for (const [k, t] of triggers) if (every ? k.endsWith(`@${e.table}`) : k === e.key) { t.enabled = on; t.file = file; }
      }
    }
  }
  return { tables, funcs, purchaseFns, normIndexes, normDefs, fnBodies, triggers };
}

/* -- كتّابُ الفواتير وربطُ المستهلكات (0252) ------------------------------- */

/** كلُّ دالّةٍ يكتب آخرُ جسمٍ لها سطورَ الفواتير أو يحذف فاتورةً أو يقلب حالتها — وسببُ أنها لا تُفلت
 *  دفترَ المستهلكات (التصميم §6.5، مقيسةٌ عشرتُها بالشجرة). دالّةٌ جديدةٌ هنا تُقرأ قبل أن تُضاف. */
export const INVOICE_WRITERS = {
  retail_checkout: "تخطّط وتصرف بنفسها: _consumption_plan قبل أوّل كتابة و_consumption_apply بعد آخر سطر (0252)",
  edit_invoice_lines_unguarded: "تقفل منتجاتِ الفاتورة، ومحفّزُ الحذف يردّ القديم، و_consumption_relink يربط الجديدَ بالقديم (0252)",
  pos_checkout: "قديمةٌ لا تناديها واجهة: لا تصرف مستهلكات (مسموحةٌ بالتغطية، التصميم §5.5)",
  refund_invoice: "تقلب الحالة فيردّ محفّزُ invoices_consumption_status كلَّ مواصفةٍ بعد قفل منتجات الفاتورة",
  delete_invoice: "تقفل منتجاتِ الفاتورة (0253) ثم يحذف التتالي السطورَ فيردّ محفّزُ الحذف",
  return_invoice_items: "تقفل منتجاتِ الفاتورة (0253) ثم يردّ محفّزا الكمية والحالة",
  merge_products: "تمسّ product_id وحده؛ محفّزُ products_trash_consumption يوجّه الوصفاتِ والدفترَ للباقي ويطوي المرحَّل",
  inventory_tidy_uncat: "تمسّ product_id وحده؛ محفّزُ products_trash_consumption يوجّه كما بالدمج",
  delete_product: "تصفّر product_id بالسطور وحده؛ الدفترُ يحفظ المعرّف ويردّ لصفّ السلّة",
  restore_product: "تعيد product_id للسطور (نفسُ المعرّف)؛ الدفترُ يتابع الصفَّ الحيّ",
  usd_checkout: "تبيع وتصرف من retail_checkout نفسِها؛ تحديثُها للسطور كلفتُها وسعرُها بالدولار وحدهما (لا كمية ولا مادّة)، والخدماتُ ممنوعةٌ بفاتورة الدولار فلا مستهلكات (0264)",
  settle_invoice_usd: "تقلب الحالةَ بين unpaid/partial/paid وحدها — محفّزُ invoices_consumption_status لا ينطلق إلا بدخول refunded أو خروجه، وفاتورةُ الدولار بلا خدماتٍ فلا مستهلكات (0264)",
  void_usd_settlement: "كأختها: تُرجع الحالةَ unpaid/partial وحدها، لا refunded (0264)",
};

/** ما يكتب بالفواتير: سطورُها، أو حذفُ رأسها، أو حالتُها (`update invoices … set … status =`). */
function invoiceWrites(body) {
  const why = [];
  if (/\b(?:insert\s+into|delete\s+from|update)\s+(?:only\s+)?(?:public\.)?invoice_items\b/.test(body)) why.push("invoice_items");
  if (/\bdelete\s+from\s+(?:only\s+)?(?:public\.)?invoices\b/.test(body)) why.push("delete invoices");
  for (const m of body.matchAll(/\bupdate\s+(?:only\s+)?(?:public\.)?invoices\b(?:\s+(?:as\s+)?(?!set\b)[a-z_][a-z_0-9]*)?\s+set\b([\s\S]*?)(?:\bwhere\b|;|\breturning\b|$)/g)) {
    if (/(?:^|[\s,(.])status\s*=/.test(m[1])) { why.push("invoices.status"); break; }
  }
  return why;
}

/** أحدثُ كلِّ دالّةٍ تكتب بالفواتير: [{name, key, file, why}]. */
export function invoiceWriters(model) {
  const out = [];
  for (const [key, f] of model.fnBodies ?? []) {
    const why = invoiceWrites(f.body);
    if (why.length) out.push({ name: f.name, key, file: f.file, why });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** ربطُ المستهلكات: (الدالّة بعدد وسائطها، ما لازم بآخر جسمها، الدالّةُ التي يعني وجودُها أن الميزةَ نزلت).
 *  مرآةُ verify_consumption_wiring() بالشِفرة — تلك تقوله بعد النشر، وهذا قبل الدفعة. */
export const WIRING = [
  ["retail_checkout/2", "_consumption_plan(", "_consumption_plan"],
  ["retail_checkout/2", "_consumption_apply(", "_consumption_apply"],
  ["edit_invoice_lines_unguarded/3", "_consumption_relink(", "_consumption_relink"],
  ["edit_invoice_lines_unguarded/3", "_invoice_lock_products(", "_invoice_lock_products"],
  ["return_invoice_items/4", "_invoice_lock_products(", "_invoice_lock_products"],
  ["delete_invoice/1", "_invoice_lock_products(", "_invoice_lock_products"],
  ["invoice_items_consumption_del/0", "_invoice_lock_products(", "_invoice_lock_products"],
  ["invoice_items_consumption_qty/0", "_invoice_lock_products(", "_invoice_lock_products"],
  ["invoices_consumption_status/0", "_invoice_lock_products(", "_invoice_lock_products"],
  ["product_movements/2", "invoice_consumption", "_consumption_move"],
  ["invoice_consumption_get/1", "_cons_at_us(", "_cons_at_us"],
  // 0259: الطيُّ يضمّ التعبئة، والاسترجاعُ يحرّر رموزَها، والترتيبُ لا يطوي ما له تعبئة.
  ["merge_products/2", "_pkg_packs_union(", "_pkg_packs_union"],
  ["restore_product/1", "_pkg_snapshot_free(", "_pkg_snapshot_free"],
  ["inventory_tidy_uncat/0", "dup.sub_codes", "_pkg_snapshot_free"],
  // 0260: خصمُ الشركة — كلفةُ المتوسّط بنصيب السطر منه، بالاستلام والتعديل.
  ["record_purchase/2", "_purchase_unit_cost(", "_purchase_unit_cost"],
  ["update_purchase/3", "_purchase_unit_cost(", "_purchase_unit_cost"],
];
/** محفّزاتُ العكس (و0254 حارسُ السند): قائمةٌ ومفعَّلة متى وُجدت دالّتُها. */
export const WIRED_TRIGGERS = [
  ["invoice_items_consumption_del@invoice_items", "invoice_items_consumption_del"],
  ["invoice_items_consumption_qty@invoice_items", "invoice_items_consumption_qty"],
  ["invoices_consumption_status@invoices", "invoices_consumption_status"],
  ["products_trash_consumption@products_trash", "products_trash_consumption"],
  ["products_waste_guard@products", "products_waste_guard"],
];

/** كلُّ فحصِ ربطٍ ينطبق على هذه الشجرة: [{what, ok, file}] — فارغةٌ قبل 0252. */
export function wiringChecks(model) {
  const fns = model.fnBodies ?? new Map();
  const has = (name) => [...fns.keys()].some((k) => k.startsWith(`${name}/`));
  const out = [];
  for (const [key, needle, gate] of WIRING) {
    if (!has(gate)) continue;
    const f = fns.get(key);
    const state = !f ? "غائبة" : f.body.includes(needle) ? "" : `بلا ${needle}`;
    out.push({ what: `${key} ⇐ ${needle}`, ok: !state, state, file: f?.file ?? "-" });
  }
  for (const [key, fn] of WIRED_TRIGGERS) {
    if (!has(fn)) continue;
    const t = (model.triggers ?? new Map()).get(key);
    const state = !t ? "غائب" : t.enabled ? "" : "معطَّل";
    out.push({ what: `محفّز ${key}`, ok: !state, state, file: t?.file ?? "-" });
  }
  return out;
}

/* -- دفعةُ الفعل: at_us بتعبيرٍ واحد (0252 §6) ------------------------------- */

/** ميكروثانيةٌ من الحقبة بجملةٍ واحدة: extract(epoch …) (أو 'epoch') أو date_part('epoch', …) مع مليون (أيّاً كان
 *  الترتيب) — والمليونُ بأيّ كتابة: 1000000 (ولو 1000000.0)، 1_000_000، 1e6 (1e+6، 1.0e6)، 10^6، power(10, 6)،
 *  1000 * 1000. نمطٌ يعرف 1000000 و1e6 وحدهما كان يمرّر التعبيرَ الثاني نفسَه بكتابةٍ أخرى للعدد. */
const US_EPOCH = String.raw`(?:\bextract\s*\(\s*'?epoch\b|\bdate_part\s*\(\s*'epoch')`;
const US_MILLION = String.raw`(?:\b1000000(?:\.0*)?(?![\d_])|\b1_000_000\b|\b1(?:\.0*)?e\+?0*6\b|\b10\s*\^\s*6\b|\bpower\s*\(\s*10(?:\.0*)?\s*,\s*6(?:\.0*)?\s*\)|\b1000\s*\*\s*1000\b)`;
const RE_EPOCH_US = new RegExp(`${US_EPOCH}[^;]*?${US_MILLION}|${US_MILLION}[^;]*?${US_EPOCH}`);

/** كلُّ أحدثِ جسمٍ يحسب at_us بنفسه بدل `_cons_at_us(` — فارغةٌ قبل 0252 (لا مصدرَ واحدَ بعد). */
export function atUsInline(model) {
  const fns = model.fnBodies ?? new Map();
  if (![...fns.keys()].some((k) => k.startsWith("_cons_at_us/"))) return [];
  const out = [];
  for (const [key, f] of fns) if (f.name !== "_cons_at_us" && RE_EPOCH_US.test(f.body)) out.push({ key, file: f.file });
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/* -- الفحوص --------------------------------------------------------------- */

/** الدوالّ التي تُنفَّذ لكل صفّ إن جاءت عاريةً داخل سياسة. */
/** رقمُ الهجرة من اسم ملفّها — لقصر القواعد على ما بعد إصلاحٍ شاملٍ بعينه. */
function fileNum(f) { const n = Number(String(f).slice(0, 4)); return Number.isFinite(n) ? n : 9999; }

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
          /* ما قبل 0128 دَينٌ تاريخيّ **تُصلحه 0128 وقتَ التشغيل** من الكتلوج
           * مباشرة (لفّت ١١٦ سياسةً على الإنتاج) — فعدُّه هنا يعدّ نصّاً ميتاً
           * ويغرق الإشارةَ الحيّة. والقاعدةُ من هنا فصاعداً: لا سياسةَ **جديدة**
           * بنداءٍ عارٍ. وبعد إصلاح ترتيب create/drop صارت هذه ١٤٧ لو عُدَّت
           * كلُّها؛ رفعُ السقف إليها كان سيدفن الإشارة بدل أن يكشفها. */
          if (fileNum(p.file) > 128) findings.push({ rule: "rls-initplan", where: `${name}: ${p.name} → ${fn}()`, file: p.file });
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
  for (const d of model.normDefs ?? []) {
    for (const ix of model.normIndexes ?? []) {
      if (!(ix.file < d.file)) continue;   // فهرسٌ يُبنى بعد التعريف (أو بملفّه) يُبنى بالدالّة الجديدة
      if (!d.reindexed.includes(ix.name)) findings.push({ rule: "norm-reindex", where: `${ix.name} ← ${d.file}`, file: d.file });
    }
  }
  for (const [name, f] of model.purchaseFns ?? []) {
    if (f.touches && !f.says) findings.push({ rule: "effect-blind", where: name, file: f.file });
  }
  for (const w of invoiceWriters(model)) {
    if (!Object.hasOwn(INVOICE_WRITERS, w.name)) findings.push({ rule: "invoice-writers", where: `${w.name} (${w.why.join("+")})`, file: w.file });
  }
  for (const c of wiringChecks(model)) {
    if (!c.ok) findings.push({ rule: "consumption-wiring", where: `${c.what} — ${c.state}`, file: c.file });
  }
  for (const a of atUsInline(model)) {
    findings.push({ rule: "at-us-expr", where: `${a.key}: ميكروثانيةٌ من الحقبة خارج _cons_at_us(`, file: a.file });
  }
  return findings;
}

/* -- التشغيل: يقارن بالأساس، ويشدّه إذا نزل العدد ------------------------ */

function main() {
  const model = buildModel();
  const findings = analyze(model);
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
  /* حارسٌ يخرج صفراً بلا كلمة ليس حارساً: يقول ما فحص. */
  const pf = [...model.purchaseFns].map(([n, f]) => `${n}@${f.file.slice(0, 4)}`);
  console.log(`db-guard effect-blind: فُحص ${pf.length} دالّة (${pf.join("، ")})`);
  if (pf.length !== 2) { console.error("✗ effect-blind: لازم دالّتا الشراء كلتاهما — الحارسُ ما لقاهما."); process.exit(1); }
  const iw = invoiceWriters(model);
  console.log(`db-guard invoice-writers: فُحص آخرُ جسمٍ لـ${model.fnBodies.size} دالّة، يكتب بالفواتير ${iw.length} (${iw.map((w) => `${w.name}@${w.file.slice(0, 4)}`).join("، ")})`);
  const stale = Object.keys(INVOICE_WRITERS).filter((n) => !iw.some((w) => w.name === n));
  if (stale.length) console.log(`   (بالقائمة ولم يعد يكتب: ${stale.join("، ")} — شيله من INVOICE_WRITERS)`);
  if (!model.fnBodies.size || !iw.length) { console.error("✗ invoice-writers: ما فحصتُ شيئاً — لا دالّةَ أو لا كاتبَ للفواتير؟ الحارسُ أعمى."); process.exit(1); }
  const wc = wiringChecks(model);
  console.log(`db-guard consumption-wiring: فُحص ${wc.length} رابطاً (${wc.filter((c) => c.ok).length} سليماً)`);
  if (!wc.length) { console.error("✗ consumption-wiring: ما فحصتُ شيئاً — لا _consumption_plan بالهجرات؟ الحارسُ أعمى."); process.exit(1); }
  const usSrc = model.fnBodies.get("_cons_at_us/1");
  console.log(`db-guard at-us-expr: فُحص آخرُ جسمٍ لـ${model.fnBodies.size} دالّة — at_us من _cons_at_us وحدها${usSrc ? ` (${usSrc.file.slice(0, 4)})` : ""}`);
  if (!usSrc || !RE_EPOCH_US.test(usSrc.body)) { console.error("✗ at-us-expr: _cons_at_us غائبة أو لا يطابقها النمط — الحارسُ أعمى."); process.exit(1); }
}

/* «شُغِّل مباشرةً؟» بالرابط الكامل لا بذيل المسار: `argv[1]` على ويندوز بشرطاتٍ عكسية،
 * فكان `split("/")` يرجع المسارَ كلَّه فلا يطابق، ولا يجري `main()` أبداً — الحارسُ يخرج
 * صفراً بلا كلمة، فكلُّ قاعدةٍ (definer-path، policy-self-ref، الفهارس) لا تُفحص محلّياً،
 * و«lint ✓» على ويندوز ادّعاءٌ لم يُفحص. (لينكس الـCI سليم.) */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
