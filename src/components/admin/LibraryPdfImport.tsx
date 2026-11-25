// ============================================================================
// استيرادُ مكتبة الصور من كاتالوج PDF (طلبُ المالك ٢٥/١١) — رفيقُ ImageLibraryManager بالنطاق `libm`، بجانب الإكسل.
//
// الملفُّ يُقرأ بالمتصفّح (pdfCatalog.ts، pdf.js كسول) ولا يُرفع؛ يُرفع ما يُقصّ منه وحده. والقرارُ أيُّ نصٍّ لأيّ
// صورة (pdfCatalogLayout.ts) تخمينٌ: **مراجعةٌ قبل أيّ رفع** — كلُّ صورةٍ بجانبها اسمُها ورمزُها يُصحَّحان، و«لا
// ترفعها» لما ليس منتجاً، وما بلا اسم لا يُرفع. ثمّ خطّةُ الإكسل نفسُها (planImport): الموجودُ بالشركة والصنف
// يُتخطّى، والمكرّرُ بالملف مرّة — فالرفعُ يُستأنف بلا تكرار كأخيه.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Upload, Square, Loader2, ImageOff } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { prepareUpload, type PreparedUpload } from "@/lib/image";
import { describeDbError, isNetworkError } from "@/lib/errors";
import { holdUntil } from "@/lib/inflight";
import { cn, formatNum } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { planImport, type ParsedSheet, type PlanStatus } from "@/lib/libraryImport";
import { readCatalog, type CatalogEntry, type CatalogRead } from "@/lib/pdfCatalogLayout";
import { openPdf, PdfError, type OpenPdf } from "@/lib/pdfCatalog";
import { isLibraryColumnMissing } from "@/lib/libraryScope";
import type { LibraryImage } from "@/types";

type Run = { done: number; total: number; failed: number; firstError: string | null; stopped: null | "user" | "network" | "dbOld" };
type Meta = { name: string; company: string; kind: string; agency: string | null; section: string | null; barcode: string | null };
type Edit = { name?: string; barcode?: string; skip?: boolean };
type Filter = "all" | "noName" | "new";
const PAGE = 48;
const COLS = { name: 0, agency: null, section: null, barcode: 1 };

