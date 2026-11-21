// ============================================================================
// منتقي مكتبة الصور (0175) — قراءةٌ فقط من جهة العيادة.
//
// مكتبتان (0285): العامّةُ ومكتبةُ العيادة الخاصّة — تبويبان (LibraryScope، كسولٌ بنطاقه) حين يكون للعيادة
// صورٌ بمكتبتها، يبدأ على مكتبتها (هي ما رتّبته بنفسها). وإدارتُها من «مكتبة الصور» (/photos/library) لا من هنا.
//
// المكتبة يبنيها مشغّل المنصّة من لوحته مقسّمةً شركةً وصنفاً (قرار المالك،
// docs/store-plan.md)؛ الدكتور هنا يتصفّح ويبحث ويضغط — والاختيار يرجع
// «مسار» ملف المكتبة ليُكتب بـ`image_path` للمنتج: مرجعٌ لملفٍ واحدٍ يخدم
// كلَّ العيادات، لا نسخة. لا زرَّ رفعٍ هنا عمداً.
// ============================================================================
import { Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Images } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button, Skeleton, useToast } from "@/components/ui";
import { repo } from "@/lib/repo";
import { productImageUrl } from "@/lib/storeLib";
import { describeDbError } from "@/lib/errors";
import { cn, searchable, formatNum } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { childrenOf, cutAt, keyOfValue, LEVELS, nextLevel, under, valueOf, type LibPath } from "@/lib/libraryLevels";
import { rowsOf, type LibScope } from "@/lib/libraryScope";
import { page } from "@/lib/lazyPage";
import type { LibraryImage } from "@/types";

/* فوق هذا العدد تُرسم الأولى وعدّادُ الباقي — مكتبةٌ بآلاف الصور لا تُرسم دفعةً بشاشة هاتف. */
const PICK_CAP = 300;
/* تبويبا المكتبتين بنطاقهما (`libp`) — النصفُ الباردُ ممتلئ، ولا يُحمَّلان إلا لعيادةٍ لها مكتبتُها. */
const LibraryScope = page(() => import("@/components/inventory/LibraryScope").then((m) => ({ default: m.LibraryScope })), ["libp"]);

