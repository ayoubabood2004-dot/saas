import { useMemo } from "react";
import { Syringe, Pill, NotebookPen, ClipboardList } from "lucide-react";
import type { Pet, TreatmentEntry, Vaccination, PetNote } from "@/types";
import { getClinicName } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { UniversalReportTable, type ReportColumn } from "@/components/reports/UniversalReportTable";

/* ============================================================================
 * UnifiedMedicalRecord — "الطبلة" الطبية الموحّدة.
 *
 * Mirrors the classic physical veterinary chart: one perfectly chronological
 * table unifying the three fragmented feeds (treatments, vaccinations, clinical
 * notes) into rows of Date/Time · Action type · Details · Attending doctor.
 *
 * The Brains: each source array is normalized into a UnifiedEvent, merged, and
 * sorted newest-first by a real timestamp. The View: the UniversalReportTable
 * engine renders 4 composite (stacked) columns on screen — no horizontal scroll
 * on an iPad — and a granular, white-label A4 document via "طباعة الطبلة".
 * All from the already-loaded dual-adapter cache; no extra fetching.
 * ==========================================================================*/

export type UnifiedEventType = "treatment" | "vaccination" | "note";

export interface UnifiedEvent {
  id: string;
  /** Epoch ms — the sort key (newest first). */
  timestamp: number;
  /** Whether the source carried a real clock time (else we only print the day). */
  hasTime: boolean;
  type: UnifiedEventType;
  /** Medication / vaccine name, or "ملاحظة سريرية" for notes. */
  title: string;
  /** Dose, lot, status and free-text observations / the note body. */
  details: string;
  doctor_name: string;
}

