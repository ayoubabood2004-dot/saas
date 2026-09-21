/* ============================================================================
 * طيُّ الشركات التوائم، وسلّةُ ما خرج منها.
 *
 * ── لماذا هذا الملفّ ──────────────────────────────────────────────────────
 * القاعدةُ صارت تعرف الطيَّ الآمن منذ 0196، وصار قابلاً للرجوع بـ0197 و0198 —
 * لكنّ تدقيقاً قبل النشر قال إنّ `merge_companies` و`company_twins` **بلا
 * موضعِ نداءٍ واحد** بـ`src/`. دالّةٌ لا تصلها العيادة دالّةٌ غيرُ موجودة:
 * الطريقُ الوحيدُ المتاح كان زرَّ الحذف، وهو الذي يفقد.
 *
 * والمقيسُ بالإنتاج: ١٠٢ شركةٍ من ١٤٣ مكرّرةٌ بأسماءٍ **متطابقةِ البايتات**،
 * و٨٥٪ من شركات اليوم الواحد توائم. فالشاشةُ تقول العددَ قبل الضغط، وتقول
 * **ما ينتقل** لا ما بالمجموعة كلِّها.
 *
 * ── وقاعدتان بالعرض ──────────────────────────────────────────────────────
 * ١) **لا `window.confirm`.** «اختفى كأنه ما كان» جذرُه تأكيدُ متصفّحٍ يُقبل بلا
 *    قراءة على حسابٍ مشترك — فالنافذةُ تسمّي ما يتحرّك بالعدد.
 * ٢) **القائمةُ التي يُبنى عليها قرارٌ ترمي ولا تبلع.** قائمةُ توائمَ ناقصةٌ عن
 *    خطأٍ تقول «ماكو تكرار» فتُصدَّق.
 * ==========================================================================*/
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, GitMerge, Loader2, RefreshCw, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import type { Company, CompanySection, CompanyTwinGroup, DeletedCompany, DeletedCompanySection, Product } from "@/types";
import { Dialog } from "@/components/ui/Dialog";
import { Button, useToast, Skeleton } from "@/components/ui";
import { repo } from "@/lib/repo";
import { describeDbError, withTimeout } from "@/lib/errors";
import { formatDate, formatNum, formatQty } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/* ---------------------------------------------------------------------------
 * بطاقةُ «شركاتٌ مكرّرة» — تظهر فقط حين يوجد تكرارٌ فعليّ.
 * ------------------------------------------------------------------------ */
