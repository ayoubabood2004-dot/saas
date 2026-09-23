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
 * ========================================================================= */
import type { AuditEntry, DemoDB, ProductMovement } from "@/types";

const W = 4000;              // نافذةُ الربط — نفسُ أربع ثوانٍ بالخادم
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function demoProductMovements(db: DemoDB, audit: AuditEntry[], productId: string): ProductMovement[] {
  const near = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < W;
  interface Ev { id: string; at: string; f: number | null; t: number | null; actor: string }
  const evs: Ev[] = [];
  for (const e of audit) {
    if (e.entity !== "products" || e.entity_id !== productId) continue;
    const d = (e.details ?? {}) as Record<string, unknown>;
    const ch = (d["__changed"] ?? {}) as Record<string, unknown[]>;
    const actor = String(d["__actor"] ?? "");
    if (e.action === "INSERT" && d["stock"] != null) {
      evs.push({ id: String(e.id), at: e.created_at, f: null, t: Number(d["stock"]), actor });
    } else if (Array.isArray(ch["stock"]) && ch["stock"].length === 2) {
      evs.push({ id: String(e.id), at: e.created_at, f: Number(ch["stock"][0]), t: Number(ch["stock"][1]), actor });
    }
  }

  const purOf = (at: string) => (db.purchases ?? []).find((p) => near(p.created_at, at)
    && (db.purchaseItems ?? []).some((pi) => pi.purchase_id === p.id && pi.product_id === productId))?.id ?? null;
  // تعديلُ فاتورةٍ قديمة: لا عمودَ `updated_at` بالجدول، فالأثرُ صفُّ تدقيقٍ لها.
  const editOf = (at: string) => audit.find((e) => e.entity === "purchases" && e.action === "UPDATE" && near(e.created_at, at)
    && (db.purchaseItems ?? []).some((pi) => pi.purchase_id === e.entity_id && pi.product_id === productId))?.entity_id ?? null;
  const invOf = (at: string) => (db.invoices ?? []).find((i) => near(i.created_at, at)
    && (db.invoiceItems ?? []).some((ii) => ii.invoice_id === i.id && ii.product_id === productId))?.id ?? null;

  const named = evs.map((e) => {
    const pu = e.f == null ? null : purOf(e.at);
    const pe = e.f == null || pu ? null : editOf(e.at);
    const iv = e.f == null || pu || pe ? null : invOf(e.at);
    const kind: ProductMovement["kind"] = e.f == null ? "open"
      : pu ? "purchase" : pe ? "purchase_edit"
      : iv ? ((e.t ?? 0) >= (e.f ?? 0) ? "return" : "sale") : "adjust";
    return { ...e, kind, ref_id: pu ?? pe ?? iv ?? null };
  });

  // الطيُّ على (اللحظة + المرجع) — كما يفعل `group by` بالخادم.
  const groups = new Map<string, typeof named>();
  for (const n of named) {
    const k = `${n.at}|${n.ref_id ?? ""}`;
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  return [...groups.values()].map((g) => {
    const asc = [...g].sort((a, b) => a.id.localeCompare(b.id));
    const first = asc[0], last = asc[asc.length - 1];
    return {
      at: first.at, kind: first.kind, from_qty: first.f, to_qty: last.t,
      delta: round3((last.t ?? 0) - (first.f ?? 0)), ref_id: first.ref_id,
      actor_name: first.actor || null,
    };
  }).sort((a, b) => b.at.localeCompare(a.at));
}
