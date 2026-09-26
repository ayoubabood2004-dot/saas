import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookmarkPlus, Pencil, RotateCw, Star, Trash2, X } from "lucide-react";
import type { WaTemplate } from "@/types";
import { repo } from "@/lib/repo";
import { Button, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { describeDbError } from "@/lib/errors";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * قوالبُ العيادة (0218) — «اكتبها مرّة، استعملها كلَّ مرّة».
 *
 * رسالةُ العيادة بصياغتها (عرضٌ خاصّ، تذكيرٌ بأسلوبها) كانت تُكتب من جديد كلَّ إرسال.
 * هنا تُحفظ بعنوان **بالقاعدة** — يراها كلُّ جهازٍ بالعيادة — وتُختار بضغطة، وتُحدَّث
 * أو تُحذف (الحذفُ ضغطتان على نفس الشارة، لا نافذةَ متصفّح تُقبل بلا قراءة).
 * والنصُّ يحمل الرموزَ نفسَها فيُصاغ لكلّ زبونٍ عند الإرسال.
 * ========================================================================= */

export function MyTemplates({ message, onApply }: { message: string; onApply: (body: string) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [list, setList] = useState<WaTemplate[] | "loading" | "error">("loading");
  const [naming, setNaming] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<WaTemplate | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setList("loading");
    try { setList(await repo.listWaTemplates()); } catch { setList("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const err = (e: unknown) => {
    const m = e instanceof Error ? e.message : "";
    return m === "wa_templates_full" ? t("mytpl.full", "وصلتوا ١٠٠ قالب — احذفوا قالباً ما تستعملوه أوّلاً") : describeDbError(e, t);
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); playSuccess(); toast.success(ok); await load(); return true; }
    catch (e) { playWarning(); toast.error(err(e)); return false; }
    finally { setBusy(false); }
  };

  const saveNew = async () => {
    const title = (naming ?? "").trim();
    if (!title) { playWarning(); toast.error(t("mytpl.needTitle", "اكتب اسم للقالب")); return; }
    let saved: WaTemplate | null = null;
    const ok = await run(async () => { saved = await repo.saveWaTemplate({ title, body: message }); }, t("mytpl.saved", { title, defaultValue: "انحفظ القالب «{{title}}» — تلكاه هنا كل مرة" }));
    if (ok) { setNaming(null); setLoaded(saved); }
  };
  const update = async () => {
    if (!loaded) return;
    const ok = await run(() => repo.saveWaTemplate({ id: loaded.id, title: loaded.title, body: message }), t("mytpl.updated", { title: loaded.title, defaultValue: "انحدّث «{{title}}»" }));
    if (ok) setLoaded({ ...loaded, body: message.trim() });
  };
  const del = async (tpl: WaTemplate) => {
    if (confirmDel !== tpl.id) { playTap(); setConfirmDel(tpl.id); return; }
    setConfirmDel(null);
    const ok = await run(() => repo.deleteWaTemplate(tpl.id), t("mytpl.deleted", { title: tpl.title, defaultValue: "انحذف «{{title}}»" }));
    if (ok && loaded?.id === tpl.id) setLoaded(null);
  };

  const hasText = message.trim().length > 0;
  const changed = !!loaded && loaded.body.trim() !== message.trim();

  return (
    <div className="mb-3 rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 p-3 dark:border-brand-500/30 dark:bg-brand-500/5" data-mytpl>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-brand-800 dark:text-brand-200">
        <Star size={14} /> {t("mytpl.title", "قوالب عيادتك")}
        <span className="font-normal text-ink-subtle">{t("mytpl.hint", "— محفوظة لكل أجهزة العيادة")}</span>
      </p>
      {list === "loading" ? (
        <p className="text-xs text-ink-subtle">{t("mytpl.loading", "نجيب قوالبكم…")}</p>
      ) : list === "error" ? (
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          {t("mytpl.failed", "ما كدرنا نجيب قوالبكم")}
          <Button size="sm" variant="ghost" leftIcon={<RotateCw size={12} />} onClick={() => void load()}>{t("common.retry", "أعد المحاولة")}</Button>
        </div>
      ) : list.length === 0 ? (
        <p className="text-xs text-ink-subtle" data-mytpl-empty>{t("mytpl.none", "ما عندكم قوالب بعد — اكتبوا رسالة تحت واحفظوها كقالب.")}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {list.map((tpl) => (
            <span key={tpl.id} className={cn("inline-flex items-center overflow-hidden rounded-2xl border text-sm font-medium transition",
              confirmDel === tpl.id ? "border-danger-300 bg-danger-50 dark:bg-danger-500/15"
                : loaded?.id === tpl.id ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line bg-surface-1 text-ink-muted")}>
              <button type="button" data-mytpl-use={tpl.title} className="px-3 py-1.5 hover:text-brand-700"
                onClick={() => { playTap(); setConfirmDel(null); setLoaded(tpl); onApply(tpl.body); }}>
                {tpl.title}
              </button>
              <button type="button" data-mytpl-del={tpl.title} onClick={() => void del(tpl)} disabled={busy}
                aria-label={t("mytpl.delete", "احذف القالب")} title={t("mytpl.delete", "احذف القالب")}
                className={cn("grid h-full place-items-center px-2 py-1.5", confirmDel === tpl.id ? "bg-danger-600 text-white" : "text-ink-subtle hover:text-danger-600")}>
                {confirmDel === tpl.id ? <span className="text-2xs font-bold">{t("mytpl.sure", "احذف؟")}</span> : <Trash2 size={12} />}
              </button>
            </span>
          ))}
        </div>
      )}

      {hasText && list !== "loading" && list !== "error" && (
        naming !== null ? (
          <div className="mt-2 flex flex-wrap items-center gap-2" data-mytpl-naming>
            <input autoFocus className="input h-9 min-w-40 flex-1 text-sm" maxLength={60} value={naming} data-mytpl-name
              placeholder={t("mytpl.namePh", "اسم القالب، مثلاً: عرض الصيف")}
              onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void saveNew(); }} />
            <Button size="sm" loading={busy} onClick={() => void saveNew()} data-mytpl-savego>{t("common.save", "حفظ")}</Button>
            <button type="button" onClick={() => setNaming(null)} className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle hover:bg-surface-2"><X size={14} /></button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {changed && (
              <Button size="sm" variant="secondary" loading={busy} leftIcon={<Pencil size={13} />} onClick={() => void update()} data-mytpl-update>
                {t("mytpl.update", { title: loaded!.title, defaultValue: "حدّث «{{title}}» بهذا النص" })}
              </Button>
            )}
            <Button size="sm" variant="ghost" leftIcon={<BookmarkPlus size={13} />} onClick={() => { playTap(); setNaming(""); }} data-mytpl-save>
              {t("mytpl.saveNew", "احفظ هذه الرسالة كقالب")}
            </Button>
          </div>
        )
      )}
    </div>
  );
}
