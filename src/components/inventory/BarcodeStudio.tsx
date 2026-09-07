import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle, Barcode as BarcodeIcon, Check, Link2, Loader2, Package, Pencil, Printer,
  ScanBarcode, ScanLine, Search, Sparkles, Stethoscope, History,
} from "lucide-react";
import type { BarcodeAilment, BarcodeHealthRow, GeneratedBarcode, Product } from "@/types";
import { repo } from "@/lib/repo";
import { generateBarcodes, nextSeqFrom, ean13Svg, isValidEan13 } from "@/lib/barcodeGen";
import { createScanAssembler } from "@/lib/scanBuffer";
import { hasArabicLetters, layoutFix } from "@/lib/productCodes";
import { getClinicName } from "@/lib/settings";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Badge, useToast, Skeleton } from "@/components/ui";
import { formatNum, formatDate, cn, matchCode } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/**
 * استوديو الباركود — العيادة تولد باركوداتها الداخلية بنفسها.
 *
 * منطق الاستلام مصمم حتى ما يصير تكرار ولا كود «يتيم»:
 *  · «منتجات بلا باركود» تنعرض جاهزة — ولّد واربط بضغطة، فالكود يولد
 *    ويلتصق بالمنتج ويدخل السجل بعملية وحدة.
 *  · التوليد الحر (دفعة بغرض مسمى) للحالات الي بعدها ما لها منتج.
 *  · كل كود EAN-13 سليم (بادئة 20 الداخلية + رقم تحقق) يمسحه أي جهاز.
 *  · السجل يحفظ كل كود: لأي شيء، منو ولّده، ومتى — مع طباعة ملصقات.
 */
