import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Users, UserPlus, Pencil, Trash2, Check, X, ShieldCheck, ShieldX, Briefcase,
  Mail, Phone as PhoneIcon, Calendar, Camera, PauseCircle, PlayCircle, BadgeCheck, Lock,
} from "lucide-react";
import { Button, Dialog, useToast, Skeleton } from "@/components/ui";
import { PhoneInput } from "@/components/PhoneInput";
import { usePermissions } from "@/hooks/usePermissions";
import {
  listStaff, saveStaff, deleteStaff, setStaffStatus, blankStaff,
  STAFF_ROLES, ROLE_LABEL, CAPABILITIES, PERMISSIONS,
  type StaffMember, type StaffRole,
} from "@/lib/staff";
import { prepareUpload } from "@/lib/image";
import { cn } from "@/lib/utils";
import { playTap, playSuccess } from "@/lib/sounds";

/** Western-numeral join date, Arabic month name. */
const fmtDate = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "short", day: "numeric" });
};

const initialsOf = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

const ROLE_TONE: Record<StaffRole, string> = {
  manager: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  veterinarian: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
  receptionist: "bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300",
  groomer: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
};

export function StaffManagement() {
  const { i18n } = useTranslation();
  const toast = useToast();
  const { can } = usePermissions();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [deleting, setDeleting] = useState<StaffMember | null>(null);

  const reload = () => listStaff().then(setStaff).catch(() => toast.error("تعذّر تحميل الكادر"));
  useEffect(() => { void listStaff().then(setStaff).catch(() => toast.error("تعذّر تحميل الكادر")).finally(() => setLoading(false)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // RBAC gate — only managers (clinic admins) reach this module.
  if (!can("manageStaff")) {
    return (
      <div className="mx-auto grid max-w-md place-items-center px-4 py-24 text-center">
        <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-ink-subtle"><Lock size={26} /></span>
        <h1 className="font-display text-xl font-extrabold text-ink">صلاحية محدودة</h1>
        <p className="mt-1 text-sm text-ink-muted">إدارة الكادر متاحة لمدير العيادة فقط.</p>
      </div>
    );
  }

  const active = staff.filter((s) => s.status === "active").length;

  // Optimistic delete: drop from the UI instantly, persist in the background.
  const onDelete = () => {
    if (!deleting) return;
    const id = deleting.id;
    setStaff((s) => s.filter((m) => m.id !== id));
    setDeleting(null);
    playTap();
    deleteStaff(id).then(() => toast.success("تم حذف الموظف")).catch(() => { toast.error("تعذّر الحذف"); reload(); });
  };
  // Optimistic suspend/activate.
  const onToggle = (m: StaffMember) => {
    const next: StaffMember["status"] = m.status === "active" ? "suspended" : "active";
    setStaff((s) => s.map((x) => (x.id === m.id ? { ...x, status: next } : x)));
    playTap();
    setStaffStatus(m.id, next).catch(() => { toast.error("تعذّر التحديث"); reload(); });
  };
  // Optimistic add/edit: reflect immediately, persist in the background.
  const onSaved = (m: StaffMember) => {
    setStaff((s) => (s.some((x) => x.id === m.id) ? s.map((x) => (x.id === m.id ? m : x)) : [...s, m]));
    setEditing(null);
    playSuccess();
    saveStaff(m).then(() => toast.success("تم حفظ الملف الوظيفي")).catch(() => { toast.error("تعذّر الحفظ"); reload(); });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><Briefcase size={24} /></span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold text-ink">إدارة الكادر</h1>
          <p className="text-sm text-ink-subtle">فريق العيادة وملفّاتهم الوظيفية وصلاحياتهم.</p>
        </div>
        <Button className="ms-auto" leftIcon={<UserPlus size={18} />} onClick={() => { playTap(); setEditing(blankStaff()); }}>
          إضافة موظف
        </Button>
      </div>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi icon={Users} label="إجمالي الكادر" value={String(staff.length)} />
        <Kpi icon={BadgeCheck} label="نشط" value={String(active)} tone="success" />
        <Kpi icon={PauseCircle} label="موقوف" value={String(staff.length - active)} tone="warn" />
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : staff.length === 0 ? (
        <div className="card grid place-items-center p-12 text-center text-sm text-ink-subtle">
          <Users size={28} className="mb-2 opacity-40" /> لا يوجد موظفون بعد. أضِف أول عضو في الفريق.
        </div>
      ) : (
      <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence initial={false}>
          {staff.map((m) => (
            <motion.div
              key={m.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className={cn("card group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-raised", m.status === "suspended" && "opacity-70")}
            >
              <div className="flex items-center gap-3">
                <Avatar member={m} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display font-bold text-ink">{m.name || "—"}</p>
                  <p className="truncate text-xs text-ink-muted">{m.specialty || ROLE_LABEL[m.role]}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={cn("chip text-2xs font-bold", ROLE_TONE[m.role])}>{ROLE_LABEL[m.role]}</span>
                <span className={cn("chip text-2xs font-semibold", m.status === "active" ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-surface-2 text-ink-muted")}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", m.status === "active" ? "bg-success-500" : "bg-ink-subtle")} />
                  {m.status === "active" ? "نشط" : "موقوف"}
                </span>
              </div>

              <dl className="mt-3 space-y-1.5 text-xs text-ink-muted">
                {m.email && <div className="flex items-center gap-2 truncate"><Mail size={13} className="shrink-0 text-ink-subtle" /> <span dir="ltr" className="truncate">{m.email}</span></div>}
                {m.phone && <div className="flex items-center gap-2"><PhoneIcon size={13} className="shrink-0 text-ink-subtle" /> <span dir="ltr">{m.phone}</span></div>}
                <div className="flex items-center gap-2"><Calendar size={13} className="shrink-0 text-ink-subtle" /> انضمّ في {fmtDate(m.joinDate)}</div>
              </dl>

              {/* Quick actions */}
              <div className="mt-4 flex items-center gap-1.5 border-t border-line pt-3">
                <Button size="sm" variant="secondary" className="flex-1" leftIcon={<Pencil size={14} />} onClick={() => { playTap(); setEditing(m); }}>تعديل</Button>
                <button onClick={() => onToggle(m)} title={m.status === "active" ? "إيقاف" : "تفعيل"} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-warn-50 hover:text-warn-600 dark:hover:bg-warn-500/15">
                  {m.status === "active" ? <PauseCircle size={17} /> : <PlayCircle size={17} />}
                </button>
                <button onClick={() => { playTap(); setDeleting(m); }} title="حذف" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-500/15">
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
      )}

      {/* Profile drawer */}
      <StaffDrawer
        member={editing}
        dir={i18n.dir()}
        onClose={() => setEditing(null)}
        onSaved={onSaved}
        onUploadError={() => toast.error("تعذّر رفع الصورة")}
      />

      {/* Delete confirm */}
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="حذف الموظف"
        size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => setDeleting(null)}>إلغاء</Button>
          <Button variant="danger" leftIcon={<Trash2 size={16} />} onClick={onDelete}>حذف</Button>
        </>}
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300"><Trash2 size={20} /></span>
          <p className="text-sm leading-relaxed text-ink-muted">هل أنت متأكد من حذف «{deleting?.name}» من الكادر؟ لا يمكن التراجع عن هذا الإجراء.</p>
        </div>
      </Dialog>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string; tone?: "success" | "warn" }) {
  const cls = tone === "success" ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300"
    : tone === "warn" ? "bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300"
      : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300";
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", cls)}><Icon size={20} /></span>
      <div className="min-w-0"><p className="text-lg font-bold text-ink tabular-nums">{value}</p><p className="truncate text-xs text-ink-subtle">{label}</p></div>
    </div>
  );
}

function Avatar({ member, size }: { member: StaffMember; size: number }) {
  if (member.avatar) {
    return <img src={member.avatar} alt="" className="shrink-0 rounded-2xl object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span className="grid shrink-0 place-items-center rounded-2xl bg-brand-grad font-display font-bold text-white shadow-soft" style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {initialsOf(member.name) || <Users size={size * 0.4} />}
    </span>
  );
}

/* ---------------- Slide-out profile & permissions drawer ---------------- */
function StaffDrawer({ member, dir, onClose, onSaved, onUploadError }: {
  member: StaffMember | null;
  dir: string;
  onClose: () => void;
  onSaved: (m: StaffMember) => void;
  onUploadError: () => void;
}) {
  const [draft, setDraft] = useState<StaffMember | null>(member);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(member); }, [member]);
  useEffect(() => {
    if (!member) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [member, onClose]);

  const off = dir === "rtl" ? "-100%" : "100%";
  const set = (patch: Partial<StaffMember>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const valid = !!draft?.name.trim();

  const pickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f || !draft) return;
    try { const p = await prepareUpload(f, { maxDim: 512, quality: 0.8 }); set({ avatar: p.dataUrl }); }
    catch { onUploadError(); }
  };

  return createPortal(
    <AnimatePresence>
      {draft && (
        <div className="fixed inset-0 z-50 no-print">
          <motion.div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog" aria-modal="true"
            initial={{ x: off }} animate={{ x: 0 }} exit={{ x: off }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="absolute inset-y-0 end-0 flex w-full max-w-xl flex-col border-s border-line bg-surface-1 shadow-raised"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-line bg-gradient-to-br from-brand-500/10 to-accent-500/5 px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-extrabold text-ink">الملف الوظيفي والصلاحيات</h2>
                <p className="text-xs text-ink-subtle">عرّف بيانات الموظف ودوره وصلاحياته بدقّة.</p>
              </div>
              <button onClick={onClose} aria-label="إغلاق" className="grid h-9 w-9 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-ink"><X size={18} /></button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-5 [scrollbar-width:thin]">
              {/* A) Personal */}
              <Section title="البيانات الشخصية" step="A">
                <div className="flex items-center gap-4">
                  <button type="button" onClick={() => fileRef.current?.click()} className="relative shrink-0" title="تغيير الصورة">
                    <Avatar member={draft} size={64} />
                    <span className="absolute -bottom-1 -end-1 grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-white shadow-soft"><Camera size={14} /></span>
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
                  <div className="flex-1">
                    <label className="label">الاسم الكامل</label>
                    <input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="مثال: د. سارة منصور" autoFocus />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">الهاتف</label>
                    <PhoneInput value={draft.phone} onChange={(v) => set({ phone: v })} />
                  </div>
                  <div>
                    <label className="label">البريد الإلكتروني</label>
                    <input type="email" dir="ltr" className="input" value={draft.email} onChange={(e) => set({ email: e.target.value })} placeholder="name@clinic.vet" />
                  </div>
                </div>
              </Section>

              {/* B) Professional */}
              <Section title="التفاصيل المهنية" step="B">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">التخصص / الشهادة</label>
                    <input className="input" value={draft.specialty} onChange={(e) => set({ specialty: e.target.value })} placeholder="مثال: جراحة عامة" />
                  </div>
                  <div>
                    <label className="label">تاريخ الالتحاق</label>
                    <input type="date" dir="ltr" className="input" value={draft.joinDate} onChange={(e) => set({ joinDate: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="label">نبذة عن الموظف</label>
                  <textarea className="input min-h-[80px]" value={draft.bio} onChange={(e) => set({ bio: e.target.value })} placeholder="خبرة مختصرة، مهارات، ملاحظات…" />
                </div>
              </Section>

              {/* C) Access & roles */}
              <Section title="الصلاحيات والدور" step="C">
                <div>
                  <label className="label">الدور الأساسي</label>
                  <select className="input" value={draft.role} onChange={(e) => set({ role: e.target.value as StaffRole })}>
                    {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </div>

                {/* Read-only capability checklist for the selected role */}
                <div className="rounded-2xl border border-line bg-surface-2/50 p-3">
                  <p className="mb-2 text-xs font-bold text-ink-muted">ما الذي يستطيع «{ROLE_LABEL[draft.role]}» فعله؟</p>
                  <ul className="space-y-1.5">
                    {CAPABILITIES.map((cap) => {
                      const allowed = PERMISSIONS[draft.role].includes(cap.id);
                      return (
                        <li key={cap.id} className="flex items-center gap-2 text-sm">
                          <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full", allowed ? "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-300" : "bg-surface-2 text-ink-subtle")}>
                            {allowed ? <Check size={13} /> : <X size={13} />}
                          </span>
                          <span className={cn(allowed ? "text-ink" : "text-ink-subtle line-through decoration-ink-subtle/40")}>{cap.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Status */}
                <div className="flex items-center justify-between rounded-2xl border border-line p-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-ink">
                    {draft.status === "active" ? <ShieldCheck size={18} className="text-success-600" /> : <ShieldX size={18} className="text-warn-600" />}
                    حالة الحساب
                  </span>
                  <button
                    type="button"
                    onClick={() => set({ status: draft.status === "active" ? "suspended" : "active" })}
                    className={cn("chip text-xs font-semibold transition", draft.status === "active" ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300")}
                  >
                    {draft.status === "active" ? "نشط" : "موقوف"}
                  </button>
                </div>
              </Section>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 border-t border-line p-4">
              <Button variant="ghost" className="flex-1" onClick={onClose}>إلغاء</Button>
              <Button className="flex-1" disabled={!valid} onClick={() => draft && onSaved({ ...draft, name: draft.name.trim() })}>حفظ الملف</Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Section({ title, step, children }: { title: string; step: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-600 text-2xs font-bold text-white">{step}</span>
        <h3 className="font-bold text-ink">{title}</h3>
      </div>
      {children}
    </section>
  );
}
