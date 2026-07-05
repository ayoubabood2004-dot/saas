import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  History, Search, PawPrint, Receipt, Pill, Syringe, Stethoscope, Package,
  Users, Trash2, NotebookPen, Image as ImageIcon, Building2, CalendarDays,
  Scale, BellRing, Lock, Clock, LucideIcon,
} from "lucide-react";
import type { AuditEntry, Pet } from "@/types";
import { repo } from "@/lib/repo";
import { listStaff } from "@/lib/staff";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Skeleton } from "@/components/ui";
import { cn, money, formatNum, dateLocale } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/* ============================================================================
 * Clinic activity log (سجل الحركات) — manager-only, above Settings in the nav.
 *
 * One chronological trail of EVERYTHING that happens in the clinic: who added
 * which pet, gave which dose, recorded which vaccine, made/updated which sale,
 * changed which product, moved which case… On Supabase the rows are written by
 * tamper-proof DB triggers (0018 + 0044) and read is manager-only via RLS; in
 * demo mode the repo mirrors the same rows locally.
 *
 * Retention: 30 days. Opening this page fires purge_activity_log() (and the
 * demo equivalent), so older rows are dropped and the trail never grows.
 * ==========================================================================*/

type Category = "all" | "medical" | "records" | "finance" | "inventory" | "team";

const ENTITY_CATEGORY: Record<string, Exclude<Category, "all">> = {
  treatment_entries: "medical", vaccinations: "medical", medical_visits: "medical",
  pet_notes: "medical", media_items: "medical", weight_logs: "medical",
  pets: "records", admissions: "records", reminders: "records", appointments: "records",
  invoices: "finance",
  products: "inventory",
  staff: "team", memberships: "team", invites: "team", branches: "team",
};

const KIND_LABEL: Record<string, { key: string; def: string }> = {
  treatment: { key: "act.kindCare", def: "رعاية طبية" },
  boarding: { key: "act.kindBoarding", def: "فندقة" },
  treatment_boarding: { key: "act.kindCareBoarding", def: "فندقة علاجية" },
};
const MEDIA_LABEL: Record<string, { key: string; def: string }> = {
  lab: { key: "rpt.media.lab", def: "تحاليل مخبرية" },
  xray: { key: "rpt.media.xray", def: "أشعة سينية" },
  ultrasound: { key: "rpt.media.ultrasound", def: "سونار / تصوير" },
};

interface Rendered { icon: LucideIcon; tone: string; text: string; category: Exclude<Category, "all"> }