export function LibraryPdfImport({ library, onChanged, create, scope = "public" }: {
  library: LibraryImage[];
  onChanged: () => void;
  create: (meta: Meta, photo: PreparedUpload) => Promise<unknown>;
  scope?: "public" | "clinic";
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<OpenPdf | null>(null);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [thumbing, setThumbing] = useState<{ done: number; total: number } | null>(null);
  const [readErr, setReadErr] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [read, setRead] = useState<CatalogRead | null>(null);
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const [edits, setEdits] = useState<Map<string, Edit>>(new Map());
  const [company, setCompany] = useState("");
  const [kind, setKind] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const stopRef = useRef(false);
  const genRef = useRef(0);

  useEffect(() => {
    if (!busy) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [busy]);
  // المصغّراتُ روابطُ بالذاكرة: تُحرَّر حين يُختار ملفٌّ آخر أو تُغلق الشاشة (لا بكلّ إضافة — الخريطةُ الجديدة
  // تحمل الروابطَ نفسَها)، والملفُّ يُغلق معها.
  const urlsRef = useRef<string[]>([]);
  const freeThumbs = () => { for (const u of urlsRef.current) URL.revokeObjectURL(u); urlsRef.current = []; };
  useEffect(() => () => { genRef.current++; freeThumbs(); pdfRef.current?.close(); }, []);

  const companies = useMemo(() => [...new Set(library.map((r) => r.company?.trim()).filter(Boolean))] as string[], [library]);
  const kinds = useMemo(() => [...new Set(library.map((r) => r.kind?.trim()).filter(Boolean))] as string[], [library]);

  const entries = read?.entries ?? [];
  const valueOf = (e: CatalogEntry) => {
    const ed = edits.get(e.image.key);
    return { name: (ed?.name ?? e.name).trim(), barcode: (ed?.barcode ?? e.barcode ?? "").trim(), skip: !!ed?.skip };
  };
  /* خطّةُ الإكسل نفسُها على ورقةٍ مصنوعة من الصور بأسمائها بعد التصحيح — المتخطّاةُ خارجها. */
  const plan = useMemo(() => {
    if (!read || !company.trim() || !kind.trim()) return null;
    const live = entries.filter((e) => !valueOf(e).skip);
    const sheet: ParsedSheet = {
      name: "pdf", headers: ["name", "barcode"],
      rows: live.map((e, i) => { const v = valueOf(e); return { row: i + 1, cells: [v.name, v.barcode], image: e.image.key, images: 1 }; }),
    };
    return planImport(sheet, COLS, { company: company.trim(), kind: kind.trim() }, library);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read, edits, company, kind, library]);
  const statusOf = useMemo(() => {
    const m = new Map<string, PlanStatus>();
    for (const it of plan?.items ?? []) if (it.image) m.set(it.image, it.status);
    return m;
  }, [plan]);

  const errText = (e: unknown) => (e instanceof PdfError ? t(`libm.pdf.err.${e.code}`) : describeDbError(e, t));

  const pick = async (file: File) => {
    playTap();
    const gen = ++genRef.current;
    pdfRef.current?.close(); pdfRef.current = null;
    freeThumbs();
    setReadErr(null); setRead(null); setRun(null); setEdits(new Map()); setThumbs(new Map()); setFilter("all"); setShown(PAGE);
    setFileName(file.name);
    setReading({ done: 0, total: 0 });
    try {
      const pdf = await openPdf(file);
      if (gen !== genRef.current) { pdf.close(); return; }
      pdfRef.current = pdf;
      const pages = [];
      for (let n = 1; n <= pdf.pages; n++) {
        pages.push(await pdf.readPage(n));
        if (gen !== genRef.current) return;
        setReading({ done: n, total: pdf.pages });
      }
      const r = readCatalog(pages);
      setRead(r);
      setReading(null);
      if (!r.entries.length) playWarning();
      // المصغّراتُ صفحةً صفحة بعد القراءة — القائمةُ تظهر فوراً وتمتلئ صورُها.
      const byPage = new Map<number, CatalogEntry[]>();
      for (const e of r.entries) { const a = byPage.get(e.page) ?? []; a.push(e); byPage.set(e.page, a); }
      setThumbing({ done: 0, total: byPage.size });
      let i = 0;
      for (const [n, es] of byPage) {
        if (gen !== genRef.current) return;
        try {
          const blobs = await pdf.crop(n, es.map((e) => e.image), 240, "image/jpeg");
          if (gen !== genRef.current) return;
          const urls = blobs.map((b) => URL.createObjectURL(b));
          urlsRef.current.push(...urls);
          setThumbs((m) => { const x = new Map(m); es.forEach((e, j) => x.set(e.image.key, urls[j])); return x; });
        } catch { /* مصغّرةٌ فشلت: البطاقةُ بلا صورة، والرفعُ يقصّ من جديد */ }
        setThumbing({ done: ++i, total: byPage.size });
      }
      setThumbing(null);
    } catch (e) {
      if (gen !== genRef.current) return;
      playWarning();
      setReadErr(errText(e));
      setReading(null); setThumbing(null);
    }
  };

  const setEdit = (key: string, patch: Edit) => setEdits((m) => new Map(m).set(key, { ...m.get(key), ...patch }));

  const upload = async () => {
    const pdf = pdfRef.current;
    if (!plan || !pdf || busy) return;
    const byKey = new Map(entries.map((e) => [e.image.key, e]));
    const todo = plan.items.filter((i) => i.status === "new" && i.image && byKey.has(i.image));
    if (!todo.length) return;
    playTap();
    stopRef.current = false;
    setBusy(true);
    const state: Run = { done: 0, total: todo.length, failed: 0, firstError: null, stopped: null };
    setRun({ ...state });
    // صفحةً صفحة: رسمةٌ واحدة للصفحة تُقصّ منها صورُها، ثمّ رفعُها ثلاثاً بالمرّة.
    const pages = new Map<number, typeof todo>();
    for (const it of todo) { const p = byKey.get(it.image!)!.page; const a = pages.get(p) ?? []; a.push(it); pages.set(p, a); }
    const work = async () => {
      for (const [n, items] of pages) {
        if (stopRef.current || state.stopped) return;
        let blobs: Blob[];
        try { blobs = await pdf.crop(n, items.map((it) => byKey.get(it.image!)!.image), 1200); }
        catch (e) { state.failed += items.length; state.firstError ??= errText(e); setRun({ ...state }); continue; }
        let next = 0;
        const worker = async () => {
          while (!stopRef.current && !state.stopped) {
            const i = next++;
            if (i >= items.length) return;
            const it = items[i];
            try {
              const file = new File([blobs[i]], "p.png", { type: "image/png" });
              const photo = await prepareUpload(file, { maxDim: 1200, quality: 0.85, background: "#ffffff" });
              await create({ name: it.name, company: company.trim(), kind: kind.trim(), agency: null, section: null, barcode: it.barcode }, photo);
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
        await Promise.all([worker(), worker(), worker()]);
      }
    };
    try { await holdUntil(work()); }
    finally {
      if (stopRef.current && !state.stopped) state.stopped = "user";
      setRun({ ...state });
      setBusy(false);
      onChanged();
    }
    if (state.stopped === "network" || state.stopped === "dbOld") playWarning();
    else if (!state.stopped && state.failed === 0) { playSuccess(); toast.success(t("libm.done", { n: formatNum(state.done) })); }
  };

  const noNameCount = entries.filter((e) => { const v = valueOf(e); return !v.skip && !v.name; }).length;
  const visible = entries.filter((e) => {
    if (filter === "all") return true;
    const v = valueOf(e);
    if (filter === "noName") return !v.skip && !v.name;
    return statusOf.get(e.image.key) === "new";
  });
  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 0;
  const stLabel = (st: PlanStatus | undefined, skip: boolean) =>
    skip ? t("libm.pdf.st.skip") : st ? t(`libm.pdf.st.${st}`) : "";

  return (
    <div className="card space-y-3 p-4" data-libpdf>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-ink"><FileText size={16} className="text-danger-600" /> {t("libm.pdf.title")}</h3>
          <p className="mt-0.5 text-2xs text-ink-subtle">{t("libm.pdf.hint")}</p>
        </div>
        <Button size="sm" variant="secondary" leftIcon={reading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
          disabled={!!reading || busy} onClick={() => { playTap(); fileRef.current?.click(); }} data-libpdf-pick>
          {reading ? t("libm.pdf.reading", { done: formatNum(reading.done), n: formatNum(reading.total) }) : t("libm.pdf.pick")}
        </Button>
        <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" data-libpdf-input
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
      </div>

      {readErr && <p className="rounded-xl bg-danger-50 px-3 py-2 text-sm font-semibold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300" data-libpdf-err>{readErr}</p>}

      {read && (
        <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-3">
          <p className="text-2xs font-bold text-ink-muted" dir="auto">{fileName}</p>
          <ul className="space-y-0.5 text-sm">
            <li className="font-extrabold text-ink" data-libpdf-found={entries.length}>
              {entries.length ? t("libm.pdf.found", { n: formatNum(entries.length), pages: formatNum(new Set(entries.map((e) => e.page)).size) }) : t("libm.pdf.noImages")}
            </li>
            {read.dropped.small + read.dropped.background + read.dropped.repeated > 0 && (
              <li className="text-2xs text-ink-subtle">{t("libm.pdf.dropped", { n: formatNum(read.dropped.small + read.dropped.background + read.dropped.repeated) })}</li>
            )}
            {read.scanned.length > 0 && <li className="text-2xs font-bold text-warn-700" data-libpdf-scanned>{t("libm.pdf.scanned", { n: formatNum(read.scanned.length) })}</li>}
            {thumbing && <li className="text-2xs text-ink-subtle"><Loader2 size={12} className="me-1 inline animate-spin" />{t("libm.pdf.thumbs", { done: formatNum(thumbing.done), n: formatNum(thumbing.total) })}</li>}
          </ul>

          {entries.length > 0 && (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-2xs font-bold text-ink-muted">{t("libm.companyFor")}</span>
                  <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} list="libpdf-companies" disabled={busy} data-libpdf-company />
                </label>
                <label className="space-y-1">
                  <span className="text-2xs font-bold text-ink-muted">{t("libm.kindFor")}</span>
                  <input className="input" value={kind} onChange={(e) => setKind(e.target.value)} list="libpdf-kinds" placeholder={t("libm.kindPh")} disabled={busy} data-libpdf-kind />
                </label>
                <datalist id="libpdf-companies">{companies.map((c) => <option key={c} value={c} />)}</datalist>
                <datalist id="libpdf-kinds">{kinds.map((k) => <option key={k} value={k} />)}</datalist>
              </div>
              {!plan && <p className="text-2xs font-bold text-warn-700">{t("libm.needCompanyKind")}</p>}
              {plan && (
                <ul className="space-y-0.5 text-sm" data-libpdf-plan>
                  <li className="font-extrabold text-ink" data-plan-new={plan.counts.new}>{t("libm.planNew", { n: formatNum(plan.counts.new) })}</li>
                  {plan.counts.exists > 0 && <li className="text-ink-muted">{t("libm.planExists", { n: formatNum(plan.counts.exists) })}</li>}
                  {plan.counts.dupInFile > 0 && <li className="text-ink-muted">{t("libm.planDup", { n: formatNum(plan.counts.dupInFile) })}</li>}
                  {plan.counts.noName > 0 && <li className="text-warn-700">{t("libm.planNoName", { n: formatNum(plan.counts.noName) })}</li>}
                </ul>
              )}

              <div className="flex flex-wrap gap-1.5">
                {([["all", entries.length], ["noName", noNameCount], ["new", plan?.counts.new ?? 0]] as [Filter, number][]).map(([f, n]) => (
                  <button key={f} type="button" onClick={() => { playTap(); setFilter(f); setShown(PAGE); }} data-libpdf-filter={f}
                    className={cn("rounded-full px-3 py-1 text-2xs font-bold", filter === f ? "bg-brand-600 text-white" : "bg-surface-1 text-ink-muted")}>
                    {t(`libm.pdf.f.${f}`, { n: formatNum(n) })}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {visible.slice(0, shown).map((e) => {
                  const v = valueOf(e);
                  const st = statusOf.get(e.image.key);
                  const url = thumbs.get(e.image.key);
                  return (
                    <div key={e.image.key} data-libpdf-item={e.image.key} data-libpdf-status={v.skip ? "skip" : st ?? ""}
                      className={cn("flex gap-2 rounded-xl border border-line bg-surface-1 p-2", v.skip && "opacity-50")}>
                      <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-white">
                        {url ? <img src={url} alt={v.name} className="h-full w-full object-contain" /> : <ImageOff size={22} className="text-ink-subtle" aria-hidden />}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <input className={cn("input h-9 text-xs", !v.name && !v.skip && "border-warn-400")} value={edits.get(e.image.key)?.name ?? e.name} dir="auto"
                          placeholder={t("libm.pdf.name")} aria-label={t("libm.pdf.name")} disabled={busy || v.skip} data-libpdf-name
                          onChange={(ev) => setEdit(e.image.key, { name: ev.target.value })} />
                        <input className="input h-9 text-xs" value={edits.get(e.image.key)?.barcode ?? e.barcode ?? ""} dir="ltr" inputMode="numeric"
                          placeholder={t("libm.pdf.barcode")} aria-label={t("libm.pdf.barcode")} disabled={busy || v.skip} data-libpdf-code
                          onChange={(ev) => setEdit(e.image.key, { barcode: ev.target.value })} />
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("truncate text-2xs font-bold", st === "new" && !v.skip ? "text-success-700 dark:text-success-300" : st === "noName" && !v.skip ? "text-warn-700" : "text-ink-subtle")}>
                            {t("libm.pdf.page", { n: formatNum(e.page) })} · {stLabel(st, v.skip)}
                          </span>
                          <label className="inline-flex shrink-0 items-center gap-1 text-2xs font-bold text-ink-muted">
                            <input type="checkbox" checked={v.skip} disabled={busy} data-libpdf-skip onChange={(ev) => setEdit(e.image.key, { skip: ev.target.checked })} />
                            {t("libm.pdf.skip")}
                          </label>
                        </div>
                        {e.lines.length > 0 && (
                          <p className="truncate text-2xs text-ink-subtle" dir="auto" title={e.lines.join(" · ")}>{t("libm.pdf.fromText", { text: e.lines.join(" · ") })}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {visible.length > shown && (
                <div className="text-center">
                  <Button size="sm" variant="secondary" onClick={() => { playTap(); setShown((n) => n + PAGE); }}>{t("libm.pdf.more", { n: formatNum(visible.length - shown) })}</Button>
                </div>
              )}

              {run && (
                <div className="space-y-1" data-libpdf-run>
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
                  <Button size="sm" variant="secondary" leftIcon={<Square size={14} />} onClick={() => { playTap(); stopRef.current = true; }} data-libpdf-stop>{t("libm.stop")}</Button>
                ) : (
                  <Button size="sm" leftIcon={<Upload size={14} />} disabled={!plan || plan.counts.new === 0} onClick={() => void upload()} data-libpdf-go>
                    {t("libm.upload", { n: formatNum(plan?.counts.new ?? 0) })}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
