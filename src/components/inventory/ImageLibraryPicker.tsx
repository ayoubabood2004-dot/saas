// ============================================================================
// منتقي مكتبة الصور (0175، والمستوياتُ 0284، والمكتبتان 0285) — قراءةٌ فقط، ومالكُ النطاق `libp`.
//
// طلبُ المالك ٢١/١١: «حسّنلي تجربة المستخدم… الأزرار واضحة والصور واضحة وكبيرة وكبّر الواجهة بحيث تخلي
// الاختيار أسهل». فالنافذةُ بعرض الشاشة وارتفاعٍ ثابت: فوقٌ لا يتحرّك (المنتجُ الذي نختار له، والبحث،
// والمكتبتان، وفتاتُ المستويات بزرّ «رجوع»)، وتحته الشبكةُ وحدها تتمرّر — بطاقاتٌ كبيرة بخلفيةٍ بيضاء
// (صورُ المنتجات على أبيض)، وكلُّ بطاقةٍ تقول حالَها: تتحمّل، أو ما وصلت، أو «الحالية».
//
// و«صورة لـ…» (`target`): المنتجُ يُرى فوق، ومقترحاتُه أوّلاً (الباركودُ نفسُه ثمّ كلماتُ الاسم —
// suggestFor)، والمكتبةُ تُفتح على شركته إن كانت بها شركةٌ بالاسم نفسِه. و«الجولة» (`run`): المضيفُ يمشي
// منتجاتٍ واحداً بعد واحد (المتجر: صورُ شركةٍ كاملة) — الاختيارُ لا يُغلق، و«تخطّي» و«السابق» هنا، والمسارُ
// يبقى بين منتجٍ وآخر (الشركةُ نفسُها غالباً).
//
// المكتبتان: تبويبان حين يكون للعيادة صورٌ بمكتبتها، يبدأ على مكتبتها إلا إن طلب المضيفُ العامّة.
// والمضيفون يحمّلونه كسولاً (`page(..., ["libp"])`) — النصفُ الباردُ ممتلئ، ونصوصُه بنطاقه.
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Images, ArrowRight, Building2, ImageOff, Check, SkipForward, Loader2, ChevronRight } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button, Skeleton, useToast } from "@/components/ui";
import { repo } from "@/lib/repo";
import { productImageUrl } from "@/lib/storeLib";
import { describeDbError } from "@/lib/errors";
import { cn, searchable, formatNum } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { childrenOf, cleanLibName, cutAt, keyOfValue, LEVELS, nextLevel, under, valueOf, type Level, type LibPath } from "@/lib/libraryLevels";
import { rowsOf, suggestFor, type LibScope } from "@/lib/libraryScope";
import type { LibraryImage } from "@/types";

/* أوّلُ دفعةٍ تُرسم، و«عرض المزيد» يزيد مثلها — مكتبةٌ بآلاف الصور لا تُرسم دفعةً بشاشة هاتف. */
const PICK_PAGE = 60;

export interface PickTarget { name: string; barcode?: string | null; company?: string | null; image_path?: string | null }
export interface PickRun { index: number; total: number; onSkip: () => void; onPrev?: (() => void) | null }

/** صورةٌ تقول حالَها: تتحمّل (نبضة)، أو وصلت، أو ما وصلت (أيقونةٌ وجملة) — لا مربّعٌ فارغٌ يُحيّر. */
function LibImg({ path, alt }: { path: string; alt: string }) {
  const { t } = useTranslation();
  const [st, setSt] = useState<"loading" | "ok" | "err">("loading");
  const src = productImageUrl(path) ?? undefined;
  useEffect(() => { setSt("loading"); }, [src]);
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white">
      {st === "loading" && <div className="absolute inset-0"><Skeleton className="h-full w-full rounded-none" /></div>}
      {st === "err" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400" data-libimg-err>
          <ImageOff size={26} />
          <span className="text-2xs font-bold">{t("libp.broken")}</span>
        </div>
      ) : (
        <img src={src} alt={alt} loading="lazy" decoding="async"
          className={cn("relative h-full w-full object-contain p-2 transition-opacity", st === "ok" ? "opacity-100" : "opacity-0")}
          onLoad={() => setSt("ok")} onError={() => setSt("err")} />
      )}
    </div>
  );
}