export function ActivityLog() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { can } = usePermissions();
  const clinicId = user?.clinic_id ?? user?.id;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [staffByUser, setStaffByUser] = useState<Map<string, string>>(new Map());
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category>("all");
  const [shown, setShown] = useState(60);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Retention first (fire-and-forget), then read the fresh window.
      void repo.purgeAuditLog().catch(() => {});
      try {
        const [audit, allPets, staff] = await Promise.all([
          repo.listAuditLog(clinicId, 500),
          repo.listAllPets(clinicId).catch(() => [] as Pet[]),
          listStaff().catch(() => []),
        ]);
        if (!alive) return;
        setRows(audit);
        setPets(allPets);
        setStaffByUser(new Map(staff.filter((s) => s.userId).map((s) => [s.userId as string, s.name])));
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId]);

  const petName = useMemo(() => {
    const m = new Map(pets.map((p) => [p.id, p.name]));
    return (id: unknown): string => (typeof id === "string" && m.get(id)) || t("act.aPet", "حيوان");
  }, [pets, t]);

  /** (entity, action, details) → readable line + icon + tone. */
  const render = useMemo(() => (e: AuditEntry): Rendered => {
    const d = (e.details ?? {}) as Record<string, unknown>;
    const s = (k: string) => { const v = d[k]; return typeof v === "string" && v.trim() ? v.trim() : ""; };
    const category = ENTITY_CATEGORY[e.entity] ?? "records";
    const del = e.action === "DELETE";
    const pn = () => s("pet_name") || petName(d["pet_id"]);

    switch (e.entity) {
      case "pets":
        return del
          ? { icon: Trash2, tone: "danger", category, text: t("act.petDel", { name: s("name"), defaultValue: "حذف الحيوان {{name}} نهائياً" }) }
          : e.action === "INSERT"
            ? { icon: PawPrint, tone: "brand", category, text: t("act.petAdd", { name: s("name"), defaultValue: "أضاف حيواناً جديداً: {{name}}" }) }
            : { icon: PawPrint, tone: "muted", category, text: t("act.petUpd", { name: s("name"), defaultValue: "عدّل بيانات الحيوان {{name}}" }) };
      case "admissions": {
        const kind = KIND_LABEL[s("kind")] ?? KIND_LABEL.treatment;
        if (e.action === "INSERT") return { icon: Stethoscope, tone: "brand", category, text: t("act.admAdd", { pet: pn(), kind: t(kind.key, kind.def), defaultValue: "أدخل {{pet}} إلى العيادة — {{kind}}" }) };
        const outcome = s("outcome");
        if (outcome === "deceased") return { icon: Stethoscope, tone: "danger", category, text: t("act.admDeceased", { pet: pn(), defaultValue: "سجّل خروج {{pet}} — متوفى" }) };
        if (outcome === "recovered") return { icon: Stethoscope, tone: "success", category, text: t("act.admRecovered", { pet: pn(), defaultValue: "سجّل خروج {{pet}} — عايش / تعافى" }) };
        if (s("status") === "discharged") return { icon: Stethoscope, tone: "muted", category, text: t("act.admDischarge", { pet: pn(), defaultValue: "أخرج الحالة — {{pet}}" }) };
        return { icon: Stethoscope, tone: "muted", category, text: t("act.admUpd", { pet: pn(), defaultValue: "حدّث حالة {{pet}} (نقل / تعديل)" }) };
      }
      case "treatment_entries": {
        const med = s("medication"); const amount = s("amount");
        if (e.action === "INSERT") return { icon: Pill, tone: "brand", category, text: t("act.doseAdd", { med, amount, pet: pn(), defaultValue: "أضاف دواء: {{med}} ({{amount}}) لـ {{pet}}" }) };
        if (del) return { icon: Trash2, tone: "danger", category, text: t("act.doseDel", { med, defaultValue: "حذف جرعة دواء: {{med}}" }) };
        return d["administered_at"]
          ? { icon: Pill, tone: "success", category, text: t("act.doseGiven", { med, pet: pn(), defaultValue: "أعطى جرعة {{med}} لـ {{pet}}" }) }
          : { icon: Pill, tone: "muted", category, text: t("act.doseUpd", { med, defaultValue: "عدّل جرعة الدواء {{med}}" }) };
      }
      case "vaccinations":
        return { icon: Syringe, tone: "success", category, text: t("act.vacAdd", { name: s("vaccine") || s("name"), pet: pn(), defaultValue: "سجّل لقاح {{name}} لـ {{pet}}" }) };
      case "medical_visits":
        return { icon: Stethoscope, tone: "brand", category, text: t("act.visitAdd", { pet: pn(), doctor: s("doctor_name"), defaultValue: "أضاف استشارة لـ {{pet}} — {{doctor}}" }) };
      case "pet_notes":
        return { icon: NotebookPen, tone: "muted", category, text: t("act.noteAdd", { pet: pn(), defaultValue: "أضاف ملاحظة سريرية لـ {{pet}}" }) };
      case "media_items": {
        const kind = MEDIA_LABEL[s("kind")];
        return { icon: ImageIcon, tone: "muted", category, text: t("act.mediaAdd", { kind: kind ? t(kind.key, kind.def) : t("act.mediaFile", "ملف / صورة"), pet: pn(), defaultValue: "رفع {{kind}} لـ {{pet}}" }) };
      }
      case "weight_logs":
        return { icon: Scale, tone: "muted", category, text: t("act.weightAdd", { pet: pn(), kg: formatNum(Number(d["weight_kg"]) || 0), defaultValue: "سجّل وزن {{pet}}: {{kg}} كغم" }) };
      case "invoices": {
        const total = money(Number(d["total"]) || 0);
        const client = s("customer_name") || t("rpt.walkIn", "عميل نقدي");
        if (e.action === "INSERT") return { icon: Receipt, tone: "success", category, text: t("act.invAdd", { total, client, defaultValue: "أنشأ فاتورة بمبلغ {{total}} — {{client}}" }) };
        if (del) return { icon: Trash2, tone: "danger", category, text: t("act.invDel", { total, client, defaultValue: "حذف فاتورة {{total}} ({{client}}) نهائياً" }) };
        if (s("status") === "refunded") return { icon: Receipt, tone: "danger", category, text: t("act.invRefund", { total, client, defaultValue: "أرجع فاتورة {{total}} — {{client}}" }) };
        return { icon: Receipt, tone: "muted", category, text: t("act.invUpd", { total, client, defaultValue: "حدّث فاتورة {{client}} ({{total}}) — تسديد / تعديل" }) };
      }
      case "products": {
        const name = s("name");
        if (e.action === "INSERT") return { icon: Package, tone: "brand", category, text: t("act.prodAdd", { name, defaultValue: "أضاف منتجاً: {{name}}" }) };
        if (del) return { icon: Trash2, tone: "danger", category, text: t("act.prodDel", { name, defaultValue: "حذف المنتج: {{name}}" }) };
        return { icon: Package, tone: "muted", category, text: t("act.prodUpd", { name, stock: formatNum(Number(d["stock"]) || 0), defaultValue: "عدّل المنتج {{name}} (المخزون: {{stock}})" }) };
      }
      case "branches":
        return { icon: Building2, tone: "brand", category, text: t("act.branchAdd", { name: s("name"), defaultValue: "فرع: {{name}} (إضافة / تعديل)" }) };
      case "reminders":
        return { icon: BellRing, tone: "muted", category, text: t("act.reminderAdd", { title: s("title") || s("text"), defaultValue: "تذكير: {{title}}" }) };
      case "appointments":
        return { icon: CalendarDays, tone: "muted", category, text: t("act.apptAdd", { pet: pn(), defaultValue: "موعد لـ {{pet}} (حجز / تعديل)" }) };
      case "staff":
        return del
          ? { icon: Users, tone: "danger", category, text: t("act.staffDel", { name: s("name"), defaultValue: "أزال الموظف {{name}}" }) }
          : e.action === "INSERT"
            ? { icon: Users, tone: "brand", category, text: t("act.staffAdd", { name: s("name"), defaultValue: "أضاف موظفاً: {{name}}" }) }
            : { icon: Users, tone: "muted", category, text: t("act.staffUpd", { name: s("name"), defaultValue: "عدّل بيانات / صلاحيات الموظف {{name}}" }) };
      case "memberships": case "invites":
        return { icon: Users, tone: "muted", category, text: t("act.accessChange", "تغيير في وصول الكادر (دعوة / عضوية)") };
      default:
        return { icon: History, tone: "muted", category, text: `${e.action} — ${e.entity}` };
    }
  }, [petName, t]);

  const actorOf = (e: AuditEntry): string => {
    if (e.actor && staffByUser.get(e.actor)) return staffByUser.get(e.actor)!;
    if (e.actor && user && e.actor === user.id) return user.full_name || t("act.manager", "مدير العيادة");
    const a = (e.details as Record<string, unknown> | null)?.["__actor"];
    if (typeof a === "string" && a.trim()) return a;
    return e.actor ? t("act.manager", "مدير العيادة") : t("act.system", "النظام");
  };

  const CATS: { id: Category; label: string }[] = [
    { id: "all", label: t("act.catAll", "الكل") },
    { id: "medical", label: t("act.catMedical", "طبية") },
    { id: "records", label: t("act.catRecords", "سجلات وحالات") },
    { id: "finance", label: t("act.catFinance", "مالية") },
    { id: "inventory", label: t("act.catInventory", "مخزون") },
    { id: "team", label: t("act.catTeam", "كادر ونظام") },
  ];

  const enriched = useMemo(() => rows.map((e) => {
    const r = render(e);
    return { e, r, actor: actorOf(e), ms: new Date(e.created_at).getTime() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows, render, staffByUser, user?.id]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return enriched.filter(({ r, actor }) => {
      if (cat !== "all" && r.category !== cat) return false;
      if (ql && !r.text.toLowerCase().includes(ql) && !actor.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [enriched, q, cat]);

  // Group by calendar day — "اليوم", "أمس", then dated headers.
  const groups = useMemo(() => {
    const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
    const today = dayKey(Date.now());
    const yest = dayKey(Date.now() - 86400000);
    const out: { label: string; items: typeof filtered }[] = [];
    for (const item of filtered.slice(0, shown)) {
      const k = dayKey(item.ms);
      const label = k === today ? t("act.today", "اليوم") : k === yest ? t("act.yesterday", "أمس")
        : new Date(item.ms).toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long" });
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(item);
      else out.push({ label, items: [item] });
    }
    return out;
  }, [filtered, shown, t]);

  const toneCls = (tone: string) =>
    tone === "success" ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300"
      : tone === "danger" ? "bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300"
        : tone === "brand" ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
          : "bg-surface-2 text-ink-muted";

  const timeOf = (ms: number) => new Date(ms).toLocaleTimeString(dateLocale(), { hour: "numeric", minute: "2-digit", hour12: true });

  // Manager-only (matches the server RLS: audit_manager_read).
  if (!can("manageSettings")) {
    return (
      <div className="mx-auto grid max-w-md place-items-center px-4 py-20 text-center">
        <Lock size={32} className="mb-3 text-ink-subtle" />
        <p className="text-sm text-ink-muted">{t("act.noAccess", "سجل الحركات متاح لمدير العيادة فقط.")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><History size={24} /></span>
        <div className="me-auto">
          <h1 className="font-display text-2xl font-extrabold text-ink">{t("act.title", "سجل الحركات")}</h1>
          <p className="text-sm text-ink-subtle">{t("act.subtitle", "كل حركة صارت في العيادة — مَن قام بها ومتى.")}</p>
        </div>
        <span className="chip bg-warn-50 text-2xs font-semibold text-warn-700 dark:bg-warn-500/15 dark:text-warn-300">
          <Clock size={12} className="me-1 inline" /> {t("act.retention", "يُحتفظ بآخر 30 يوماً فقط — الأقدم يُحذف تلقائياً")}
        </span>
      </div>

      {/* Search + category filter */}
      <div className="mb-4 space-y-2.5 rounded-2xl border border-line bg-surface-1 p-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("act.searchPh", "ابحث بالحركة أو اسم الموظف أو الحيوان…")} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATS.map((c) => (
            <button key={c.id} onClick={() => { playTap(); setCat(c.id); }}
              className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold transition", cat === c.id ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
              {c.label}
            </button>
          ))}
          <span className="ms-auto self-center text-2xs text-ink-subtle">{t("act.count", { n: formatNum(filtered.length), defaultValue: "{{n}} حركة" })}</span>
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-line bg-surface-1 px-6 py-16 text-center">
          <History size={30} className="mb-2 text-ink-subtle/40" />
          <p className="text-sm text-ink-subtle">{rows.length === 0 ? t("act.empty", "لا توجد حركات مسجّلة بعد — كل عملية جديدة ستظهر هنا فوراً.") : t("act.noMatch", "لا توجد حركات مطابقة لبحثك.")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.label}>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-ink-subtle">
                <CalendarDays size={13} /> {g.label}
              </h2>
              <div className="space-y-1.5">
                {g.items.map(({ e, r, actor, ms }) => {
                  const Icon = r.icon;
                  return (
                    <div key={String(e.id)} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-1 p-3">
                      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", toneCls(r.tone))}><Icon size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-ink">{r.text}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-ink-subtle">
                          <span className="inline-flex items-center gap-1 font-semibold text-ink-muted"><Users size={11} /> {actor}</span>
                          <span>·</span>
                          <span dir="ltr">{timeOf(ms)}</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {filtered.length > shown && (
            <button onClick={() => { playTap(); setShown((n) => n + 60); }}
              className="w-full rounded-2xl border border-line bg-surface-1 py-3 text-sm font-bold text-ink-muted transition hover:bg-surface-2 hover:text-ink">
              {t("act.more", { n: formatNum(filtered.length - shown), defaultValue: "عرض المزيد ({{n}} متبقية)" })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
