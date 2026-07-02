import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Syringe, Pill, NotebookPen, ClipboardList } from "lucide-react";
import type { Pet, TreatmentEntry, Vaccination, PetNote } from "@/types";
import { getClinicName } from "@/lib/settings";
import { medicationDisplay } from "@/lib/meds";
import { vaccineScientific } from "@/lib/vaccines";
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
 *
 * Owner privacy: when the viewer is the pet's owner, medication names follow
 * the same masking policy as the flowsheet (medicationDisplay — exact name for
 * 7 days, then the therapeutic class) and vaccines show their scientific name,
 * so the unified view/print/export never leaks more than the sibling tabs.
 * ==========================================================================*/

export type UnifiedEventType = "treatment" | "vaccination" | "note";

export interface UnifiedEvent {
  id: string;
  /** Epoch ms — the sort key (newest first). 0 = unplaceable (sinks to the bottom). */
  timestamp: number;
  /** Whether the source carried a real clock time (else only the day is shown). */
  hasTime: boolean;
  type: UnifiedEventType;
  /** Medication / vaccine name (owner-masked), or the note marker. */
  title: string;
  /** Dose, lot, status and free-text observations / the note body. */
  details: string;
  doctor_name: string;
}

const TYPE_CHIP: Record<UnifiedEventType, { chip: string; icon: typeof Pill }> = {
  vaccination: { chip: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-200", icon: Syringe },
  treatment: { chip: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200", icon: Pill },
  note: { chip: "bg-surface-2 text-ink-muted", icon: NotebookPen },
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse "YYYY-MM-DD" (+ optional "H:mm"/"HH:mm") as LOCAL wall-clock; NaN-safe.
 *  Exported so the interactive timeline feed places events on the exact same axis. */
export const localTs = (day: string, time?: string): { ts: number; hasTime: boolean } => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time ?? "").trim());
  const hm = m ? `${m[1].padStart(2, "0")}:${m[2]}` : null; // "8:30" → "08:30" (Invalid Date otherwise)
  const d = new Date(`${day}T${hm ?? "12:00"}:00`);
  return Number.isNaN(d.getTime()) ? { ts: 0, hasTime: false } : { ts: d.getTime(), hasTime: !!m };
};

