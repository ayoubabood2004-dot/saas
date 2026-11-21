// ============================================================================
// استيرادُ مكتبة الصور من إكسل — لوحةٌ بشاشة المكتبة (رفيقُ ImageLibraryManager بالنطاق `libm`).
//
// الملفُّ يُقرأ بالمتصفّح (src/lib/libraryImport.ts)، ثمّ **خطّةٌ تُرى قبل أيّ رفع**: كم جديدة، كم موجودة
// تُتخطّى، كم مكرّرة بالملف، كم صفٍّ بلا صورة، وكم رمزاً داخلياً لا يُحفظ باركوداً — بالوكالات والأقسام.
// والرفعُ ثلاثٌ بالمرّة، ويقف بضغطة، ويقف وحده عند انقطاع الشبكة أو قاعدةٍ قبل 0284/0285 (عمودٌ غائب): ما رُفع
// باقٍ، والضغطةُ التالية تعيد الخطّةَ على المكتبة كما صارت فتكمل من حيث وقف — بلا صورةٍ مكرّرة.
// والمكتبةُ التي يُرفع لها من المضيف (`create`): العامّةُ بلوحة المنصّة، أو مكتبةُ العيادة داخل النظام (0285) —
// و`library` صفوفُ تلك المكتبة وحدها، فالتكرارُ يُقاس بها لا بالأخرى.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet, Upload, Square, Loader2 } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { prepareUpload, type PreparedUpload } from "@/lib/image";
import { describeDbError, isNetworkError } from "@/lib/errors";
import { holdUntil } from "@/lib/inflight";
import { cn, formatNum } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import {
  openZip, readWorkbook, guessColumns, planImport, mediaType, XlsxError,
  type ZipReader, type ParsedSheet, type ImportPlan, type PlanItem,
} from "@/lib/libraryImport";
import { isLibraryColumnMissing } from "@/lib/libraryScope";
import type { LibraryImage } from "@/types";

type Run = { done: number; total: number; failed: number; firstError: string | null; stopped: null | "user" | "network" | "dbOld" };

type Meta = { name: string; company: string; kind: string; agency: string | null; section: string | null; barcode: string | null };

