import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Barcode as BarcodeIcon, Check, Link2, Loader2, Package, Pencil, Printer, ScanBarcode,
  Search, Sparkles, History,
} from "lucide-react";
import type { GeneratedBarcode, Product } from "@/types";
import { repo } from "@/lib/repo";
import { generateBarcodes, nextSeqFrom, ean13Svg, isValidEan13 } from "@/lib/barcodeGen";
import { getClinicName } from "@/lib/settings";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Badge, useToast, Skeleton } from "@/components/ui";
import { formatNum, formatDate, cn, normalizeCode } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { looksLikeShelfCode } from "@/lib/productCodes";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

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
  const { t, i18n } = useTranslation();
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

  /* ---------------- ربطُ باركود العلبة بالمواد المدخولة برقم رفّ ----------------
   *
   * المقيس بعيادةٍ حيّة: ١٦٥ مادّةً برقم رفٍّ داخليّ (٢٣١، ٩١٠٠، ١٠٠١…) منها ١٤٩
   * برصيد — وهي أفضلُ مبيعاتها. فكلُّ مسحةٍ لعلبةٍ منها بالكاشير تقول «باركود ما
   * ينعرف» بينما المادّةُ بالمخزن برصيدها، فتبدو المشكلةُ «أيَّ باركود».
   *
   * نافذةُ الربط بالكاشير تعالجها واحدةً واحدة وقتَ البيع. هنا نعالجها كلَّها
   * دفعةً وحدة: العيادةُ تمرّ على رفّها وتمسح كلَّ علبةٍ مرّةً — الرمزُ يُضاف
   * `alt_code` ويبقى رقمُ الرفّ، فيشتغل الاثنان. عشرون دقيقةً تُنهي المشكلة من
   * جذرها بدل أن تتكرّر مع كلِّ زبون. */
  const [linkMode, setLinkMode] = useState(false);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const shelfCoded = useMemo(
    () => products
      .filter((p) => p.barcode?.trim() && looksLikeShelfCode(p.barcode) && (p.stock ?? 0) > 0
        // ما ارتبط بباركودِ مصنعٍ من قبل لا يُعاد عرضُه — فالشاشةُ تصحّ إعادتُها.
        // إلا ما رُبط **بهذه الجلسة**: يبقى بالعدّ حتى يقرأ المستخدم «١٢ / ١٢ ✓»
        // لا أن يختفي الصندوقُ كلُّه مع آخر مسحة.
        && (linkedIds.has(p.id) || !(p.alt_codes ?? []).some((c) => c && !looksLikeShelfCode(c))))
      .sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0)),
    [products, linkedIds],
  );
  const linkQueue = useMemo(
    () => shelfCoded.filter((p) => !linkedIds.has(p.id) && !skippedIds.has(p.id)),
    [shelfCoded, linkedIds, skippedIds]);
  const linkCurrent: Product | undefined = linkQueue[0];

  useBarcodeScanner(async (raw) => {
    if (!linkMode || !linkCurrent || busy) return;
    const code = normalizeCode(raw);
    if (!code) return;
    // مسحُ رقمِ رفٍّ آخر أو كتابتُه لا يربط شيئاً — المطلوبُ الرمزُ المطبوع على العلبة.
    if (looksLikeShelfCode(code)) {
      playWarning();
      toast.error(t("pos.linkNotBox", "هذا رقم رفّ مو باركود علبة — امسح الرمز المطبوع على العلبة نفسها."));
      return;
    }
    const target = linkCurrent;
    setBusy(target.id);
    try {
      await repo.attachProductCode(target.id, code);
      playSuccess();
      toast.success(t("pos.linkDone", "انربط «{{n}}» ✓", { n: target.name }), code);
      setLinkedIds((s) => new Set(s).add(target.id));
      onChanged();
    } catch (e) {
      playWarning();
      const m = String((e as Error).message ?? e);
      if (m.includes("another product")) toast.error(t("pos.codeTaken", "هذا الباركود مربوط بمنتج ثاني"));
      else toast.error(t("pos.linkFail", "تعذّر الربط"), m);
    } finally { setBusy(null); }
  }, { disabled: !linkMode });

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

      {/* مواد برقم رفّ — مسحةُ علبتها بالكاشير تفشل حتى يُربط باركودُ العلبة بها.
          فوق «بلا باركود» لأنه الأكبرُ أثراً: هذي مواد تُباع كلَّ يوم. */}
      {shelfCoded.length > 0 && (
        <section className="rounded-2xl border border-danger-200 bg-danger-50/40 p-3.5 dark:border-danger-500/25 dark:bg-danger-500/5" data-linkbox>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-danger-100 text-danger-600 dark:bg-danger-500/20 dark:text-danger-300"><ScanBarcode size={17} /></span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-extrabold text-ink">
                {t("pos.linkBoxTitle", "مواد برقم رفّ — اربط باركود العلبة ({{n}})", { n: formatNum(linkQueue.length) })}
              </h3>
              <p className="text-2xs text-ink-subtle">
                {t("pos.linkBoxHint", "هذي المواد مدخولة برقم داخلي، فمسحة علبتها بالكاشير تقول «ما ينعرف». شغّل الربط وامسح علبة كل مادة مرة وحدة — يصير لها رمزان ويشتغل الاثنان.")}
              </p>
            </div>
            {!linkMode
              ? <Button size="sm" leftIcon={<ScanBarcode size={14} />} onClick={() => { playTap(); setLinkMode(true); }}>{t("pos.linkStart", "ابدأ الربط بالمسح")}</Button>
              : <Button size="sm" variant="secondary" onClick={() => { playTap(); setLinkMode(false); }}>{t("pos.linkStop", "إيقاف")}</Button>}
          </div>
          {linkMode && linkCurrent && (
            <div className="rounded-xl border-2 border-brand-400 bg-surface-1 p-3" data-linkcurrent={linkCurrent.id}>
              <p className="text-2xs font-bold text-brand-600 dark:text-brand-300">{t("pos.linkNow", "امسح علبة:")}</p>
              <p className="text-lg font-extrabold text-ink">{linkCurrent.name}</p>
              <p className="font-mono text-2xs text-ink-subtle" dir="ltr">
                {linkCurrent.barcode} · {t("pos.stockN", "رصيد {{n}}", { n: formatNum(linkCurrent.stock ?? 0) })}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" variant="secondary" disabled={!!busy}
                  onClick={() => { playTap(); setSkippedIds((s) => new Set(s).add(linkCurrent.id)); }}>
                  {t("pos.linkSkip", "تخطّي — ما عليها باركود")}
                </Button>
                <span className="ms-auto text-2xs tabular-nums text-ink-subtle">
                  {formatNum(linkedIds.size)} / {formatNum(shelfCoded.length)}
                </span>
              </div>
            </div>
          )}
          {linkMode && !linkCurrent && (
            <p className="rounded-xl bg-success-50 p-3 text-center text-sm font-bold text-success-700 dark:bg-success-500/10 dark:text-success-300">
              {t("pos.linkAllDone", "خلصت — كل المواد انربطت أو انتخطّت ✓")}
            </p>
          )}
        </section>
      )}

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