export function CompanyTwinsCard({ companies, onChanged }: { companies: Company[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<CompanyTwinGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<CompanyTwinGroup | null>(null);

  const load = async () => {
    setFailed(false);
    try { setGroups(await withTimeout(repo.companyTwins(), 15000)); }
    catch { setGroups(null); setFailed(true); }
  };
  // تُعاد القراءة كلّما تغيّرت القائمة: طيٌّ أو إضافةٌ يغيّران المجموعات.
  useEffect(() => { void load(); }, [companies.length]);

  if (failed) {
    return (
      <div className="card flex flex-wrap items-center gap-3 border-warn-200 bg-warn-50/60 p-3 dark:bg-warn-500/10">
        <TriangleAlert size={18} className="shrink-0 text-warn-600" />
        <p className="min-w-0 flex-1 text-xs text-ink-muted">{t("twin.loadFailed", "تعذّر فحص التكرار. ما نكدر نقول «ماكو تكرار» وإحنا ما وصلنا — أعد المحاولة.")}</p>
        <Button size="sm" variant="secondary" leftIcon={<RefreshCw size={14} />} onClick={() => { playTap(); void load(); }}>{t("common.retry", "إعادة المحاولة")}</Button>
      </div>
    );
  }
  if (!groups?.length) return null;

  const extra = groups.reduce((n, g) => n + g.rows - 1, 0);
  return (
    <>
      <div className="card space-y-3 border-warn-200 bg-warn-50/60 p-4 dark:bg-warn-500/10" data-twinscard>
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-warn-500/15 text-warn-600"><GitMerge size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold text-ink">{t("twin.title", "شركات مكرّرة — نفس الاسم بأكثر من صف")}</p>
            <p className="text-xs text-ink-muted">{t("twin.sub", "{{groups}} اسم متكرر، و{{extra}} صف زايد. الطي يجمع منتجاتها وفواتيرها وديونها بصف واحد — وما يضيع ولا شي.", { groups: formatNum(groups.length), extra: formatNum(extra) })}</p>
          </div>
        </div>
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.norm} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-1 p-2.5" data-twingroup={g.norm}>
              <Building2 size={16} className="shrink-0 text-ink-subtle" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{g.keep_name}</p>
                <p className="text-2xs text-ink-muted">
                  {t("twin.rowsN", "{{n}} صف", { n: formatNum(g.rows) })}
                  {" · "}
                  {t("twin.movingShort", "ينتقل {{p}} منتج و{{s}} صنف", { p: formatNum(g.moving_products), s: formatNum(g.moving_sections) })}
                </p>
              </div>
              <Button size="sm" variant="secondary" leftIcon={<GitMerge size={14} />} onClick={() => { playTap(); setOpen(g); }}>
                {t("twin.review", "راجع وادمج")}
              </Button>
            </div>
          ))}
        </div>
      </div>
      {open && (
        <MergeCompaniesDialog
          group={open}
          companies={companies}
          onClose={() => setOpen(null)}
          onMerged={() => { setOpen(null); void load(); onChanged(); }}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------
 * نافذةُ الطيّ: أيُّ صفٍّ يبقى، وماذا ينتقل بالضبط.
 * ------------------------------------------------------------------------ */
export function MergeCompaniesDialog({ group, companies, onClose, onMerged }: {
  group: CompanyTwinGroup; companies: Company[]; onClose: () => void; onMerged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [keepId, setKeepId] = useState(group.keep_id);
  const [busy, setBusy] = useState(false);
  const rows = group.ids.map((id) => companies.find((c) => c.id === id)).filter(Boolean) as Company[];
  const drops = rows.filter((c) => c.id !== keepId);

  const merge = async () => {
    if (busy || drops.length === 0) return;
    setBusy(true);
    try {
      /* واحدةً واحدة: كلُّ طيٍّ معاملةٌ بالقاعدة، فلو تعثّر الثاني بقي الأوّل
       * كاملاً — لا نصفَ صفٍّ ولا صفٌّ معلّق. */
      for (const d of drops) await repo.mergeCompanies(keepId, d.id);
      playSuccess();
      toast.success(t("twin.done", "انطوت {{n}} شركة بـ«{{name}}» — كل شي انتقل، وتلكاهن بالمحذوفات لو احتجت ترجّعهن", {
        n: formatNum(drops.length), name: rows.find((c) => c.id === keepId)?.name ?? "",
      }));
      onMerged();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} size="md" title={t("twin.mergeTitle", "ادمج الشركات المكرّرة")}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>{t("common.cancel", "إلغاء")}</Button>
        <Button loading={busy} disabled={drops.length === 0} leftIcon={<GitMerge size={16} />} onClick={() => void merge()} data-mergego>
          {t("twin.mergeGo", "ادمج {{n}} بالباقية", { n: formatNum(drops.length) })}
        </Button>
      </>}>
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-ink-muted">
          {t("twin.pickHint", "اختر الصف الي يبقى — باقي الصفوف تنطوي بيه. منتجاتها وأصنافها وفواتيرها ودفعاتها وديونها كلها تنتقل للباقي، وما ينحذف ولا سطر.")}
        </p>
        <div className="space-y-2">
          {rows.map((c) => (
            <label key={c.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${c.id === keepId ? "border-brand-500 bg-brand-50/60 dark:bg-brand-500/10" : "border-line bg-surface-1 hover:border-line-strong"}`}>
              <input type="radio" name="keep" className="mt-1" checked={c.id === keepId} onChange={() => setKeepId(c.id)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
                {c.note && <p className="truncate text-2xs text-ink-subtle">{c.note}</p>}
                <p className="text-2xs text-ink-muted">
                  {t("twin.createdAt", "انضافت {{when}}", { when: formatDate(c.created_at, i18n.language, true) })}
                  {c.id === keepId ? ` · ${t("twin.staysHere", "هذا الي يبقى")}` : ""}
                </p>
              </div>
            </label>
          ))}
        </div>
        {/* الأعدادُ من `company_twins` — **ما ينتقل** لا ما بالمجموعة كلِّها.
            وتُقاس على الباقية المقترحة؛ تبديلُ الباقي يغيّر التوزيع لا المجموع. */}
        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <p className="mb-2 text-xs font-semibold text-ink-muted">{t("twin.movingTitle", "شنو راح ينتقل")}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-muted sm:grid-cols-3">
            <MoveStat label={t("twin.mProducts", "منتج")} n={group.moving_products} />
            <MoveStat label={t("twin.mSections", "صنف")} n={group.moving_sections} />
            <MoveStat label={t("twin.mPurchases", "فاتورة شراء")} n={group.moving_purchases} />
            <MoveStat label={t("twin.mPayments", "دفعة للمورّد")} n={group.moving_payments} />
            <MoveStat label={t("twin.mCharges", "مطالبة/دين")} n={group.moving_charges} />
            {group.pool_moving > 0 && <MoveStat label={t("twin.mPool", "مخزون مجمّع")} n={group.pool_moving} />}
          </div>
          <p className="mt-2 text-2xs leading-relaxed text-ink-subtle">
            {t("twin.poolNote", "الأصناف الي بنفس الاسم تنطوي ببعض ومخزونها المجمّع ينجمع — ما تنحذف ولا وحدة.")}
          </p>
        </div>
      </div>
    </Dialog>
  );
}

/* **الكسرُ لا يُقصّ.** أمسكه فحصٌ بالمتصفّح: حوضٌ ينتقل مقدارُه ٣٫٢٥ كان
 * يُعرض «٣» لأن `formatNum` للأعداد والمبالغ (وتعليقُها بـ`utils` يقول ذلك
 * حرفاً). ورقمٌ يُبنى عليه قرارُ طيٍّ لا يجوز أن يكذب بربع وحدة — والقاعدةُ
 * هنا لا بموضع النداء حتى لا يُنسى بإضافةٍ لاحقة. */
function MoveStat({ label, n }: { label: string; n: number }) {
  return (
    <span className="flex items-center justify-between gap-2 tabular-nums">
      <span>{label}</span><b className="text-ink">{formatQty(n)}</b>
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * نافذةُ الحذف — بديلُ `window.confirm`.
 * ------------------------------------------------------------------------ */
export function DeleteCompanyDialog({ company, sections, products, twin, onClose, onDeleted, onMerge }: {
  company: Company; sections: CompanySection[]; products: Product[];
  twin: CompanyTwinGroup | null; onClose: () => void; onDeleted: () => void; onMerge: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = products.filter((p) => p.company_id === company.id);
  const pooled = sections.reduce((n, s) => n + (s.pooled_stock ?? 0), 0);

  const del = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await repo.deleteCompany(company.id, reason);
      playSuccess();
      toast.success(t("twin.deleted", "انحذفت «{{name}}» — تلكاها بتبويب المحذوفات لو احتجتها", { name: company.name }));
      onDeleted();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} size="sm" title={t("twin.deleteTitle", "حذف شركة")}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>{t("common.cancel", "إلغاء")}</Button>
        {twin && <Button variant="secondary" disabled={busy} leftIcon={<GitMerge size={16} />} onClick={() => { playTap(); onMerge(); }}>{t("twin.mergeInstead", "ادمجها بدل الحذف")}</Button>}
        <Button variant="danger" loading={busy} leftIcon={<Trash2 size={16} />} onClick={() => void del()} data-delcogo>
          {t("twin.deleteGo", "احذف — تروح للمحذوفات")}
        </Button>
      </>}>
      <div className="space-y-3">
        {/* توأمٌ يُحذف = نصفُ التاريخ يروح لتبويبٍ ثانٍ بلا سبب. الطيُّ هو الجواب. */}
        {twin && (
          <div className="flex items-start gap-2 rounded-xl border border-warn-200 bg-warn-50/60 p-3 dark:bg-warn-500/10">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn-600" />
            <p className="text-xs leading-relaxed text-ink-muted">
              {t("twin.deleteIsTwin", "هذي الشركة مكرّرة — أكو {{n}} صف بنفس الاسم. الأفضل تدمجهن بصف واحد بدل ما تحذف، حتى يبقى تاريخها كامل بمكان واحد.", { n: formatNum(twin.rows) })}
            </p>
          </div>
        )}
        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <p className="truncate text-base font-semibold text-ink">{company.name}</p>
          {company.note && <p className="truncate text-2xs text-ink-subtle">{company.note}</p>}
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-muted sm:grid-cols-3">
            <MoveStat label={t("twin.mProducts", "منتج")} n={mine.length} />
            <MoveStat label={t("twin.mSections", "صنف")} n={sections.length} />
            {pooled > 0 && <MoveStat label={t("twin.mPool", "مخزون مجمّع")} n={pooled} />}
          </div>
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">
          {t("twin.deleteHint", "الشركة وأصنافها وحوضها تروح لتبويب «المحذوفات». المنتجات تبقى بالمخزن بس بلا شركة، والفواتير والدفعات والديون تبقى محفوظة — و«استرجاع» يرجّع كل شي مثل ما كان.")}
        </p>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120}
          placeholder={t("twin.deleteReason", "سبب الحذف (اختياري)")} />
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------
 * سلّةُ الشركات والأصناف — تحت تبويب «المحذوفات».
 * ------------------------------------------------------------------------ */
export function CompanyTrash({ onChanged }: { onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [cos, setCos] = useState<DeletedCompany[] | null>(null);
  const [secs, setSecs] = useState<DeletedCompanySection[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setFailed(false);
    try {
      const [a, b] = await Promise.all([
        withTimeout(repo.listDeletedCompanies(), 15000),
        withTimeout(repo.listDeletedCompanySections(), 15000),
      ]);
      setCos(a); setSecs(b);
    } catch { setFailed(true); }
  };
  useEffect(() => { void load(); }, []);

  const restoreCo = async (d: DeletedCompany) => {
    if (busy) return;
    setBusy(d.id);
    try {
      const c = await repo.restoreCompany(d.id);
      playSuccess();
      toast.success(t("twin.restored", "رجعت «{{name}}» بكل شي كان إلها", { name: c.name }));
      await load(); onChanged();
    } catch (e) { playWarning(); toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined); }
    finally { setBusy(null); }
  };
  const restoreSec = async (d: DeletedCompanySection) => {
    if (busy) return;
    setBusy(d.id);
    try {
      const s = await repo.restoreCompanySection(d.id);
      playSuccess();
      toast.success(t("twin.restoredSection", "رجع صنف «{{name}}» بحوضه ومنتجاته", { name: s.name }));
      await load(); onChanged();
    } catch (e) { playWarning(); toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined); }
    finally { setBusy(null); }
  };

  if (failed) {
    return (
      <div className="card space-y-3 p-6 text-center">
        <p className="text-sm text-ink-subtle">{t("twin.trashFailed", "تعذّر تحميل الشركات المحذوفة — أعد المحاولة قبل ما تعيد إدخال شي.")}</p>
        <Button size="sm" leftIcon={<RefreshCw size={14} />} onClick={() => { playTap(); void load(); }}>{t("common.retry", "إعادة المحاولة")}</Button>
      </div>
    );
  }
  if (cos === null || secs === null) return <Skeleton className="h-16 rounded-2xl" />;
  // صورةُ صنفٍ استُهلكت بالفكّ تُحذف بالقاعدة — وهذا حزامُ أمانٍ للنسخ القديمة.
  const liveSecs = secs.filter((s) => !cos.some((c) => (c.sections ?? []).some((x) => x.id === s.id)));
  if (cos.length === 0 && liveSecs.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-ink-muted">{t("twin.trashTitle", "شركات وأصناف محذوفة")}</p>
      {cos.map((d) => (
        <div key={d.id} className="card flex flex-wrap items-center gap-3 p-3" data-cotrashrow={d.id}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-subtle"><Building2 size={16} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{d.row?.name}</p>
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-2xs text-ink-muted">
              <span>{t("twin.trashAt", "انحذفت {{when}}", { when: formatDate(d.deleted_at, i18n.language) })}</span>
              <span>{t("twin.trashHas", "{{p}} منتج · {{s}} صنف", { p: formatNum((d.product_ids ?? []).length), s: formatNum((d.sections ?? []).length) })}</span>
              {d.merged_into && <span className="font-semibold text-brand-600">{t("twin.trashMerged", "مدموجة بشركة ثانية — الاسترجاع يفكّ الدمج")}</span>}
              {d.reason && <span className="italic">{d.reason}</span>}
            </p>
          </div>
          <Button size="sm" variant="secondary" loading={busy === d.id} disabled={!!busy && busy !== d.id}
            leftIcon={<RotateCcw size={14} />} onClick={() => void restoreCo(d)}>{t("pos.restoreProduct", "استرجاع")}</Button>
        </div>
      ))}
      {liveSecs.map((d) => (
        <div key={d.id} className="card flex flex-wrap items-center gap-3 p-3" data-sectrashrow={d.id}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-subtle"><Loader2 size={16} className="opacity-0" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{d.row?.name}</p>
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-2xs text-ink-muted">
              <span>{t("twin.trashAt", "انحذفت {{when}}", { when: formatDate(d.deleted_at, i18n.language) })}</span>
              {(d.row?.pooled_stock ?? 0) > 0 && <span>{t("twin.trashPool", "حوض {{n}}", { n: formatQty(d.row?.pooled_stock ?? 0) })}</span>}
            </p>
          </div>
          <Button size="sm" variant="secondary" loading={busy === d.id} disabled={!!busy && busy !== d.id}
            leftIcon={<RotateCcw size={14} />} onClick={() => void restoreSec(d)}>{t("pos.restoreProduct", "استرجاع")}</Button>
        </div>
      ))}
    </div>
  );
}
