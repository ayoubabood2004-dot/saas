/* ============================================================================
 * مرآةُ `product_movements` (0207) للوضع التجريبي — **نفسُ قواعد الخادم حرفاً**:
 * الأرقامُ من سجلّ الجهاز لا محسوبة، و«لماذا» بمقارنةٍ زمنيةٍ بنافذة أربع ثوانٍ،
 * والخطوةُ الوسطى تُطوى، وما لم يُعرف يبقى «تعديل».
 *
 * ولماذا هنا لا داخل `repo.ts`: الوكيلُ على **مسار الإقلاع الحرج**، وكلُّ سطرٍ
 * يُضاف إليه يدفعه كلُّ فتحِ تطبيقٍ بكلّ عيادة — ولو بقيت هنا لكلّفت ٢٩٥ بايتاً
 * مضغوطة على الجميع من أجل شاشةٍ تُفتح نادراً. أمسكه `store-weight-guard`
 * وأوقف البناء، فصارت الوحدةُ تُحمَّل عند النداء وحدَه.
 *
 * ومرآةٌ تخالف أصلَها تجعل الفحصَ يمرّ على سلوكٍ غير المنشور — فأيُّ تغييرٍ
 * بـ0207 يُنقل هنا، ويمسك الافتراقَ فحصُ `repo-demo-test` بنفس القالب.
 *
 * 0252: فرعُ «مستهلكات» (consume / consume_return) من `db.consumption` — حدثٌ كتب بالرصيد (posted ≠ 0) خلال
 * النافذة، والأقربُ زمناً؛ ويفحصه consumption-test. (والتجريبيُّ لا يكتب صفَّ تدقيقٍ لتغيّر الرصيد بالبيع ولا
 * بالاستهلاك — الفرعُ يُرى حيث وُجد الصفّ، كفرع البيع نفسِه.)
 * ========================================================================= */
import type { AuditEntry, DemoDB, ProductMovement } from "@/types";

const W = 4000;              // نافذةُ الربط — نفسُ أربع ثوانٍ بالخادم
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function demoProductMovements(db: DemoDB, audit: AuditEntry[], productId: string): ProductMovement[] {
  const near = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < W;
  /* `seq` = ترتيبُ الإدراج (audit_log.id عمودُ identity بالخادم): سجلُّ الجهاز يُخزَّن الأحدثَ أوّلاً، فالأقدمُ آخرُه.
   * (معرّفُ صفّه يبدأ بعشوائيّ — ترتيبُ نصّه ليس ترتيبَ الإدراج.) */
  interface Ev { id: string; seq: number; at: string; f: number | null; t: number | null; actor: string }
  const evs: Ev[] = [];
  audit.forEach((e, i) => {
    if (e.entity !== "products" || e.entity_id !== productId) return;
    const d = (e.details ?? {}) as Record<string, unknown>;
    const ch = (d["__changed"] ?? {}) as Record<string, unknown[]>;
    const actor = String(d["__actor"] ?? "");
    const seq = audit.length - 1 - i;
    if (e.action === "INSERT" && d["stock"] != null) {
      evs.push({ id: String(e.id), seq, at: e.created_at, f: null, t: Number(d["stock"]), actor });
    } else if (Array.isArray(ch["stock"]) && ch["stock"].length === 2) {
      evs.push({ id: String(e.id), seq, at: e.created_at, f: Number(ch["stock"][0]), t: Number(ch["stock"][1]), actor });
    }
  });

  const purOf = (at: string) => (db.purchases ?? []).find((p) => near(p.created_at, at)
    && (db.purchaseItems ?? []).some((pi) => pi.purchase_id === p.id && pi.product_id === productId))?.id ?? null;
  // تعديلُ فاتورةٍ قديمة: لا عمودَ `updated_at` بالجدول، فالأثرُ صفُّ تدقيقٍ لها.
  const editOf = (at: string) => audit.find((e) => e.entity === "purchases" && e.action === "UPDATE" && near(e.created_at, at)
    && (db.purchaseItems ?? []).some((pi) => pi.purchase_id === e.entity_id && pi.product_id === productId))?.entity_id ?? null;
  // 0242: لحظةُ الإدخال لا يومُ البيع — فاتورةٌ مؤرَّخة يتغيّر رصيدُها حين تُدخل.
  const invOf = (at: string) => (db.invoices ?? []).find((i) => near(i.recorded_at ?? i.created_at, at)
    && (db.invoiceItems ?? []).some((ii) => ii.invoice_id === i.id && ii.product_id === productId))?.id ?? null;
  /* 0252: مستهلكاتُ خدمةٍ كتبت بالرصيد (posted ≠ 0) خلال النافذة نفسها — بلحظة الحدث لا يوم البيع، والأقربُ زمناً
   * (`order by abs(…) limit 1`). سطرُ مادّةٍ بالفاتورة يسبقها (inv قبل cs بالخادم). */
  const consOf = (at: string): string | null => {
    let best: { id: string; gap: number } | null = null;
    for (const c of db.consumption ?? []) {
      if (c.product_id !== productId || c.posted_m === "0" || !near(c.created_at, at)) continue;
      const gap = Math.abs(new Date(c.created_at).getTime() - new Date(at).getTime());
      if (!best || gap < best.gap) best = { id: c.invoice_id, gap };
    }
    return best?.id ?? null;
  };
  const named = evs.map((e) => {
    const pu = e.f == null ? null : purOf(e.at);
    const pe = e.f == null || pu ? null : editOf(e.at);
    const iv = e.f == null || pu || pe ? null : invOf(e.at);
    const cs = e.f == null || pu || pe || iv ? null : consOf(e.at);
    // «مستهلكات» و«مستهلكات — إرجاع» (0252): بعد سطر المادّة بالفاتورة وقبل «تعديل»، كالخادم.
    const kind: ProductMovement["kind"] = e.f == null ? "open"
      : pu ? "purchase" : pe ? "purchase_edit"
      : iv ? ((e.t ?? 0) >= (e.f ?? 0) ? "return" : "sale")
      : cs ? ((e.t ?? 0) >= (e.f ?? 0) ? "consume_return" : "consume") : "adjust";
    return { ...e, kind, ref_id: pu ?? pe ?? iv ?? cs ?? null };
  });

  // الطيُّ على (اللحظة + المرجع) — كما يفعل `group by` بالخادم: النوعُ min(kind)، و«كان» أوّلُ f و«صار» آخرُ t بترتيب
  // الإدراج (order by n.id). تعديلٌ بلا تغيير يكتب إرجاعاً ثمّ صرفاً بنفس اللحظة والفاتورة ⇒ «مستهلكات» صافيها صفر.
  const groups = new Map<string, typeof named>();
  for (const n of named) {
    const k = `${n.at}|${n.ref_id ?? ""}`;
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  return [...groups.values()].map((g) => {
    const asc = [...g].sort((a, b) => a.seq - b.seq);
    const first = asc[0], last = asc[asc.length - 1];
    const kind = g.map((x) => x.kind).sort()[0];
    return {
      at: first.at, kind, from_qty: first.f, to_qty: last.t,
      delta: round3((last.t ?? 0) - (first.f ?? 0)), ref_id: first.ref_id,
      actor_name: g.map((x) => x.actor).filter((a) => a !== "").sort()[0] ?? "",   // coalesce(min(st.name), '')
    };
  }).sort((a, b) => b.at.localeCompare(a.at));
}