/** ISO datetime → epoch ms; 0 when invalid (sinks to the bottom of the feed). */
export const isoTs = (iso?: string | null): number => {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** Timeline position for a vaccination: an administered dose sits at its real moment
 *  (date-only columns anchored to local noon, never UTC-midnight); a planned one at
 *  its due date. Shared by the summary chart and the interactive feed. */
export const vaccinationTs = (v: Vaccination): { ts: number; hasTime: boolean } => {
  if (v.administered_at) {
    const raw = String(v.administered_at).trim();
    if (DATE_ONLY_RE.test(raw)) return { ts: localTs(raw).ts, hasTime: false };
    const ts = isoTs(raw);
    return { ts, hasTime: ts > 0 };
  }
  return { ts: v.due_date ? localTs(v.due_date).ts : 0, hasTime: false };
};

interface UnifyOptions {
  /** Owner view → mask medication names + show scientific vaccine names. */
  isOwner?: boolean;
  /** i18n strings for status/labels so the feed stays bilingual. */
  labels: { note: string; scheduled: string; missed: string; overdue: string; dose: (n: number, total: number) => string };
}

/** Merge the three clinical feeds into one newest-first timeline. */
export function unifyMedicalEvents(
  treatments: TreatmentEntry[], vaccinations: Vaccination[], notes: PetNote[], opts: UnifyOptions,
): UnifiedEvent[] {
  const { isOwner = false, labels } = opts;
  const now = Date.now();
  const events: UnifiedEvent[] = [];

  for (const t of treatments) {
    const { ts, hasTime } = localTs(t.day, t.time);
    // A dose that was never marked given: scheduled while its slot is ahead, missed once past.
    const pendingLabel = t.administered_at ? "" : (ts !== 0 && ts < now ? labels.missed : labels.scheduled);
    const bits = [t.amount?.trim(), t.observations?.trim(), pendingLabel].filter(Boolean);
    events.push({
      id: `t:${t.id}`, timestamp: ts, hasTime, type: "treatment",
      title: medicationDisplay(t.medication?.trim() || "—", t.day, isOwner),
      details: bits.join(" · "),
      doctor_name: (t.doctor ?? t.administered_by ?? "").trim(),
    });
  }

  for (const v of vaccinations) {
    const given = !!v.administered_at;
    const { ts, hasTime } = vaccinationTs(v);
    if (ts === 0) continue; // no usable date at all — cannot be placed on a timeline
    const bits = [
      v.dose_number != null && v.doses_total != null ? labels.dose(v.dose_number, v.doses_total) : null,
      v.lot_number ? `Lot ${v.lot_number}` : null,
      !given ? (v.status === "overdue" ? labels.overdue : labels.scheduled) : null,
      v.notes?.trim() || null,
    ].filter(Boolean);
    events.push({
      id: `v:${v.id}`, timestamp: ts, hasTime, type: "vaccination",
      title: isOwner ? vaccineScientific(v.name?.trim() || "—") : (v.name?.trim() || "—"),
      details: bits.join(" · "),
      doctor_name: (v.administered_by ?? "").trim(),
    });
  }

  for (const n of notes) {
    const ts = isoTs(n.created_at);
    events.push({
      id: `n:${n.id}`, timestamp: ts, hasTime: ts > 0, type: "note",
      title: labels.note,
      details: n.note_text,
      doctor_name: (n.author_name ?? "").trim(),
    });
  }

  return events.sort((a, b) => b.timestamp - a.timestamp);
}

/* -------- Western-numeral Arabic date/time formatters (native Intl) -------- */
const fmtDay = (ts: number) => (ts <= 0 ? "—" : new Date(ts).toLocaleDateString("ar-EG-u-nu-latn", { day: "2-digit", month: "long", year: "numeric" }));
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("ar-EG-u-nu-latn", { hour: "2-digit", minute: "2-digit", hour12: true });
const fmtFull = (e: UnifiedEvent) => (e.timestamp <= 0 ? "—" : e.hasTime ? `${fmtDay(e.timestamp)}، ${fmtTime(e.timestamp)}` : fmtDay(e.timestamp));

export function UnifiedMedicalRecord({ pet, treatments, vaccinations, notes, isOwner = false, printOnly = false, tableOnly = false }: {
  pet: Pet; treatments: TreatmentEntry[]; vaccinations: Vaccination[]; notes: PetNote[]; isOwner?: boolean;
  /** Render only the "طباعة الطبلة"/Excel action buttons + the print portal (no on-screen
   *  table) — lets the interactive workspace keep the A4 chart & export without the summary grid. */
  printOnly?: boolean;
  /** Render only the dense on-screen chart table (no header/buttons) — the "جدول" view of
   *  the interactive workspace, which supplies its own header + print buttons. */
  tableOnly?: boolean;
}) {
  const { t } = useTranslation();

  const typeLabel: Record<UnifiedEventType, string> = {
    vaccination: t("chart.typeVaccine", "لقاح"),
    treatment: t("chart.typeTreatment", "علاج"),
    note: t("chart.typeNote", "ملاحظة"),
  };

  const events = useMemo(() => unifyMedicalEvents(treatments, vaccinations, notes, {
    isOwner,
    labels: {
      note: t("chart.clinicalNote", "ملاحظة سريرية"),
      scheduled: t("chart.scheduled", "مجدول — لم يُعطَ بعد"),
      missed: t("chart.missed", "لم يُعطَ (فائت)"),
      overdue: t("chart.overdue", "متأخر"),
      dose: (n, total) => t("chart.dose", { n, total, defaultValue: "الجرعة {{n}}/{{total}}" }),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [treatments, vaccinations, notes, isOwner, t]);

  // Granular columns — drive the printed A4 chart + the Excel export.
  const columns: ReportColumn<UnifiedEvent>[] = [
    { key: "when", header: t("chart.colWhen", "اليوم والساعة"), cell: (e) => fmtFull(e), excelValue: (e) => fmtFull(e) },
    { key: "type", header: t("chart.colType", "نوع الإجراء"), cell: (e) => typeLabel[e.type], excelValue: (e) => typeLabel[e.type] },
    { key: "title", header: t("chart.colAction", "الإجراء / العلاج"), cell: (e) => e.title, excelValue: (e) => e.title },
    {
      key: "details", header: t("chart.colDetails", "التفاصيل والملاحظات"),
      cell: (e) => e.details || "—",
      // Print keeps the note's line breaks — a faithful physical-chart replica.
      printCell: (e) => <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{e.details || "—"}</span>,
      excelValue: (e) => e.details || "—",
    },
    { key: "doctor", header: t("chart.colDoctor", "الطبيب المعالج"), cell: (e) => e.doctor_name || "—", excelValue: (e) => e.doctor_name || "—" },
  ];

  // Composite (stacked) columns — the on-screen table: 4 columns, iPad-safe.
  const screenColumns: ReportColumn<UnifiedEvent>[] = [
    {
      key: "when", header: t("chart.colWhen", "اليوم والساعة"), cell: (e) => (
        <div className="leading-tight">
          <div className="font-semibold text-ink">{fmtDay(e.timestamp)}</div>
          {e.timestamp > 0 && e.hasTime && <div className="text-2xs text-ink-subtle">{fmtTime(e.timestamp)}</div>}
        </div>
      ),
    },
    {
      key: "type", header: t("chart.colType", "نوع الإجراء"), cell: (e) => {
        const m = TYPE_CHIP[e.type]; const Icon = m.icon;
        // The icon shows only on wide screens — on an iPad the passport's center column
        // is narrow, and the compact label-only pill keeps the table free of h-scroll.
        return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-2xs font-bold", m.chip)}><Icon size={12} className="hidden xl:inline" /> {typeLabel[e.type]}</span>;
      },
    },
    {
      key: "body", header: t("chart.colDetails", "التفاصيل والملاحظات"), cell: (e) => (
        <div className="min-w-0 max-w-[340px] [overflow-wrap:anywhere]">
          {e.type !== "note" && <p className="font-semibold text-ink">{e.title}</p>}
          {e.details && <p className="whitespace-pre-wrap text-2xs leading-relaxed text-ink-muted">{e.details}</p>}
        </div>
      ),
    },
    { key: "doctor", header: t("chart.colDoctor", "الطبيب المعالج"), cell: (e) => <span className="[overflow-wrap:anywhere] text-ink-muted">{e.doctor_name || "—"}</span> },
  ];

  const subtitle = t("chart.subtitle", { name: pet.name, serial: pet.serial, defaultValue: "المريض: {{name}} · الرقم التسلسلي: {{serial}}" })
    + (pet.owner_name ? ` · ${t("chart.ownerPrefix", "المالك")}: ${pet.owner_name}` : "");

  return (
    <UniversalReportTable<UnifiedEvent>
      title={`${t("chart.title", "الطبلة الطبية الموحّدة")} — ${pet.name}`}
      clinicName={getClinicName()}
      dateRangeLabel={subtitle}
      printButtonLabel={t("chart.print", "طباعة الطبلة")}
      exportFileName={`doctorvet-chart-${pet.serial}`}
      columns={columns}
      screenColumns={screenColumns}
      data={events}
      rowKey={(e) => e.id}
      pageSize={30}
      printOnly={printOnly}
      tableOnly={tableOnly}
      emptyText={t("chart.empty", "لا توجد أحداث طبية مسجّلة لهذا الحيوان بعد.")}
      toolbar={
        <p className="flex items-center gap-1.5 text-2xs text-ink-subtle">
          <ClipboardList size={13} className="text-brand-600" />
          {t("chart.hint", "سجلّ موحّد يجمع العلاجات واللقاحات والملاحظات السريرية زمنياً — الأحدث أولاً.")}
        </p>
      }
    />
  );
}