export function ImageLibraryPicker({ open, onClose, onPick }: {
  open: boolean;
  onClose: () => void;
  /** يُستدعى بالصف المختار — المستهلك يكتب `row.path` بحقل صورة المنتج. */
  onPick: (row: LibraryImage) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<LibraryImage[] | null>(null);
  /* فشلُ التحميل حالةٌ تُقال مع «أعد المحاولة» — كان يضع [] فيقول «المكتبة فارغة» عن خطأ
   * (CLAUDE.md: قائمةٌ ناقصة أخطرُ من خطأ ظاهر). والمصوّرُ يتّكئ عليها الآن أكثر. */
  const [failed, setFailed] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState("");
  /* المستوياتُ الأربعة (0284) فتاتَ خبز: شركة ← صنف ← وكالة ← قسم — بلا نصٍّ جديد (النصفُ الباردُ ممتلئ):
   * الجذرُ «كل الشركات» القائم، والأسماءُ نفسُها، و«—» لما لا اسمَ له. */
  const [path, setPath] = useState<LibPath>({});
  const [scope, setScope] = useState<LibScope>("mine");

  useEffect(() => {
    if (!open) return;
    setRows(null); setFailed(null); setScope("mine"); setPath({});
    repo.listImageLibrary()
      .then(setRows)
      .catch((e) => { const m = describeDbError(e, t); setFailed(m); toast.error(m); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tick]);

  /* المكتبتان: تبويبٌ حين يكون للعيادة صورٌ بمكتبتها، وإلا العامّةُ وحدها (وقاعدةٌ قبل 0285 كلُّها عامّة). */
  const mineN = useMemo(() => (rows ? rowsOf(rows, "mine").length : 0), [rows]);
  const hasMine = mineN > 0;
  const eff: LibScope = hasMine ? scope : "public";
  const scoped = useMemo(() => (rows ? rowsOf(rows, eff) : null), [rows, eff]);
  const level = nextLevel(path);
  const kids = useMemo(() => (scoped && level ? childrenOf(scoped, path, level) : []), [scoped, path, level]);
  const showKids = kids.length > 1 || (kids.length === 1 && kids[0].label != null);
  const crumbs = LEVELS.filter((l) => path[l] !== undefined);
  const crumbLabel = (l: (typeof LEVELS)[number]) => {
    const hit = (scoped ?? []).find((r) => keyOfValue(valueOf(r, l)) === path[l]);
    return (hit && valueOf(hit, l)) ?? "—";
  };
  const shown = useMemo(() => {
    const ql = searchable(q);
    return under(scoped ?? [], path).filter((r) =>
      !ql || [r.name, r.section, r.company, r.agency, r.kind, r.barcode].some((x) => x && searchable(x).includes(ql)));
  }, [scoped, q, path]);

  return (
    <Modal open={open} onClose={onClose} title={t("lib.pickTitle", "اختر من مكتبة الصور")}>
      <div className="space-y-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input className="input ps-9" value={q} onChange={(e) => setQ(e.target.value)} data-libsearch
            placeholder={t("lib.searchPh", "دوّر بالاسم أو الشركة أو الصنف…")} />
        </div>
        {hasMine && rows && (
          <Suspense fallback={null}>
            <LibraryScope scope={eff} onScope={(s) => { setScope(s); setPath({}); }} mine={mineN} pub={rows.length - mineN} />
          </Suspense>
        )}
        {(scoped?.length ?? 0) > 0 && (
          <div className="space-y-1.5" data-libpath>
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={() => { playTap(); setPath({}); }} data-libcrumb="root"
                className={cn("rounded-full px-3 py-1 text-2xs font-bold transition",
                  crumbs.length === 0 ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3")}>
                {t("lib.allCompanies", "كل الشركات")}
              </button>
              {crumbs.map((l, i) => (
                <button key={l} onClick={() => { playTap(); setPath(cutAt(path, l)); }} data-libcrumb={l} dir="auto"
                  className={cn("rounded-full px-3 py-1 text-2xs font-bold transition",
                    i === crumbs.length - 1 ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3")}>
                  {crumbLabel(l)}
                </button>
              ))}
            </div>
            {showKids && level && (
              <div className="flex flex-wrap gap-1.5" data-libkids={level}>
                {kids.map((k) => (
                  <button key={k.key} onClick={() => { playTap(); setPath({ ...path, [level]: k.key }); }} data-libkid={k.label ?? ""} dir="auto"
                    className="rounded-full border border-line px-3 py-1 text-2xs font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">
                    {k.label ?? "—"} <span className="opacity-70">{formatNum(k.count)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {failed ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-6 text-center dark:border-danger-500/30 dark:bg-danger-500/10">
            <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">{failed}</p>
            <Button size="sm" variant="secondary" onClick={() => { playTap(); setTick((n) => n + 1); }}>{t("common.retry", "إعادة المحاولة")}</Button>
          </div>
        ) : rows === null ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong p-8 text-center">
            <Images size={24} className="text-ink-subtle" />
            <p className="text-sm text-ink-subtle">
              {(scoped ?? []).length === 0
                ? t("lib.empty", "المكتبة فارغة بعد — يعبّيها مشغّل المنصّة، وتكدر تصوّر منتجك بنفسك.")
                : t("lib.noMatch", "ماكو صورة تطابق بحثك.")}
            </p>
          </div>
        ) : (
          <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4" data-libgrid>
            {shown.slice(0, PICK_CAP).map((r) => (
              <button key={r.id} onClick={() => { playTap(); onPick(r); onClose(); }}
                className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface-1 text-start transition hover:border-brand-400 hover:shadow-raised">
                <img src={productImageUrl(r.path) ?? undefined} alt="" loading="lazy"
                  className="aspect-square w-full bg-surface-2 object-contain p-1"
                  onError={(e) => { e.currentTarget.hidden = true; }} />
                <span className="line-clamp-2 p-1.5 text-2xs font-bold leading-snug text-ink">{r.name}</span>
                {(r.agency || r.section) && <span className="px-1.5 pb-1.5 text-2xs text-ink-subtle" dir="auto">{[r.agency, r.section].filter(Boolean).join(" · ")}</span>}
              </button>
            ))}
            {shown.length > PICK_CAP && (
              <span className="col-span-full py-2 text-center text-2xs font-bold text-ink-subtle" data-libmore>+{formatNum(shown.length - PICK_CAP)}</span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
