/* ============================================================================
 * أنواعُ الحركات (0152) — مرآةُ `audit_kind()` بالقاعدة حرفياً.
 *
 * السجلُّ الخام يقول «invoices/UPDATE»؛ الطبيبُ يسأل «شنو انباع، شنو انرجع،
 * شنو انحذف». فكلُّ سطرٍ يُصنَّف إلى نوعٍ واحد من قائمةٍ قصيرة، والقاعدةُ تجمع
 * وتفلتر بالنوع، والواجهةُ ترسم بالنوع. النسخةُ التجريبية تستعمل هذه الدالّة،
 * والسحابيةُ دالّةَ SQL — والحزمةُ تفحص تطابقَهما على نفس الحالات.
 * ==========================================================================*/

export type ActivityKind =
  | "sale" | "refund" | "payment" | "sale_edit" | "sale_delete" | "sale_line" | "print" | "export"
  | "product_add" | "product_edit" | "stock" | "product_delete" | "inventory" | "purchase" | "supplier_pay" | "expense" | "delivery"
  | "pet" | "case" | "dose" | "vaccine" | "medical" | "booking" | "message" | "store"
  | "team" | "payroll" | "settings" | "login" | "override" | "other";

export type ActivityGroup = "sales" | "stock" | "care" | "team";

/** المجموعاتُ بالترتيب الذي تُعرض به، وأنواعُ كلٍّ منها. */
export const ACTIVITY_GROUPS: { id: ActivityGroup; kinds: ActivityKind[] }[] = [
  { id: "sales", kinds: ["sale", "refund", "payment", "sale_edit", "sale_delete", "sale_line", "print", "export"] },
  { id: "stock", kinds: ["product_add", "product_edit", "stock", "product_delete", "inventory", "purchase", "supplier_pay", "expense", "delivery"] },
  { id: "care", kinds: ["pet", "case", "dose", "vaccine", "medical", "booking", "message", "store"] },
  { id: "team", kinds: ["team", "payroll", "settings", "login", "override", "other"] },
];

export const KIND_GROUP: Record<ActivityKind, ActivityGroup> = Object.fromEntries(
  ACTIVITY_GROUPS.flatMap((g) => g.kinds.map((k) => [k, g.id])),
) as Record<ActivityKind, ActivityGroup>;

/** أنواعٌ مخفيةٌ افتراضياً — سطورُ الفواتير ضجيجٌ يكرّر «بيع» بندَ بند. */
export const NOISY_KINDS: ActivityKind[] = ["sale_line"];

const CHANGE_NOISE = new Set(["updated_at", "created_at", "id", "clinic_id"]);

function changedKeys(details: Record<string, unknown> | null | undefined): Set<string> {
  const c = details?.["__changed"];
  if (!c || typeof c !== "object" || Array.isArray(c)) return new Set();
  return new Set(Object.keys(c as Record<string, unknown>).filter((k) => !CHANGE_NOISE.has(k)));
}

/** التصنيف — نفسُ الفروع ونفسُ ترتيبها كما بـ`audit_kind()`. */
export function auditKind(entity: string, action: string, details: Record<string, unknown> | null | undefined): ActivityKind {
  const d = details ?? {};
  const ch = changedKeys(d);
  const e = entity ?? "";
  if (e === "login") return "login";
  if (e === "client") {
    const ev = String(d["event"] ?? "");
    if (ev.startsWith("override.")) return "override";
    if (ev.startsWith("report.")) return "export";
    return "print";
  }
  if (e === "invoices") {
    if (action === "INSERT") return "sale";
    if (action === "DELETE") return "sale_delete";
    const chg = d["__changed"] as Record<string, unknown[]> | undefined;
    if (chg?.["status"]?.[1] === "refunded") return "refund";
    if (!chg && d["status"] === "refunded") return "refund";
    if (ch.has("amount_paid") || ch.has("payment_details")) return "payment";
    return "sale_edit";
  }
  if (e === "invoice_items") return "sale_line";
  if (e === "products") {
    if (action === "INSERT") return "product_add";
    if (action === "DELETE") return "product_delete";
    return ch.has("stock") ? "stock" : "product_edit";
  }
  if (e === "purchases" || e === "purchase_items") return "purchase";
  if (e === "purchase_payments") return "supplier_pay";
  if (e === "companies" || e === "company_sections" || e === "generated_barcodes") return "inventory";
  if (e === "expenses") return "expense";
  if (e === "delivery_orders" || e === "couriers" || e === "courier_settlements") return "delivery";
  if (e === "pets") return "pet";
  if (["admissions", "clinic_visits", "medical_visits", "surgeries", "care_entries", "pet_problems", "pet_movements"].includes(e)) return "case";
  if (e === "treatment_entries") return "dose";
  if (e === "vaccinations") return "vaccine";
  if (["pet_notes", "media_items", "weight_logs", "lab_results"].includes(e)) return "medical";
  if (["appointments", "reminders", "journeys", "journey_events"].includes(e)) return "booking";
  if (e === "wa_messages") return "message";
  if (e === "store_orders" || e === "store_profiles") return "store";
  if (["staff", "memberships", "invites", "branches"].includes(e)) return "team";
  if (e.startsWith("payroll") || ["payslips", "payslip_lines", "staff_comp", "staff_loans", "staff_loan_events", "staff_recurring"].includes(e)) return "payroll";
  if (e.startsWith("clinic") || ["wa_accounts", "lab_device_links"].includes(e)) return "settings";
  return "other";
}

/** «المختصر» — ما تحتاجه الشاشة لتسمّي الحدث: الحقولُ الصغيرة + أوّلُ ثمانية تغييرات.
 *  مرآةُ `activity_brief()`: القيمُ الطويلة (> ٢٠٠ حرف) لا تُنقل. */
export function activityBrief(details: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!details) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (k === "__changed") continue;
    if (JSON.stringify(v ?? null).length <= 200) out[k] = v;
  }
  const chg = details["__changed"];
  if (chg && typeof chg === "object" && !Array.isArray(chg)) {
    const c: Record<string, unknown> = {};
    let n = 0;
    for (const [k, v] of Object.entries(chg as Record<string, unknown>)) {
      if (CHANGE_NOISE.has(k) || JSON.stringify(v ?? null).length > 300) continue;
      c[k] = v;
      if (++n >= 8) break;
    }
    out["__changed"] = c;
  }
  return out;
}