export function BarcodeStudio({ products, onChanged }: { products: Product[]; onChanged: () => void }) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const { user } = useAuth();
  const toast = useToast();

  const [registry, setRegistry] = useState<GeneratedBarcode[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [batchCount, setBatchCount] = useState("10");
  const [batchLabel, setBatchLabel] = useState("");
  const [lastBatch, setLastBatch] = useState<GeneratedBarcode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** إظهار الاسم تحت الباركود على الملصق المطبوع — والافتراضي نعم. */
  const [printNames, setPrintNames] = useState(true);
  /** إعادة تسمية بالسجل: id الصف المفتوح + مسودة الاسم. */
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const mounted = useRef(true);

  const load = async () => {
    try { const rows = await repo.listGeneratedBarcodes(); if (mounted.current) setRegistry(rows); }
    catch { if (mounted.current) setRegistry([]); }
  };
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, []);

  /** «المحجوز» = باركودات كل المنتجات + كل السجل — لا تكرار مهما صار. */
  const takenSet = () => {
    const s = new Set<string>();
    for (const p of products) if (p.barcode?.trim()) s.add(p.barcode.trim());
    for (const g of registry ?? []) s.add(g.barcode);
    return s;
  };
  const startSeq = () => nextSeqFrom((registry ?? []).map((g) => g.barcode));

  const noBarcode = useMemo(
    () => products.filter((p) => !p.barcode?.trim()).sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  /* ------------------------- الأفعال ------------------------- */

  /** ولّد كوداً واربطه بمنتج محدد — عملية وحدة ذرّية من منظور المستخدم. */
  const generateForProduct = async (p: Product) => {
    if (busy || registry === null) return;
    playTap();
    setBusy(p.id);
    try {
      // منتج انربط له باركود بجهاز ثاني بنفس الوقت؟ لا تكتب فوقه.
      const fresh = products.find((x) => x.id === p.id);
      if (fresh?.barcode?.trim()) { toast.toast({ tone: "info", title: "هذا المنتج صار عنده باركود" }); return; }
      const [code] = generateBarcodes(1, takenSet(), startSeq());
      const saved = await repo.addGeneratedBarcodes([
        { barcode: code, label: p.name, product_id: p.id, created_by: user?.full_name ?? null },
      ]);
      await repo.updateProduct(p.id, { barcode: code });
      playSuccess();
      toast.success("انولد وانربط ✓", `${p.name} ← ${code}`);
      setLastBatch(saved.length ? saved : [{ id: code, barcode: code, label: p.name, product_id: p.id, created_at: new Date().toISOString() }]);
      await load();
      onChanged();
    } catch (e) {
      playWarning();
      toast.error("تعذّر التوليد", e instanceof Error ? e.message : undefined);
    } finally { setBusy(null); }
  };

  /** ولّد واربط لكل المنتجات الي بلا باركود دفعة وحدة. */
  const generateForAll = async () => {
    if (busy || registry === null || noBarcode.length === 0) return;
    playTap();
    setBusy("__all__");
    try {
      const codes = generateBarcodes(noBarcode.length, takenSet(), startSeq());
      const rows = noBarcode.map((p, i) => ({ barcode: codes[i], label: p.name, product_id: p.id, created_by: user?.full_name ?? null }));
      const saved = await repo.addGeneratedBarcodes(rows);
      for (let i = 0; i < noBarcode.length; i++) await repo.updateProduct(noBarcode[i].id, { barcode: codes[i] });
      playSuccess();
      toast.success(`انولد وانربط ${formatNum(noBarcode.length)} باركود ✓`);
      setLastBatch(saved.length ? saved : rows.map((r) => ({ ...r, id: r.barcode, created_at: new Date().toISOString() })));
      await load();
      onChanged();
    } catch (e) {
      playWarning();
      toast.error("تعذّر التوليد", e instanceof Error ? e.message : undefined);
    } finally { setBusy(null); }
  };

  /** دفعة حرة بغرض مسمى — لبضاعة جاية أو ملصقات جاهزة بالدرج. */
  const generateBatch = async () => {
    if (busy || registry === null) return;
    const n = Math.max(1, Math.min(200, Math.round(Number(batchCount) || 0)));
    if (!n) return;
    playTap();
    setBusy("__batch__");
    try {
      const codes = generateBarcodes(n, takenSet(), startSeq());
      const label = batchLabel.trim() || null;
      const saved = await repo.addGeneratedBarcodes(codes.map((c) => ({ barcode: c, label, product_id: null, created_by: user?.full_name ?? null })));
      playSuccess();
      toast.success(`انولد ${formatNum(n)} باركود جديد ✓`, label ?? undefined);
      setLastBatch(saved.length ? saved : codes.map((c) => ({ id: c, barcode: c, label, created_at: new Date().toISOString() })));
      setBatchLabel("");
      await load();
    } catch (e) {
      playWarning();
      toast.error("تعذّر التوليد", e instanceof Error ? e.message : undefined);
    } finally { setBusy(null); }
  };

  /** طباعة ملصقات — ورقة A4 شبكة 4×10: الباركود، وتحته الاسم (إن مطلوب). */
  const printLabels = (rows: GeneratedBarcode[]) => {
    if (!rows.length) return;
    playTap();
    const clinic = getClinicName() || "doctorVet";
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
    const cells = rows.map((g) => {
      const name = g.label || productById.get(g.product_id ?? "")?.name || clinic;
      return `
      <div class="cell">
        ${ean13Svg(g.barcode, { moduleW: 1.6, height: 34, fontSize: 9 })}
        ${printNames ? `<div class="name">${esc(name)}</div>` : ""}
      </div>`;
    }).join("");
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { toast.error("اسمح بالنوافذ المنبثقة للطباعة"); return; }
    w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>ملصقات باركود — ${esc(clinic)}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, Tahoma, sans-serif; padding: 8mm; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; }
        .cell { border: 0.3mm dashed #bbb; border-radius: 2mm; padding: 2mm; text-align: center; page-break-inside: avoid; }
        .cell svg { width: 100%; height: auto; }
        .name { font-size: 8pt; font-weight: 700; margin-top: 1mm; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        @media print { .cell { border-style: solid; border-color: #eee; } }
      </style></head><body><div class="grid">${cells}</div>
      <script>window.onload = () => setTimeout(() => window.print(), 250);</script></body></html>`);
    w.document.close();
  };

  /* ------------------------- العرض ------------------------- */
  const ql = q.trim();
  const shown = useMemo(() => {
    const list = registry ?? [];
    if (!ql) return list;
    const l = ql.toLowerCase();
    return list.filter((g) =>
      g.barcode.includes(l) ||
      (g.label ?? "").toLowerCase().includes(l) ||
      (productById.get(g.product_id ?? "")?.name ?? "").toLowerCase().includes(l) ||
      (g.created_by ?? "").toLowerCase().includes(l));
  }, [registry, ql, productById]);

  const toggleSel = (id: string) => {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const selectedRows = (registry ?? []).filter((g) => selected.has(g.id));

  /** حفظ تسمية باركود — تظهر بالسجل وتحت الباركود بالطبعة. */
  const saveRename = async (g: GeneratedBarcode) => {
    if (renameBusy) return;
    setRenameBusy(true);
    try {
      await repo.updateGeneratedBarcode(g.id, { label: renameDraft.trim() || null });
      playSuccess();
      setRenameId(null);
      await load();
    } catch {
      playWarning();
      toast.error("تعذّر حفظ الاسم");
    } finally { setRenameBusy(false); }
  };

  return (
    <div className="space-y-4">
      {/* الرأس + الأرقام */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: "باركود مولّد", value: registry?.length ?? 0 },
          { label: "مربوط بمنتج", value: (registry ?? []).filter((g) => g.product_id).length },
          { label: "منتج بلا باركود", value: noBarcode.length },
        ].map((k) => (
          <div key={k.label} className={cn("rounded-2xl border p-3 text-center", k.label === "منتج بلا باركود" && k.value > 0 ? "border-warn-300 bg-warn-50 dark:border-warn-500/30 dark:bg-warn-500/10" : "border-line bg-surface-1")}>
            <div className="text-xl font-black tabular-nums text-ink">{registry === null ? "…" : formatNum(k.value)}</div>
            <div className="text-2xs font-bold text-ink-subtle">{k.label}</div>
          </div>
        ))}
      </div>

      {/* منتجات بلا باركود — أول شيء يشوفه، لأنه هو الشغل الفعلي */}
      {noBarcode.length > 0 && (
        <section className="rounded-2xl border border-warn-200 bg-warn-50/40 p-3.5 dark:border-warn-500/25 dark:bg-warn-500/5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-warn-100 text-warn-600 dark:bg-warn-500/20 dark:text-warn-300"><Package size={17} /></span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-extrabold text-ink">منتجات بلا باركود ({formatNum(noBarcode.length)})</h3>
              <p className="text-2xs text-ink-subtle">ولّد واربط بضغطة — الكود يلتصق بالمنتج ويدخل السجل، وما يتكرر أبداً.</p>
            </div>
            <Button size="sm" loading={busy === "__all__"} leftIcon={<Sparkles size={14} />} onClick={() => void generateForAll()}>
              ولّد للكل ({formatNum(noBarcode.length)})
            </Button>
          </div>
          <div className="flex max-h-52 flex-wrap gap-1.5 overflow-y-auto">
            {noBarcode.map((p) => (
              <button key={p.id} type="button" disabled={!!busy} onClick={() => void generateForProduct(p)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-1 px-3 py-1.5 text-xs font-bold text-ink transition hover:border-warn-400 hover:bg-warn-50 disabled:opacity-50 dark:hover:bg-warn-500/10">
                {busy === p.id ? <Loader2 size={12} className="animate-spin" /> : <BarcodeIcon size={12} className="text-warn-600 dark:text-warn-300" />}
                {p.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* توليد حر */}
      <section className="rounded-2xl border border-brand-200 bg-brand-50/40 p-3.5 dark:border-brand-500/25 dark:bg-brand-500/5">
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300"><ScanBarcode size={17} /></span>
          <div>
            <h3 className="text-sm font-extrabold text-ink">توليد دفعة باركودات</h3>
            <p className="text-2xs text-ink-subtle">لبضاعة جاية أو ملصقات جاهزة — سمّ الغرض حتى يبقى السجل مفهوماً.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-2xs font-bold text-ink-muted">
            العدد
            <input type="number" min={1} max={200} inputMode="numeric" value={batchCount} onChange={(e) => setBatchCount(e.target.value)}
              className="input mt-1 h-10 w-24 text-center text-base font-extrabold tabular-nums" />
          </label>
          <label className="min-w-[200px] flex-1 text-2xs font-bold text-ink-muted">
            الغرض (اختياري)
            <input value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} placeholder="مثال: وجبة أدوية شهر ٨ — شركة الرازي"
              className="input mt-1 h-10 w-full text-sm" />
          </label>
          <Button loading={busy === "__batch__"} leftIcon={<Sparkles size={15} />} onClick={() => void generateBatch()}>توليد</Button>
        </div>

        {/* آخر دفعة مولدة — معاينة فورية + طباعة */}
        {lastBatch.length > 0 && (
          <div className="mt-3 rounded-xl border border-success-200 bg-success-50/50 p-3 dark:border-success-500/25 dark:bg-success-500/5">
            <div className="mb-2 flex items-center gap-2">
              <Check size={14} className="text-success-600 dark:text-success-300" />
              <span className="flex-1 text-2xs font-extrabold text-success-700 dark:text-success-300">آخر توليد — {formatNum(lastBatch.length)} باركود جاهز</span>
              <Button size="sm" variant="secondary" leftIcon={<Printer size={13} />} onClick={() => printLabels(lastBatch)}>طباعة الملصقات</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {lastBatch.slice(0, 8).map((g) => (
                <span key={g.id} className="rounded-lg border border-line bg-white p-1.5 dark:bg-surface-1" dangerouslySetInnerHTML={{ __html: ean13Svg(g.barcode, { moduleW: 1.3, height: 26, fontSize: 8 }) }} />
              ))}
              {lastBatch.length > 8 && <span className="self-center text-2xs font-bold text-ink-subtle">+{formatNum(lastBatch.length - 8)}</span>}
            </div>
          </div>
        )}
      </section>

      {/* صحّة الباركودات (C1) + اختبار القارئ (C2) */}
      <BarcodeHealthCard />
      <ReaderTest makeCode={() => generateBarcodes(1, takenSet(), startSeq())[0]} />

      {/* السجل */}
      <section className="rounded-2xl border border-line bg-surface-1 p-3.5 shadow-card">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-ink-muted"><History size={17} /></span>
          <h3 className="text-sm font-extrabold text-ink">سجل الباركودات المولدة</h3>
          <div className="relative ms-auto min-w-[180px] flex-1 sm:max-w-xs">
            <Search size={14} className="pointer-events-none absolute inset-y-0 my-auto ms-3 text-ink-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالكود أو الغرض أو المنتج…" className="input h-9 w-full ps-9 text-xs" />
          </div>
          <label className="inline-flex shrink-0 items-center gap-1.5 text-2xs font-bold text-ink-muted">
            <input type="checkbox" checked={printNames} onChange={(e) => setPrintNames(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            الاسم تحت الباركود بالطبعة
          </label>
          {selectedRows.length > 0 && (
            <Button size="sm" variant="secondary" leftIcon={<Printer size={13} />} onClick={() => printLabels(selectedRows)}>
              اطبع المحدد ({formatNum(selectedRows.length)})
            </Button>
          )}
          {shown.length > 0 && (
            <Button size="sm" variant="ghost" leftIcon={<Printer size={13} />} onClick={() => printLabels(shown)}>اطبع الكل الظاهر</Button>
          )}
        </div>

        {registry === null ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : shown.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-subtle">{registry.length === 0 ? "بعد ما انولد أي باركود — ابدأ من فوق." : "ماكو نتيجة مطابقة."}</p>
        ) : (
          <div className="divide-y divide-line/60">
            {shown.map((g) => {
              const prod = g.product_id ? productById.get(g.product_id) : undefined;
              return (
                <div key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleSel(g.id)} className="h-4 w-4 shrink-0 accent-brand-600" />
                  <span className="shrink-0 rounded border border-line bg-white p-1 dark:bg-surface-2" dangerouslySetInnerHTML={{ __html: ean13Svg(g.barcode, { moduleW: 0.9, height: 18, fontSize: 6 }) }} />
                  <span className="font-mono text-xs font-bold tabular-nums text-ink" dir="ltr">{g.barcode}</span>
                  {renameId === g.id ? (
                    <span className="flex min-w-0 flex-1 items-center gap-1">
                      <input autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void saveRename(g); if (e.key === "Escape") setRenameId(null); }}
                        placeholder="اسم هذا الباركود…" className="input h-7 min-w-0 flex-1 text-xs" />
                      <button type="button" onClick={() => void saveRename(g)} disabled={renameBusy}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-50">
                        {renameBusy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      </button>
                    </span>
                  ) : (
                    <span className="flex min-w-0 flex-1 items-center gap-1">
                      <span className={cn("truncate text-xs font-semibold", g.label || prod ? "text-ink-muted" : "text-ink-subtle")}>{g.label || prod?.name || "بلا اسم — اضغط القلم للتسمية"}</span>
                      <button type="button" onClick={() => { playTap(); setRenameId(g.id); setRenameDraft(g.label ?? ""); }} title="تسمية / إعادة تسمية"
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-ink"><Pencil size={11} /></button>
                    </span>
                  )}
                  {prod
                    ? <Badge tone="success"><Link2 size={10} /> {prod.name}</Badge>
                    : g.product_id ? <Badge tone="warn">منتج محذوف</Badge> : <Badge tone="brand">حر</Badge>}
                  <span className="text-2xs text-ink-subtle">{formatDate(g.created_at, lang)}{g.created_by ? ` · ${g.created_by}` : ""}</span>
                  <button type="button" onClick={() => printLabels([g])} title="طباعة هذا الملصق"
                    className="grid h-7 w-7 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-ink"><Printer size={13} /></button>
                </div>
              );
            })}
          </div>
        )}
        {registry !== null && registry.some((g) => !isValidEan13(g.barcode)) && (
          <p className="mt-2 rounded-lg bg-danger-50 px-2 py-1 text-2xs font-bold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300">
            تنبيه: في أكواد قديمة بالسجل غير سليمة البنية — ولّد بدائل عنها.
          </p>
        )}
      </section>
    </div>
  );
}

/* ============================================================================
 * (C1) صحّة الباركودات — مراقبةٌ دائمة لا فحصَ مرّة.
 *
 * الحرّاسُ التي نزلت بالقاعدة (0164–0167) تمنع الخطأ من اليوم فصاعداً: التطبيعُ
 * موحَّد، والشراءُ يقرأ الرموزَ الإضافية، والتوأمُ مرفوضٌ عند الكتابة. أما ما
 * دخل قبلها فباقٍ كما هو — والخطُّ الأحمر الأوّل يمنع تنظيفَه بالجملة: بياناتُ
 * العيادة تبقى كما أدخلها أصحابُها.
 *
 * فالباقي أن **يُرى**: عيادةٌ لا تعرف أن عندها رمزَين متوأمَين تظلّ تشتكي أن
 * «المادة تختفي» ولا تعرف أين المشكلة. ولذلك لا زرَّ إصلاحٍ جماعيّ هنا — عرضٌ
 * وإرشادٌ، والقرارُ بيد صاحب المخزن.
 * ==========================================================================*/
const AILMENTS: BarcodeAilment[] = ["twin", "alt_owned", "empty", "arabic", "excel"];

function BarcodeHealthCard() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<BarcodeHealthRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [openKind, setOpenKind] = useState<BarcodeAilment | null>(null);

  const run = async () => {
    if (busy) return;
    playTap();
    setBusy(true);
    setFailed(false);
    try {
      const r = await repo.barcodeHealth();
      setRows(r);
      if (r.length === 0) playSuccess();
    } catch {
      // قائمةٌ ناقصةٌ عن خطأ أخطرُ من خطأٍ ظاهر: لا نعرض «كلُّ شيءٍ سليم» عن فشل.
      playWarning();
      setRows(null);
      setFailed(true);
    } finally { setBusy(false); }
  };

  const title = (k: BarcodeAilment): string => ({
    twin: t("barcodeHealth.twin", "رمز واحد على أكثر من منتج"),
    alt_owned: t("barcodeHealth.altOwned", "رمز إضافي صاحبه منتج ثاني"),
    empty: t("barcodeHealth.empty", "رمز يبيّن موجود وهو فاضي"),
    arabic: t("barcodeHealth.arabic", "باركود بأحرف عربية"),
    excel: t("barcodeHealth.excel", "باركود شوّهه إكسل"),
  })[k];
  const advice = (k: BarcodeAilment): string => ({
    twin: t("barcodeHealth.twinFix", "المسحة تبيع واحد منهم بلا قاعدة. ادمج المنتجين من المخزون، أو غيّر رمز واحد منهم."),
    alt_owned: t("barcodeHealth.altOwnedFix", "الرمز إضافي هنا وأساسي عند منتج ثاني — المسحة تروح لصاحبه الأصلي. شيله من الرموز الإضافية أو ادمج المنتجين."),
    empty: t("barcodeHealth.emptyFix", "كله مسافات أو محارف اتجاه خفية — ما يطابق ولا مسحة. افتح المنتج وامسح باركود العلبة من جديد."),
    arabic: t("barcodeHealth.arabicFix", "الكيبورد كان عربي وقت المسح. بدّل لغة الكيبورد إنكليزي وامسح العلبة من جديد."),
    excel: t("barcodeHealth.excelFix", "الرقم الأصلي ما ينسترجع من هذا الشكل. امسح العلبة من جديد — وبإكسل خلّي عمود الباركود «نص» قبل اللصق."),
  })[k];

  const groups = AILMENTS.map((k) => ({ kind: k, items: (rows ?? []).filter((r) => r.kind === k) })).filter((g) => g.items.length > 0);

  return (
    <section className="rounded-2xl border border-line bg-surface-1 p-3.5 shadow-card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-ink-muted"><Stethoscope size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-extrabold text-ink">{t("barcodeHealth.title", "فحص صحة الباركودات")}</h3>
          <p className="text-2xs text-ink-subtle">{t("barcodeHealth.sub", "يقرأ رموز مخزنك ويقول وين الخلل — بلا ما يغيّر شي.")}</p>
        </div>
        <Button size="sm" variant="secondary" loading={busy} leftIcon={<Stethoscope size={14} />} onClick={() => void run()}>
          {rows === null ? t("barcodeHealth.run", "افحص") : t("barcodeHealth.again", "افحص من جديد")}
        </Button>
      </div>

      {failed && (
        <p className="rounded-lg bg-danger-50 px-2.5 py-2 text-2xs font-bold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300">
          {t("barcodeHealth.failed", "ما وصلت النتيجة — أعد المحاولة. (ما نعرض «سليم» عن فشل اتصال.)")}
        </p>
      )}

      {rows !== null && groups.length === 0 && (
        <p className="rounded-lg bg-success-50 px-2.5 py-2 text-2xs font-bold text-success-700 dark:bg-success-500/10 dark:text-success-300">
          {t("barcodeHealth.clean", "كل رموز مخزنك سليمة ✓ — ماكو توأم ولا رمز مكسور.")}
        </p>
      )}

      {groups.length > 0 && (
        <div className="space-y-1.5">
          {groups.map((g) => (
            <div key={g.kind} className="overflow-hidden rounded-xl border border-warn-200 bg-warn-50/40 dark:border-warn-500/25 dark:bg-warn-500/5">
              <button type="button" onClick={() => { playTap(); setOpenKind(openKind === g.kind ? null : g.kind); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-start transition hover:bg-warn-100/50 dark:hover:bg-warn-500/10">
                <AlertTriangle size={14} className="shrink-0 text-warn-600 dark:text-warn-300" />
                <span className="min-w-0 flex-1 text-xs font-extrabold text-ink">{title(g.kind)}</span>
                <Badge tone="warn">{formatNum(g.items.length)}</Badge>
              </button>
              {openKind === g.kind && (
                <div className="border-t border-warn-200/60 px-3 py-2 dark:border-warn-500/20">
                  <p className="mb-1.5 text-2xs font-bold text-ink-muted">{advice(g.kind)}</p>
                  <div className="max-h-44 space-y-1 overflow-y-auto">
                    {g.items.map((r, i) => (
                      <div key={`${r.product_id}-${r.code}-${i}`} className="flex flex-wrap items-center gap-x-2 text-2xs">
                        <span className="min-w-0 flex-1 truncate font-bold text-ink">{r.product_name}</span>
                        <span className="font-mono text-ink-subtle" dir="ltr">{r.code}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          <p className="pt-0.5 text-2xs text-ink-subtle">{t("barcodeHealth.noBulk", "ما نصلّح بالجملة: بياناتك تبقى مثل ما دخّلتها، والتصليح يصير بيدك منتج منتج.")}</p>
        </div>
      )}
    </section>
  );
}

/* ============================================================================
 * (C2) اختبار القارئ — حدودُ العتاد تُكشف قبل أن تعضّ.
 *
 * «القارئ ما يشتغل» شكوى تُشخَّص عن بُعد بالتخمين: ماسحٌ مضبوطٌ على Tab بدل
 * Enter، أو كيبوردٌ عربيّ لحظةَ المسح، أو ماسحُ بلوتوث بطيءٌ تُرفض دفعتُه. وكلُّ
 * واحدةٍ منها تُقاس بدقيقة إن سألنا القارئَ نفسَه.
 *
 * والحكمُ هنا ليس رأياً: نُغذّي **المجمِّعَ نفسه** (`createScanAssembler`) بما
 * وصل وبأزمانه، فيقول ما ستقوله شاشةُ البيع حرفياً. مقياسٌ يحاكي الشِفرةَ ولا
 * يستعملها كان سيمدح ماسحاً ترفضه الشاشة.
 * ==========================================================================*/
interface ReaderVerdict {
  expected: string;
  got: string;
  term: "enter" | "tab" | null;
  medianGap: number;
  maxGap: number;
  accepted: boolean | null;
  arabic: string;
}

function ReaderTest({ makeCode }: { makeCode: () => string }) {
  const { t } = useTranslation();
  const [code, setCode] = useState<string | null>(null);
  const [res, setRes] = useState<ReaderVerdict | null>(null);

  useEffect(() => {
    if (!code) return;
    const keys: string[] = [];
    const times: number[] = [];
    let timer: number | null = null;
    const finish = (term: "enter" | "tab" | null): void => {
      if (timer) window.clearTimeout(timer);
      const gaps = times.slice(1).map((x, i) => x - times[i]);
      const sorted = [...gaps].sort((a, b) => a - b);
      // نفسُ المجمِّع الذي تستعمله شاشة البيع، بنفس المدخلات وأزمانها.
      let accepted: boolean | null = null;
      if (term) {
        const asm = createScanAssembler();
        for (let i = 0; i < keys.length; i++) asm.feed(keys[i], times[i]);
        accepted = asm.feed(term === "enter" ? "Enter" : "Tab", times[times.length - 1] ?? 0) !== null;
      }
      const got = keys.join("");
      setRes({
        expected: code, got, term,
        medianGap: sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : 0,
        maxGap: sorted.length ? Math.round(sorted[sorted.length - 1]) : 0,
        accepted,
        arabic: hasArabicLetters(got) ? layoutFix(got) : "",
      });
      setCode(null);
      playTap();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (keys.length) finish(e.key === "Enter" ? "enter" : "tab");
        return;
      }
      if (e.key.length !== 1) return;
      e.preventDefault();
      keys.push(e.key);
      times.push(e.timeStamp);
      if (timer) window.clearTimeout(timer);
      // ماسحٌ بلا فاصلٍ أصلاً: نُنهي بالتوقّف حتى نقولها له، لا أن ننتظر أبداً.
      timer = window.setTimeout(() => finish(null), 700);
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); if (timer) window.clearTimeout(timer); };
  }, [code]);

  const start = (): void => { playTap(); setRes(null); setCode(makeCode()); };

  const lines: { tone: "ok" | "warn" | "bad"; text: string }[] = [];
  if (res) {
    const seen = res.arabic || res.got;
    const same = matchCode(seen) === matchCode(res.expected);
    const tail = !same && matchCode(res.expected).endsWith(matchCode(seen)) && matchCode(seen).length > 0;
    if (same) lines.push({ tone: "ok", text: t("readerTest.full", "وصل كامل ✓ — نفس الرقم المعروض بالضبط.") });
    else if (tail) lines.push({ tone: "bad", text: t("readerTest.tail", "وصل ناقص من الأول: ضاعت {{n}} خانة. جرّب مرة ثانية والشاشة هادية.", { n: matchCode(res.expected).length - matchCode(seen).length }) });
    else lines.push({ tone: "bad", text: t("readerTest.wrong", "الي وصل غير الي معروض: «{{got}}».", { got: res.got || "—" }) });

    if (res.arabic) lines.push({ tone: "bad", text: t("readerTest.arabic", "الكيبورد كان عربي وقت المسح — بدّله إنكليزي. (الواصل بالعكس يقرأ: {{fix}})", { fix: res.arabic }) });

    if (res.term === "enter") lines.push({ tone: "ok", text: t("readerTest.enter", "الفاصل Enter — مدعوم ✓") });
    else if (res.term === "tab") lines.push({ tone: "ok", text: t("readerTest.tab", "قارئك يرسل Tab بدل Enter — مدعوم ✓ (كان يُهمَل قبل هذا التحديث).") });
    else lines.push({ tone: "warn", text: t("readerTest.noTerm", "قارئك ما يرسل Enter ولا Tab بالنهاية — فعّل واحد منهم من إعدادات القارئ.") });

    lines.push({
      tone: res.medianGap > 60 ? "warn" : "ok",
      text: t("readerTest.speed", "سرعة الإرسال: وسيط {{m}} م.ث، وأقصى {{x}} م.ث.", { m: formatNum(res.medianGap), x: formatNum(res.maxGap) }),
    });
    if (res.accepted === true) lines.push({ tone: "ok", text: t("readerTest.accepted", "شاشة البيع تقبل هذه المسحة ✓") });
    if (res.accepted === false) lines.push({ tone: "bad", text: t("readerTest.rejected", "شاشة البيع ترفض هذه المسحة — القارئ بطيء فتحسبه كتابة يد. جرّب كيبل بدل بلوتوث، أو بلّغنا بالأرقام الي فوق.") });
  }

  return (
    <section className="rounded-2xl border border-line bg-surface-1 p-3.5 shadow-card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-ink-muted"><ScanLine size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-extrabold text-ink">{t("readerTest.title", "اختبار القارئ")}</h3>
          <p className="text-2xs text-ink-subtle">{t("readerTest.sub", "امسح الكود الي نعرضه، ونكلك بالضبط شيصير بقارئك.")}</p>
        </div>
        <Button size="sm" variant="secondary" leftIcon={<ScanLine size={14} />} onClick={start}>
          {code ? t("readerTest.restart", "كود ثاني") : t("readerTest.start", "ابدأ الاختبار")}
        </Button>
      </div>

      {code && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3 text-center dark:border-brand-500/25 dark:bg-brand-500/5">
          <p className="mb-2 text-2xs font-extrabold text-brand-700 dark:text-brand-300">{t("readerTest.scanNow", "امسح هذا الكود من الشاشة بقارئك…")}</p>
          <span className="inline-block rounded-lg border border-line bg-white p-2" dangerouslySetInnerHTML={{ __html: ean13Svg(code, { moduleW: 2.2, height: 52, fontSize: 11 }) }} />
          <p className="mt-2 text-2xs text-ink-subtle">{t("readerTest.cancelHint", "ما يشتغل؟ اضغط «إلغاء» ورجع جرّب.")}</p>
          <Button size="sm" variant="ghost" onClick={() => { setCode(null); playTap(); }}>{t("readerTest.cancel", "إلغاء")}</Button>
        </div>
      )}

      {res && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface-2 px-2.5 py-1.5 text-2xs">
            <span className="font-bold text-ink-muted">{t("readerTest.expected", "المعروض")}</span>
            <span className="font-mono text-ink" dir="ltr">{res.expected}</span>
            <span className="font-bold text-ink-muted">{t("readerTest.received", "الواصل")}</span>
            <span className="font-mono text-ink" dir="ltr">{res.got || "—"}</span>
          </div>
          {lines.map((l, i) => (
            <p key={i} className={cn("rounded-lg px-2.5 py-1.5 text-2xs font-bold",
              l.tone === "ok" ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-300"
                : l.tone === "warn" ? "bg-warn-50 text-warn-700 dark:bg-warn-500/10 dark:text-warn-300"
                  : "bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-300")}>
              {l.text}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
