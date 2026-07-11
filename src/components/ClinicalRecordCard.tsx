import { useState } from "react";
import { ChevronDown, AlertTriangle, ShieldAlert, Biohazard, Paperclip } from "lucide-react";
import type { ClinicalRecord } from "@/lib/clinicalRecord";
import { Glyph, GlyphMark, glyphTone, glyphToneText } from "@/lib/clinicalIcons";
import { SEVERITIES } from "@/lib/diagnoses";
import { symptomById, symptomLabel, OUTCOMES } from "@/lib/clinicalKnowledge";
import { cbcById, FLAG_ARROW } from "@/lib/cbc";
import { formatNum, cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

const OUTCOME_BADGE: Record<string, string> = {
  brand: "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  success: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  warn: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300",
  danger: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300",
};
const sevMeta = (s: string) => SEVERITIES.find((x) => x.id === s);

/** A journey node: coloured glyph on a spine + titled content. */
function Node({ icon, color, title, children, last }: { icon: string; color: string; title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className="relative flex gap-3 pb-3">
      {!last && <span className="absolute top-9 h-[calc(100%-1.75rem)] w-0.5 bg-line ltr:left-[17px] rtl:right-[17px]" />}
      <span className={cn("z-10 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white shadow-soft", color)}>
        <GlyphMark name={icon} size={18} className="text-white" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-2xs font-extrabold uppercase tracking-wide text-ink-subtle">{title}</div>
        <div className="mt-1 text-sm leading-relaxed text-ink">{children}</div>
      </div>
    </div>
  );
}

/**
 * Renders a saved diagnosis & treatment plan as an ORGANISED card: a tidy
 * one-line summary that expands into a colour-coded vertical "journey"
 * (focus → symptoms → diagnosis → treatment → labs → outcome). Replaces the
 * old wall-of-text note in the timeline.
 */
export function ClinicalRecordCard({ record, compact = false, className }: { record: ClinicalRecord; compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(!compact);
  const outcome = record.outcome ? OUTCOMES.find((o) => o.id === record.outcome) : null;
  const dxN = record.diagnoses?.length ?? 0;
  const medN = record.treatment?.length ?? 0;
  const warnN = (record.redFlags?.length ?? 0) + (record.zoonotic?.length ?? 0) + (record.reportable?.length ?? 0);
  const firstDxSystem = record.diagnoses?.[0]?.system;

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-brand-200/70 bg-surface-1 dark:border-brand-500/25", className)}>
      {/* Summary header — always visible, tap to expand */}
      <button
        type="button"
        onClick={() => { playTap(); setOpen((o) => !o); }}
        className="flex w-full items-center gap-2.5 bg-gradient-to-l from-brand-50/70 to-transparent p-3 text-start transition hover:from-brand-50 dark:from-brand-500/10"
      >
        <Glyph name={firstDxSystem ?? "general"} size={30} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-extrabold text-ink">التشخيص وخطة العلاج</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-2xs font-semibold text-ink-muted">
            {dxN > 0 && <span>{formatNum(dxN)} تشخيص</span>}
            {medN > 0 && <span>{formatNum(medN)} دواء</span>}
            {record.cbc?.length ? <span>CBC</span> : null}
            {warnN > 0 && <span className="text-danger-600 dark:text-danger-400">⚠ {formatNum(warnN)} تنبيه</span>}
            {record.hasPhoto && <span className="inline-flex items-center gap-0.5"><Paperclip size={11} /> صورة</span>}
          </div>
        </div>
        {outcome && (
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-extrabold", OUTCOME_BADGE[outcome.tone])}>
            <GlyphMark name={outcome.id} size={14} /> {outcome.label}
          </span>
        )}
        <ChevronDown size={18} className={cn("shrink-0 text-ink-subtle transition-transform", open && "rotate-180")} />
      </button>

      {/* Expanded journey */}
      {open && (
        <div className="space-y-0 border-t border-line p-3.5">
          {record.focus && (
            <Node icon="eyes" color="bg-indigo-500" title="التركيز التشريحي">
              {record.focus.structure ?? record.focus.region}
              {record.focus.latin && <span className="text-ink-subtle"> — <i>{record.focus.latin}</i></span>}
            </Node>
          )}

          {record.symptoms?.length ? (
            <Node icon="fever" color="bg-rose-500" title="الأعراض">
              <span className="flex flex-wrap gap-1.5">
                {record.symptoms.map((id) => {
                  const qm = record.qualifiers?.[id];
                  const sym = symptomById(id);
                  const summary = qm && sym?.qualifiers ? sym.qualifiers.map((ax) => qm[ax.id]).filter(Boolean).join("، ") : "";
                  return (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-0.5 pe-2 ps-0.5 text-2xs font-bold">
                      <Glyph name={id} size={16} /> {symptomLabel(id)}
                      {summary && <span className="font-semibold text-brand-600 dark:text-brand-300">· {summary}</span>}
                    </span>
                  );
                })}
              </span>
            </Node>
          ) : null}

          {dxN > 0 && (
            <Node icon={firstDxSystem ?? "general"} color="bg-brand-600" title="التشخيص">
              <span className="flex flex-wrap gap-1.5">
                {record.diagnoses!.map((d) => {
                  const sev = sevMeta(d.severity);
                  return (
                    <span key={`${d.system}:${d.disease}`} className={cn("inline-flex items-center gap-1.5 rounded-full py-1 pe-1 ps-1.5 text-2xs font-bold", sev?.chip)}>
                      <Glyph name={d.system} size={17} /> {d.disease}
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] dark:bg-black/20">
                        <span className={cn("h-1.5 w-1.5 rounded-full", sev?.dot)} /> {sev?.label}
                      </span>
                    </span>
                  );
                })}
              </span>
              {record.pathogens?.length ? (
                <div className="mt-1.5 space-y-0.5 text-2xs text-ink-subtle">
                  {record.pathogens.map((p) => <div key={p.name}>↳ {p.name} — <i>{p.latin}</i></div>)}
                </div>
              ) : null}
            </Node>
          )}

          {/* Warnings */}
          {record.reportable?.length ? <Banner tone="danger" icon={ShieldAlert} title="واجب التبليغ">{record.reportable.join("، ")}</Banner> : null}
          {record.zoonotic?.length ? <Banner tone="warn" icon={Biohazard} title="ينتقل للإنسان">{record.zoonotic.join("، ")}</Banner> : null}
          {record.redFlags?.map((f) => <Banner key={f.name} tone="danger" icon={AlertTriangle} title={f.name}>{f.note}</Banner>)}

          {medN > 0 && (
            <Node icon="under_treatment" color="bg-brand-600" title="خطة العلاج">
              <div className="overflow-hidden rounded-xl border border-line">
                <table className="w-full text-2xs">
                  <thead className="bg-surface-2 text-ink-subtle">
                    <tr>
                      <th className="p-1.5 text-start font-bold">الدواء</th>
                      <th className="p-1.5 text-start font-bold">الجرعة</th>
                      <th className="p-1.5 text-start font-bold">التكرار</th>
                      <th className="p-1.5 text-start font-bold">المدة</th>
                      <th className="p-1.5 text-center font-bold">جرعات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.treatment!.map((m, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="p-1.5 font-bold text-ink">{m.name}</td>
                        <td className="p-1.5 text-ink-muted">{m.dose || "—"}</td>
                        <td className="p-1.5 text-ink-muted">{m.freq}</td>
                        <td className="p-1.5 text-ink-muted tabular-nums">{m.doses ? `${formatNum(m.days)} يوم` : "—"}</td>
                        <td className="p-1.5 text-center">
                          {m.doses ? <span className="inline-block rounded-full bg-success-50 px-2 py-0.5 font-extrabold text-success-700 dark:bg-success-500/15 dark:text-success-300">{formatNum(m.doses)}</span> : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Node>
          )}

          {record.interactions?.map((it, i) => (
            <Banner key={`ix${i}`} tone={it.severity === "major" ? "danger" : "warn"} icon={AlertTriangle} title={`تداخل: ${it.a} + ${it.b}`}>{it.note}</Banner>
          ))}

          {record.cbc?.length ? (
            <Node icon="bloody_stool" color="bg-cyan-600" title="تحليل الدم (CBC)">
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {record.cbc.map((c) => {
                  const p = cbcById(c.id);
                  const color = c.flag === "high" ? "text-danger-600 dark:text-danger-400" : c.flag === "low" ? "text-brand-600 dark:text-brand-300" : "text-ink";
                  return (
                    <span key={c.id} className="inline-flex items-center gap-1 tabular-nums">
                      <b className="text-ink">{p?.abbr}</b>
                      <span className={cn("font-bold", color)}>{formatNum(Number(c.value.toFixed((p?.step ?? 1) < 1 ? 1 : 0)))} {FLAG_ARROW[c.flag]}</span>
                    </span>
                  );
                })}
                {record.hasPhoto && <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-2xs font-bold text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"><Paperclip size={11} /> صورة التحليل</span>}
              </span>
            </Node>
          ) : null}

          {outcome && (
            <Node icon={outcome.id} color="bg-slate-500" title="نتيجة الحالة" last>
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold", OUTCOME_BADGE[outcome.tone])}>
                <GlyphMark name={outcome.id} size={15} className={glyphToneText(glyphTone(outcome.id) ?? "blue")} /> {outcome.label}
              </span>
            </Node>
          )}
        </div>
      )}
    </div>
  );
}

const TONE_CLASS: Record<string, string> = {
  danger: "border-danger-200 bg-danger-50 text-danger-800 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-200",
  warn: "border-warn-200 bg-warn-50 text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200",
};
function Banner({ tone, icon: Icon, title, children }: { tone: "danger" | "warn"; icon: typeof AlertTriangle; title: string; children: React.ReactNode }) {
  return (
    <div className={cn("mb-3 flex items-start gap-2 rounded-xl border p-2.5 text-2xs leading-relaxed", TONE_CLASS[tone])}>
      <Icon size={15} className="mt-0.5 shrink-0" />
      <div><b className="font-extrabold">{title}</b> — {children}</div>
    </div>
  );
}