const TYPE_META: Record<UnifiedEventType, { label: string; chip: string; icon: typeof Pill }> = {
  vaccination: { label: "لقاح", chip: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-200", icon: Syringe },
  treatment: { label: "علاج", chip: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200", icon: Pill },
  note: { label: "ملاحظة", chip: "bg-surface-2 text-ink-muted", icon: NotebookPen },
};

/** Parse "YYYY-MM-DD" (+ optional "HH:mm") as LOCAL wall-clock; NaN-safe. */
const localTs = (day: string, time?: string): { ts: number; hasTime: boolean } => {
  const hm = /^\d{1,2}:\d{2}$/.test((time ?? "").trim()) ? (time as string).trim() : null;
  const d = new Date(`${day}T${hm ?? "12:00"}:00`);
  return Number.isNaN(d.getTime()) ? { ts: 0, hasTime: false } : { ts: d.getTime(), hasTime: !!hm };
};

/** ISO datetime → epoch ms; 0 when invalid (sinks to the bottom of the feed). */
const isoTs = (iso?: string | null): number => {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

const VACC_STATUS_AR: Record<string, string> = { scheduled: "مجدول", overdue: "متأخر" };

/** Merge the three clinical feeds into one newest-first timeline. */
export function unifyMedicalEvents(treatments: TreatmentEntry[], vaccinations: Vaccination[], notes: PetNote[]): UnifiedEvent[] {
  const events: UnifiedEvent[] = [];

  for (const t of treatments) {
    const { ts, hasTime } = localTs(t.day, t.time);
    const bits = [t.amount?.trim(), t.observations?.trim(), t.administered_at ? "" : "مجدول — لم يُعطَ بعد"].filter(Boolean);
    events.push({
      id: `t:${t.id}`, timestamp: ts, hasTime, type: "treatment",
      title: t.medication?.trim() || "علاج",
      details: bits.join(" · "),
      doctor_name: (t.doctor ?? t.administered_by ?? "").trim(),
    });
  }

  for (const v of vaccinations) {
    // An administered dose sits at its real datetime; a planned one at its due date.
    const given = !!v.administered_at;
    const ts = given ? isoTs(v.administered_at) : localTs(v.due_date ?? "", undefined).ts;
    if (ts === 0) continue; // no usable date at all — cannot be placed on a timeline
    const bits = [
      v.dose_number != null && v.doses_total != null ? `الجرعة ${v.dose_number}/${v.doses_total}` : null,
      v.lot_number ? `Lot ${v.lot_number}` : null,
      !given ? (VACC_STATUS_AR[v.status] ?? "مجدول") : null,
      v.notes?.trim() || null,
    ].filter(Boolean);
    events.push({
      id: `v:${v.id}`, timestamp: ts, hasTime: given, type: "vaccination",
      title: v.name?.trim() || "لقاح",
      details: bits.join(" · "),
      doctor_name: (v.administered_by ?? "").trim(),
    });
  }

  for (const n of notes) {
    events.push({
      id: `n:${n.id}`, timestamp: isoTs(n.created_at), hasTime: true, type: "note",
      title: "ملاحظة سريرية",
      details: n.note_text,
      doctor_name: (n.author_name ?? "").trim(),
    });
  }

  return events.sort((a, b) => b.timestamp - a.timestamp);
}

/* -------- Western-numeral Arabic date/time formatters (native Intl) -------- */
const fmtDay = (ts: number) => new Date(ts).toLocaleDateString("ar-EG-u-nu-latn", { day: "2-digit", month: "long", year: "numeric" });
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("ar-EG-u-nu-latn", { hour: "2-digit", minute: "2-digit", hour12: true });
const fmtFull = (e: UnifiedEvent) => (e.hasTime ? `${fmtDay(e.timestamp)}، ${fmtTime(e.timestamp)}` : fmtDay(e.timestamp));

export function UnifiedMedicalRecord({ pet, treatments, vaccinations, notes }: {
  pet: Pet; treatments: TreatmentEntry[]; vaccinations: Vaccination[]; notes: PetNote[];
}) {
  const events = useMemo(() => unifyMedicalEvents(treatments, vaccinations, notes), [treatments, vaccinations, notes]);

  // Granular columns — drive the printed A4 chart + the Excel export.
  const columns: ReportColumn<UnifiedEvent>[] = [
    { key: "when", header: "اليوم والساعة", cell: (e) => fmtFull(e), printCell: (e) => fmtFull(e), excelValue: (e) => fmtFull(e) },
    { key: "type", header: "نوع الإجراء", cell: (e) => TYPE_META[e.type].label, excelValue: (e) => TYPE_META[e.type].label },
    { key: "title", header: "الإجراء / العلاج", cell: (e) => e.title, excelValue: (e) => e.title },
    { key: "details", header: "التفاصيل والملاحظات", cell: (e) => e.details || "—", excelValue: (e) => e.details || "—" },
    { key: "doctor", header: "الطبيب المعالج", cell: (e) => e.doctor_name || "—", excelValue: (e) => e.doctor_name || "—" },
  ];

  // Composite (stacked) columns — the on-screen table: 4 columns, iPad-safe.
  const screenColumns: ReportColumn<UnifiedEvent>[] = [
    {
      key: "when", header: "اليوم والساعة", cell: (e) => (
        <div className="leading-tight">
          <div className="font-semibold text-ink">{fmtDay(e.timestamp)}</div>
          {e.hasTime && <div className="text-2xs text-ink-subtle">{fmtTime(e.timestamp)}</div>}
        </div>
      ),
    },
    {
      key: "type", header: "نوع الإجراء", cell: (e) => {
        const m = TYPE_META[e.type]; const Icon = m.icon;
        // The icon shows only on wide screens — on an iPad the passport's center column
        // is narrow, and the compact label-only pill keeps the table free of h-scroll.
        return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-2xs font-bold", m.chip)}><Icon size={12} className="hidden xl:inline" /> {m.label}</span>;
      },
    },
    {
      key: "body", header: "التفاصيل والملاحظات", cell: (e) => (
        <div className="min-w-0 max-w-[340px] break-words">
          {e.type !== "note" && <p className="font-semibold text-ink">{e.title}</p>}
          {e.details && <p className="whitespace-pre-wrap text-2xs leading-relaxed text-ink-muted">{e.details}</p>}
        </div>
      ),
    },
    { key: "doctor", header: "الطبيب المعالج", cell: (e) => <span className="break-words text-ink-muted">{e.doctor_name || "—"}</span> },
  ];

  return (
    <UniversalReportTable<UnifiedEvent>
      title={`الطبلة الطبية الموحّدة — ${pet.name}`}
      clinicName={getClinicName()}
      dateRangeLabel={`المريض: ${pet.name} · الرقم التسلسلي: ${pet.serial}${pet.owner_name ? ` · المالك: ${pet.owner_name}` : ""}`}
      printButtonLabel="طباعة الطبلة"
      exportFileName={`doctorvet-chart-${pet.serial}`}
      columns={columns}
      screenColumns={screenColumns}
      data={events}
      rowKey={(e) => e.id}
      pageSize={30}
      emptyText="لا توجد أحداث طبية مسجّلة لهذا الحيوان بعد."
      toolbar={
        <p className="flex items-center gap-1.5 text-2xs text-ink-subtle">
          <ClipboardList size={13} className="text-brand-600" />
          سجلّ موحّد يجمع العلاجات واللقاحات والملاحظات السريرية زمنياً — الأحدث أولاً.
        </p>
      }
    />
  );
}