export function LibraryImport({ library, onChanged, create, scope = "public" }: {
  library: LibraryImage[];
  onChanged: () => void;
  /** الإدراجُ بالمكتبة المقصودة — العامّة (`createLibraryImage`) أو مكتبة العيادة (`createClinicLibraryImage`). */
  create: (meta: Meta, photo: PreparedUpload) => Promise<unknown>;
  scope?: "public" | "clinic";
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [readErr, setReadErr] = useState<string | null>(null);
  const [zip, setZip] = useState<ZipReader | null>(null);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetIx, setSheetIx] = useState(0);
  const [company, setCompany] = useState("");
  const [kind, setKind] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const stopRef = useRef(false);

  // الإغلاقُ أثناء الرفع يُسأل عنه — الرفعُ يكمل من حيث وقف، لكن الإغلاقَ غيرُ المقصود يُضيّع وقتاً.
  useEffect(() => {
    if (!busy) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [busy]);

  const companies = useMemo(() => [...new Set(library.map((r) => r.company?.trim()).filter(Boolean))] as string[], [library]);
  const kinds = useMemo(() => [...new Set(library.map((r) => r.kind?.trim()).filter(Boolean))] as string[], [library]);

  const sheet = sheets[sheetIx] ?? null;
  const cols = useMemo(() => (sheet ? guessColumns(sheet.headers) : null), [sheet]);
  const plan: ImportPlan | null = useMemo(
    () => (sheet && cols && company.trim() && kind.trim() ? planImport(sheet, cols, { company: company.trim(), kind: kind.trim() }, library) : null),
    [sheet, cols, company, kind, library],
  );

  const errText = (e: unknown) =>
    e instanceof XlsxError ? t(`libm.err.${e.code}`) : describeDbError(e, t);

  const pick = async (file: File) => {
    playTap();
    setReading(true); setReadErr(null); setSheets([]); setZip(null); setRun(null); setFileName(file.name);
    try {
      const z = openZip(await file.arrayBuffer());
      const s = await readWorkbook(z);
      setZip(z); setSheets(s); setSheetIx(Math.max(0, s.findIndex((x) => x.rows.length > 0)));
    } catch (e) {
      playWarning();
      setReadErr(errText(e));
    } finally { setReading(false); }
  };

  const upload = async () => {
    if (!plan || !zip || busy) return;
    const todo = plan.items.filter((i) => i.status === "new");
    if (todo.length === 0) return;
    playTap();
    stopRef.current = false;
    setBusy(true);
    const state: Run = { done: 0, total: todo.length, failed: 0, firstError: null, stopped: null };
    setRun({ ...state });
    let next = 0;
    const one = async (it: PlanItem) => {
      const bytes = await zip.read(it.image as string);
      const type = mediaType(it.image as string);
      const file = new File([bytes as BlobPart], `p.${type.split("/")[1]}`, { type });
      const photo = await prepareUpload(file, { maxDim: 800, quality: 0.72 });
      await create({
        name: it.name, company: company.trim(), kind: kind.trim(), agency: it.agency, section: it.section, barcode: it.barcode,
      }, photo);
    };
    const worker = async () => {
      while (!stopRef.current && !state.stopped) {
        const i = next++;
        if (i >= todo.length) return;
        try {
          await one(todo[i]);
          state.done++;
        } catch (e) {
          if (isNetworkError(e)) { state.stopped = "network"; return; }
          if (isLibraryColumnMissing(e)) { state.stopped = "dbOld"; return; }
          state.failed++;
          state.firstError ??= errText(e);
        }
        setRun({ ...state });
      }
    };
    try {
      await holdUntil(Promise.all([worker(), worker(), worker()]));
    } finally {
      if (stopRef.current && !state.stopped) state.stopped = "user";
      setRun({ ...state });
      setBusy(false);
      onChanged();   // المكتبةُ تُقرأ من جديد ⇒ الخطّةُ تُعاد عليها: المرفوعُ «موجود» ويُتخطّى
    }
    if (state.stopped === "network" || state.stopped === "dbOld") playWarning();
    else if (!state.stopped && state.failed === 0) { playSuccess(); toast.success(t("libm.done", { n: formatNum(state.done) })); }
  };

  const colLabel = (i: number | null) => (i == null || !sheet ? "—" : `«${sheet.headers[i] || "?"}»`);
  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 0;

  return (
    <div className="card space-y-3 p-4" data-libimport>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-ink"><FileSpreadsheet size={16} className="text-success-600" /> {t("libm.importTitle")}</h3>
          <p className="mt-0.5 text-2xs text-ink-subtle">{t("libm.importHint")}</p>
        </div>
        <Button size="sm" variant="secondary" leftIcon={reading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
          disabled={reading || busy} onClick={() => { playTap(); fileRef.current?.click(); }} data-libimport-pick>
          {reading ? t("libm.reading") : t("libm.pickFile")}
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
      </div>

      {readErr && <p className="rounded-xl bg-danger-50 px-3 py-2 text-sm font-semibold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300" data-libimport-err>{readErr}</p>}

      {sheet && (
        <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-3">
          <p className="text-2xs font-bold text-ink-muted" dir="auto">{fileName}</p>
          {sheets.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {sheets.map((s, i) => (
                <button key={i} onClick={() => { playTap(); setSheetIx(i); }} disabled={busy}
                  className={cn("rounded-full px-3 py-1 text-2xs font-bold", i === sheetIx ? "bg-brand-600 text-white" : "bg-surface-1 text-ink-muted")}>
                  {s.name} · {formatNum(s.rows.length)}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-2xs font-bold text-ink-muted">{t("libm.companyFor")}</span>
              <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} list="libm-companies" disabled={busy} data-libimport-company />
            </label>
            <label className="space-y-1">
              <span className="text-2xs font-bold text-ink-muted">{t("libm.kindFor")}</span>
              <input className="input" value={kind} onChange={(e) => setKind(e.target.value)} list="libm-kinds" placeholder={t("libm.kindPh")} disabled={busy} data-libimport-kind />
            </label>
            <datalist id="libm-companies">{companies.map((c) => <option key={c} value={c} />)}</datalist>
            <datalist id="libm-kinds">{kinds.map((k) => <option key={k} value={k} />)}</datalist>
          </div>

          {!cols ? (
            <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">{t("libm.err.no_name_column")}</p>
          ) : (
            <p className="text-2xs text-ink-muted" data-libimport-cols>
              {t("libm.cols", { name: colLabel(cols.name), agency: colLabel(cols.agency), section: colLabel(cols.section), barcode: colLabel(cols.barcode) })}
            </p>
          )}

          {cols && !plan && <p className="text-2xs font-bold text-warn-700">{t("libm.needCompanyKind")}</p>}

          {plan && (
            <div className="space-y-2" data-libimport-plan>
              <ul className="space-y-0.5 text-sm">
                <li className="font-extrabold text-ink" data-plan-new={plan.counts.new}>{t("libm.planNew", { n: formatNum(plan.counts.new) })}</li>
                {plan.counts.exists > 0 && <li className="text-ink-muted">{t("libm.planExists", { n: formatNum(plan.counts.exists) })}</li>}
                {plan.counts.dupInFile > 0 && <li className="text-ink-muted">{t("libm.planDup", { n: formatNum(plan.counts.dupInFile) })}</li>}
                {plan.counts.noImage > 0 && <li className="text-warn-700">{t("libm.planNoImage", { n: formatNum(plan.counts.noImage) })}</li>}
                {plan.counts.noName > 0 && <li className="text-warn-700">{t("libm.planNoName", { n: formatNum(plan.counts.noName) })}</li>}
                {plan.droppedCodes > 0 && <li className="text-2xs text-ink-subtle">{t("libm.planCodes", { n: formatNum(plan.droppedCodes) })}</li>}
              </ul>
              {plan.counts.new > 0 && (
                <>
                  <p className="text-2xs font-bold text-ink-muted">{t("libm.planAgencies", { n: formatNum(plan.agencies.size) })}</p>
                  <div className="flex flex-wrap gap-1">
                    {[...plan.agencies.entries()].sort((a, b) => b[1] - a[1]).map(([a, n]) => (
                      <span key={a ?? ""} className="rounded-full bg-surface-1 px-2 py-0.5 text-2xs font-bold text-ink-muted" dir="auto">
                        {a ?? t("libm.noAgency")} · {formatNum(n)}
                      </span>
                    ))}
                  </div>
                  <p className="text-2xs font-bold text-ink-muted">{t("libm.planSections", { n: formatNum(plan.sections.size) })}</p>
                  <div className="flex flex-wrap gap-1">
                    {[...plan.sections.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                      <span key={s ?? ""} className="rounded-full bg-surface-1 px-2 py-0.5 text-2xs font-bold text-ink-muted" dir="auto">
                        {s ?? t("libm.noSection")} · {formatNum(n)}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {run && (
            <div className="space-y-1" data-libimport-run>
              <div className="h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} /></div>
              <p className="text-2xs font-bold text-ink-muted">
                {busy ? t("libm.uploading", { done: formatNum(run.done), n: formatNum(run.total) })
                  : run.stopped === "network" ? t("libm.network")
                  : run.stopped === "dbOld" ? (scope === "clinic" ? t("libm.dbOldClinic") : t("libm.dbOld"))
                  : run.stopped === "user" ? t("libm.stopped", { done: formatNum(run.done), n: formatNum(run.total) })
                  : t("libm.done", { n: formatNum(run.done) })}
              </p>
              {run.failed > 0 && <p className="text-2xs font-bold text-warn-700">{t("libm.failedSome", { n: formatNum(run.failed) })}{run.firstError ? ` — ${run.firstError}` : ""}</p>}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {busy ? (
              <Button size="sm" variant="secondary" leftIcon={<Square size={14} />} onClick={() => { playTap(); stopRef.current = true; }} data-libimport-stop>
                {t("libm.stop")}
              </Button>
            ) : (
              <Button size="sm" leftIcon={<Upload size={14} />} disabled={!plan || plan.counts.new === 0} onClick={() => void upload()} data-libimport-go>
                {t("libm.upload", { n: formatNum(plan?.counts.new ?? 0) })}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