export function ImageLibraryPicker({ open, onClose, onPick, target = null, run = null, busy = false, startScope }: {
  open: boolean;
  onClose: () => void;
  /** يُستدعى بالصف المختار — المستهلك يكتب `row.path` بحقل صورة المنتج. بلا جولة: النافذةُ تُغلق بعده. */
  onPick: (row: LibraryImage) => void;
  /** المنتجُ الذي نختار له: يُرى فوق، ومقترحاتُه أوّلاً، وشركتُه مسارُ البداية. */
  target?: PickTarget | null;
  /** جولةٌ على منتجات: الاختيارُ لا يُغلق — المضيفُ ينقل للتالي. */
  run?: PickRun | null;
  /** المضيفُ يحفظ الاختيارَ السابق — البطاقاتُ موقوفةٌ حتى يرجع. */
  busy?: boolean;
  /** «public» يبدأ على المكتبة العامة ولو كان للعيادة مكتبتُها. */
  startScope?: LibScope;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<LibraryImage[] | null>(null);
  /* فشلُ التحميل حالةٌ تُقال مع «أعد المحاولة» — كان يضع [] فيقول «المكتبة فارغة» عن خطأ
   * (CLAUDE.md: قائمةٌ ناقصة أخطرُ من خطأ ظاهر). والمصوّرُ يتّكئ عليها الآن أكثر. */
  const [failed, setFailed] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState("");
  const [path, setPath] = useState<LibPath>({});
  const [scope, setScope] = useState<LibScope>(startScope ?? "mine");
  const [shown, setShown] = useState(PICK_PAGE);

  useEffect(() => {
    if (!open) return;
    setRows(null); setFailed(null); setScope(startScope ?? "mine"); setPath({}); setQ(""); setShown(PICK_PAGE);
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

  /* البداية بشركة المنتج إن كان بالمكتبة شركةٌ باسمها — مرّةً لكلّ فتحٍ أو تبديلِ مكتبة، لا مع كلّ منتجٍ بالجولة
   * (المسارُ الذي اختاره يبقى: منتجاتُ الشركة الواحدة بوكالتها غالباً). */
  /* مستوىً بابنٍ واحدٍ مسمّى ينزل وحده (شركةٌ بصنفٍ واحد: «منتجات قطط») — ضغطةٌ لا خيارَ فيها تُوفَّر. لا للقسم:
   * القسمُ آخرُ مستوى وصورُه تُرسم على أيّ حال. */
  const descend = (p: LibPath): LibPath => {
    if (!scoped) return p;
    let out = p;
    for (let lv = nextLevel(out); lv && lv !== "section"; lv = nextLevel(out)) {
      const ks = childrenOf(scoped, out, lv);
      if (ks.length !== 1 || ks[0].label == null) break;
      out = { ...out, [lv]: ks[0].key };
    }
    return out;
  };
  const companyKey = target?.company ? keyOfValue(target.company.trim() || null) : "";
  const loaded = scoped !== null;
  useEffect(() => {
    if (!loaded || !scoped || !companyKey) return;
    if (scoped.some((r) => keyOfValue(valueOf(r, "company")) === companyKey)) setPath(descend({ company: companyKey }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, eff, companyKey]);

  // منتجٌ جديدٌ بالجولة: البحثُ والدفعةُ يُصفَّران، والمسارُ يبقى.
  const targetKey = target ? `${target.name}|${target.barcode ?? ""}` : "";
  useEffect(() => { setQ(""); setShown(PICK_PAGE); }, [targetKey]);

  const level = nextLevel(path);
  const kids = useMemo(() => (scoped && level ? childrenOf(scoped, path, level) : []), [scoped, path, level]);
  const showKids = kids.length > 1 || (kids.length === 1 && kids[0].label != null);
  const crumbs = LEVELS.filter((l) => path[l] !== undefined);
  const crumbLabel = (l: Level) => {
    const hit = (scoped ?? []).find((r) => keyOfValue(valueOf(r, l)) === path[l]);
    return (hit && valueOf(hit, l)) ?? t("libp.noValue");
  };
  const searching = q.trim().length > 0;
  const list = useMemo(() => {
    const ql = searchable(q);
    const base = searching ? (scoped ?? []) : under(scoped ?? [], path);
    return base.filter((r) =>
      !ql || [cleanLibName(r.name), r.section, r.company, r.agency, r.kind, r.barcode].some((x) => x && searchable(x).includes(ql)));
  }, [scoped, q, path, searching]);
  const suggested = useMemo(() => (target && scoped && !searching ? suggestFor(scoped, target, 8) : []), [scoped, target, searching]);

  const back = () => { playTap(); setPath(cutAt(path, crumbs.length >= 2 ? crumbs[crumbs.length - 2] : null)); setShown(PICK_PAGE); };
  const pick = (r: LibraryImage) => {
    if (busy) return;
    playTap();
    onPick(r);
    if (!run) onClose();
  };

  const card = (r: LibraryImage) => {
    const current = !!target?.image_path && target.image_path === r.path;
    const name = cleanLibName(r.name);
    return (
      <button key={r.id} type="button" onClick={() => pick(r)} disabled={busy} data-libcard
        className={cn("group relative flex flex-col gap-1.5 rounded-2xl border bg-surface-1 p-1.5 text-start transition",
          "hover:border-brand-400 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60",
          current ? "border-success-400 ring-2 ring-success-400/40" : "border-line")}>
        <LibImg path={r.path} alt={name} />
        {current && (
          <span className="absolute start-3 top-3 inline-flex items-center gap-1 rounded-full bg-success-600 px-2 py-0.5 text-2xs font-bold text-white">
            <Check size={11} /> {t("libp.current")}
          </span>
        )}
        <span className="line-clamp-2 px-1 text-sm font-bold leading-snug text-ink" dir="auto" title={name}>{name}</span>
        {(r.agency || r.section) && <span className="truncate px-1 text-xs text-ink-subtle" dir="auto">{[r.agency, r.section].filter(Boolean).join(" · ")}</span>}
        <span className="mx-1 mb-0.5 mt-auto hidden items-center justify-center gap-1 rounded-xl bg-brand-600 py-1.5 text-xs font-bold text-white group-hover:flex group-focus-visible:flex">
          <Check size={13} /> {t("libp.choose")}
        </span>
      </button>
    );
  };

  const grid = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6";

  return (
    <Modal open={open} onClose={onClose} size="full" title={t("lib.pickTitle", "اختر من مكتبة الصور")}>
      <div className="flex h-[calc(92vh-8rem)] flex-col gap-3" data-libpicker>
        {target && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 p-2.5 dark:border-brand-500/30 dark:bg-brand-500/10" data-libtarget>
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white">
              {target.image_path
                ? <img src={productImageUrl(target.image_path) ?? undefined} alt="" className="h-full w-full object-contain p-1" />
                : <div className="grid h-full w-full place-items-center text-slate-400"><ImageOff size={20} /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-2xs font-bold text-brand-700 dark:text-brand-300">{t("libp.forProduct")}</p>
              <p className="truncate text-base font-extrabold text-ink" dir="auto">{target.name}</p>
              {target.barcode && <p className="truncate text-xs text-ink-subtle" dir="ltr">{target.barcode}</p>}
            </div>
            {run && (
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-full bg-surface-1 px-2.5 py-1 text-xs font-bold tabular-nums text-ink-muted" data-librun>
                  {busy ? <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {t("libp.saving")}</span>
                    : t("libp.run", { i: formatNum(run.index + 1), n: formatNum(run.total) })}
                </span>
                {run.onPrev && (
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => { playTap(); run.onPrev?.(); }} data-librun-prev>
                    {t("libp.prev")}
                  </Button>
                )}
                <Button size="sm" variant="secondary" disabled={busy} leftIcon={<SkipForward size={14} className="rtl:rotate-180" />}
                  onClick={() => { playTap(); run.onSkip(); }} data-librun-skip>
                  {t("libp.skip")}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search size={17} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input className="input h-12 ps-10 text-base" value={q} onChange={(e) => { setQ(e.target.value); setShown(PICK_PAGE); }} data-libsearch
              placeholder={t("lib.searchPh", "دوّر بالاسم أو الشركة أو الصنف…")} />
          </div>
          {hasMine && rows && (
            <div className="flex gap-1.5" data-libscopes>
              {([["mine", t("libp.mine"), mineN, Images], ["public", t("libp.public"), rows.length - mineN, Building2]] as const).map(([s, label, n, Icon]) => (
                <button key={s} type="button" onClick={() => { playTap(); setScope(s); setPath({}); setShown(PICK_PAGE); }} data-libscope={s}
                  className={cn("inline-flex h-12 items-center gap-1.5 rounded-2xl px-4 text-sm font-bold transition",
                    eff === s ? "bg-brand-600 text-white shadow-soft" : "border border-line bg-surface-1 text-ink-muted hover:text-ink")}>
                  <Icon size={16} /> {label} <span className="opacity-75">{formatNum(n)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {(scoped?.length ?? 0) > 0 && !searching && (
          <div className="shrink-0 space-y-2" data-libpath>
            <div className="flex flex-wrap items-center gap-1.5">
              {crumbs.length > 0 && (
                <button type="button" onClick={back} data-libback
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-surface-1 px-3 text-sm font-bold text-ink transition hover:bg-surface-2">
                  <ArrowRight size={16} className="ltr:rotate-180" /> {t("libp.back")}
                </button>
              )}
              <button type="button" onClick={() => { playTap(); setPath({}); setShown(PICK_PAGE); }} data-libcrumb="root"
                className={cn("h-10 rounded-xl px-3 text-sm font-bold transition",
                  crumbs.length === 0 ? "bg-brand-600 text-white" : "text-brand-600 hover:bg-surface-2")}>
                {t("lib.allCompanies", "كل الشركات")}
              </button>
              {crumbs.map((l, i) => (
                <span key={l} className="inline-flex items-center gap-1">
                  <ChevronRight size={14} className="text-ink-subtle rtl:rotate-180" />
                  <button type="button" onClick={() => { playTap(); setPath(cutAt(path, l)); setShown(PICK_PAGE); }} data-libcrumb={l} dir="auto"
                    className={cn("h-10 rounded-xl px-3 text-sm font-bold transition",
                      i === crumbs.length - 1 ? "bg-brand-600 text-white" : "text-brand-600 hover:bg-surface-2")}>
                    {crumbLabel(l)}
                  </button>
                </span>
              ))}
            </div>
            {showKids && level && (
              <div className="space-y-1">
                <p className="text-xs font-bold text-ink-subtle">{t(`libp.level.${level}`)} · {formatNum(kids.length)}</p>
                <div className="flex max-h-[7.5rem] flex-wrap gap-1.5 overflow-y-auto pe-1" data-libkids={level}>
                  {kids.map((k) => (
                    <button key={k.key} type="button" onClick={() => { playTap(); setPath(descend({ ...path, [level]: k.key })); setShown(PICK_PAGE); }}
                      data-libkid={k.label ?? ""} dir="auto"
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface-1 px-3 text-sm font-bold text-ink transition hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10">
                      {k.label ?? t("libp.noValue")} <span className="text-xs font-semibold text-ink-subtle">{formatNum(k.count)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto pe-1" data-libscroll>
          {failed ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-6 text-center dark:border-danger-500/30 dark:bg-danger-500/10">
              <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">{failed}</p>
              <Button size="sm" variant="secondary" onClick={() => { playTap(); setTick((n) => n + 1); }}>{t("common.retry", "إعادة المحاولة")}</Button>
            </div>
          ) : rows === null ? (
            <div className={grid}>
              {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {suggested.length > 0 && (
                <section className="space-y-2" data-libsuggest>
                  <p className="text-sm font-extrabold text-ink">{t("libp.suggested")}</p>
                  <div className={grid}>{suggested.map(card)}</div>
                </section>
              )}
              {list.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong p-8 text-center">
                  <Images size={26} className="text-ink-subtle" />
                  <p className="text-sm text-ink-subtle">
                    {(scoped ?? []).length === 0
                      ? t("lib.empty", "المكتبة فارغة بعد — يعبّيها مشغّل المنصّة، وتكدر تصوّر منتجك بنفسك.")
                      : t("lib.noMatch", "ماكو صورة تطابق بحثك.")}
                  </p>
                </div>
              ) : (
                <section className="space-y-2">
                  {suggested.length > 0 && <p className="text-sm font-extrabold text-ink">{t("libp.count", { n: formatNum(list.length) })}</p>}
                  <div className={grid} data-libgrid>{list.slice(0, shown).map(card)}</div>
                  {list.length > shown && (
                    <div className="flex justify-center pt-1">
                      <Button size="sm" variant="secondary" onClick={() => { playTap(); setShown((n) => n + PICK_PAGE); }} data-libmore>
                        {t("libp.more", { n: formatNum(list.length - shown) })}
                      </Button>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
