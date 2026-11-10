/* ============================================================================
 * الطبلة (docs/field-cases-plan.md §٨) — رفيقةُ نطاق flk: وثيقةٌ للمربي قبل أن تكون سجلّاً للطبيب.
 *
 * كلُّ سطر: الأيامُ من بداية الطبلة (وتُعرض بالتاريخ وبالعمر)، المادّة، الجرعةُ كما بالعلبة (لكلّ لتر · لكلّ ١٠٠٠
 * طير · لكلّ طير · ملغم/كغم وزن بتركيز المنتج · كمّيةٌ كلّية)، الساعاتُ والطريقة، والسحب: **فارغٌ = «غير معروف»
 * بالأحمر، وصفرٌ = «بلا سحب» صراحةً** (معنى 0193). والطبلةُ المطبوعة أو المُرسَلة لا تتعدّل — التعديلُ نسخةٌ
 * ثانية يختمها الخادم ويوقف الأولى بيوم بدايتها، فيُقال «ابعثها من جديد».
 *
 * و«لا تبيع قبل» بالبطاقة والمطبوعة والواتساب **للوجبة كلّها** (كلُّ طبلاتها، والمستبدَلةُ بما انعطى منها حتى إيقافها)
 * — كما يحسبها الخادم (_flock_stats)؛ كانت للطبلة وحدها، فنسخةٌ ثانيةٌ بدواءٍ أقصرَ سحباً كانت تقول للمربي تاريخاً
 * أبكرَ من رأس الحالة (مراجعةٌ عدائيّة). وبالبيّاض سحبُ البيض بسطره وتاريخه، والطبلةُ الموقوفة بأيامها كما انعطت.
 *
 * والطباعةُ والواتساب **داخل الضغطة قبل أيّ انتظار** (درسُ الآيفون ١٩/١٠، wa-open-test): النافذةُ تُفتح وتُكتب
 * ثمّ يُختم «انطبعت»؛ وsendWhatsApp يُنادى أوّلاً ثمّ يُختم «انبعثت» حين يرجع — والمنعُ يُقال بزرّ إعادة.
 * ========================================================================= */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import i18next from "i18next";
import { Copy, MessageCircle, Pause, Pencil, Play, Plus, Printer, Square, Trash2 } from "lucide-react";
import { Badge, Button, Dialog, useToast } from "@/components/ui";
import { localISO } from "@/lib/utils";
import { rejectedBeforeCommit } from "@/lib/errors";
import { getClinicLogo, getClinicName, getDialCode } from "@/lib/settings";
import { waNumber } from "@/lib/phone";
import { quotaMessage, sendWhatsApp, useWarmWaQuota } from "@/lib/quotas";
import { flockApi, type FlockLineInput } from "@/lib/flockApi";
import { addDays, ageOn, diffDays, withdrawalOf } from "@/lib/flockMath";
import type { FlockBundle, FlockDosePer, FlockDoseUnit, FlockLineKind, FlockLineRoute, FlockTreatment, FlockTreatmentLine } from "@/lib/flockTypes";
import { dayLabel, esc, flockError, localDay, newRef, num } from "./flockShared";

const KINDS: FlockLineKind[] = ["med", "vitamin", "electrolyte", "disinfectant", "other"];
const ROUTES: FlockLineRoute[] = ["water", "feed", "spray", "sc", "im", "eye", "other"];
const UNITS: FlockDoseUnit[] = ["g", "ml", "mg", "tab", "dose"];
const PERS: FlockDosePer[] = ["liter", "1000_birds", "bird", "kg_bw", "total"];

/** «١ غم / لتر» — والكغم وزن بتركيز المنتج. لا جرعة ⇒ «—». */
export function doseText(t: TFunction, l: Pick<FlockTreatmentLine, "dose_amount" | "dose_unit" | "dose_per" | "strength_pct">): string {
  if (l.dose_amount == null || !l.dose_unit || !l.dose_per) return "—";
  const base = `${num(l.dose_amount, 3)} ${t(`flk.unit.${l.dose_unit}`)} / ${t(`flk.per.${l.dose_per}`)}`;
  return l.dose_per === "kg_bw" && l.strength_pct ? `${base} (${t("flk.tx.strengthN", { pct: num(l.strength_pct) })})` : base;
}
/** السحبُ نصّاً: غيرُ الدواء «—»، والفارغُ «غير معروف»، والصفرُ «بلا سحب». */
export function wdText(t: TFunction, days: number | null, kind: FlockLineKind): { text: string; unknown: boolean } {
  if (kind !== "med") return { text: "—", unknown: false };
  if (days == null) return { text: t("flk.tx.wdUnknown"), unknown: true };
  return { text: days === 0 ? t("flk.tx.wdNone") : t("flk.tx.wdDays", { n: days }), unknown: false };
}
const lastDayOf = (tx: Pick<FlockTreatment, "start_on" | "lines">) => addDays(tx.start_on, tx.lines.reduce((m, l) => Math.max(m, l.day_to), 1) - 1);
const isLayer = (b: FlockBundle) => b.case.kind === "layer" || b.case.kind === "breeder";
/** آخرُ يومٍ أُعطيت فيه: الموقوفةُ والمستبدَلةُ بيوم إيقافها (شاملاً) — كما يحسب الخادمُ السحب (stopped_on). */
export const lastGiven = (tx: Pick<FlockTreatment, "start_on" | "lines" | "stopped_on">): string => {
  const planned = lastDayOf(tx);
  return tx.stopped_on && tx.stopped_on < planned ? tx.stopped_on : planned;
};
/** مدى السطر بالتقويم بعد الإيقاف — null: انوقفت الطبلةُ قبل أن يبدأ (ما انعطى). */
export function lineSpan(tx: Pick<FlockTreatment, "start_on" | "stopped_on">, l: Pick<FlockTreatmentLine, "day_from" | "day_to">): { from: string; to: string; cut: boolean } | null {
  const from = addDays(tx.start_on, l.day_from - 1), planned = addDays(tx.start_on, l.day_to - 1);
  if (tx.stopped_on && tx.stopped_on < from) return null;
  const to = tx.stopped_on && tx.stopped_on < planned ? tx.stopped_on : planned;
  return { from, to, cut: to !== planned };
}
/** سطورُ «لا تبيع قبل» للمربي: الوجبةُ كلُّها (withdrawalOf على كلّ طبلاتها = _flock_stats)، وآخرُ يومٍ أُعطيت هذه. */
export function safeLines(t: TFunction, b: FlockBundle, tx: FlockTreatment, today: string): { text: string; unknown: boolean }[] {
  const w = withdrawalOf(b.treatments);
  const last = dayLabel(lastGiven(tx), today);
  const out = [w.unknownMeat ? { text: t("flk.tx.safeUnknown", { last }), unknown: true }
    : w.meat ? { text: t("flk.tx.safeLine", { last, safe: dayLabel(w.meat, today) }), unknown: false }
    : { text: t("flk.tx.noWd", { last }), unknown: false }];
  if (isLayer(b)) {
    if (w.unknownEgg) out.push({ text: t("flk.tx.eggUnknown"), unknown: true });
    else if (w.egg) out.push({ text: t("flk.tx.eggSafe", { safe: dayLabel(w.egg, today) }), unknown: false });
  }
  return out;
}
/** سطرُ السحب بالسطر: اللحم، وبالبيّاض البيضُ معه. */
const lineWd = (t: TFunction, b: FlockBundle, l: FlockTreatmentLine) => {
  const meat = wdText(t, l.withdrawal_meat_days, l.kind);
  if (!isLayer(b) || l.kind !== "med") return { text: meat.text, unknown: meat.unknown };
  const egg = wdText(t, l.withdrawal_egg_days, l.kind);
  return { text: `${meat.text} · ${t("flk.tx.eggLabel")}: ${egg.text}`, unknown: meat.unknown || egg.unknown };
};

/* ── المحرّر ─────────────────────────────────────────────────────────────── */
type LineDraft = {
  key: string; day_from: string; day_to: string; product_name: string; kind: FlockLineKind; dose_amount: string;
  dose_unit: FlockDoseUnit; dose_per: FlockDosePer; strength_pct: string; hours: string; route: FlockLineRoute;
  wd_meat: string; wd_egg: string; note: string;
};
const blankLine = (from = 1): LineDraft => ({
  key: newRef(), day_from: String(from), day_to: String(from + 4), product_name: "", kind: "med", dose_amount: "", dose_unit: "g",
  dose_per: "liter", strength_pct: "", hours: "", route: "water", wd_meat: "", wd_egg: "", note: "",
});
const fromLine = (l: FlockTreatmentLine): LineDraft => ({
  key: newRef(), day_from: String(l.day_from), day_to: String(l.day_to), product_name: l.product_name, kind: l.kind,
  dose_amount: l.dose_amount != null ? String(l.dose_amount) : "", dose_unit: l.dose_unit ?? "g", dose_per: l.dose_per ?? "liter",
  strength_pct: l.strength_pct != null ? String(l.strength_pct) : "", hours: l.hours != null ? String(l.hours) : "", route: l.route,
  wd_meat: l.withdrawal_meat_days != null ? String(l.withdrawal_meat_days) : "", wd_egg: l.withdrawal_egg_days != null ? String(l.withdrawal_egg_days) : "",
  note: l.note ?? "",
});
const optInt = (s: string): number | null => (s.trim() === "" ? null : Math.trunc(Number(s)));
const optNum = (s: string): number | null => (s.trim() === "" ? null : Number(s));

export function TreatmentSheet({ b, tx, onClose, onSaved }: { b: FlockBundle; tx?: FlockTreatment; onClose: () => void; onSaved: (msg: string) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const today = localISO();
  const frozen = !!tx && (!!tx.sent_at || !!tx.printed_at);
  const layer = isLayer(b);
  // نسخةٌ من طبلةٍ مُرسَلة تبدأ اليوم (أو ببدايتها إن لم تبدأ بعد — الخادمُ يرفض نسخةً تسبق أصلَها) **بتواريخ أيامها
  // نفسِها**: الأيامُ تُزاح بقدر ما مضى، وما انتهى قبلها يبقى بالقديمة. كانت تبدأ اليوم بأرقام الأيام نفسِها فتزيد
  // أيامَ المضادّ وتؤخّر «لا تبيع قبل» (مراجعةٌ عدائيّة).
  const vStart = frozen && tx ? (tx.start_on > today ? tx.start_on : today) : tx?.start_on ?? today;
  const shift = frozen && tx ? diffDays(tx.start_on, vStart) : 0;
  const [title, setTitle] = useState(tx?.title ?? "");
  const [start, setStart] = useState(vStart);
  const [note, setNote] = useState(tx?.note ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() => {
    const ls = (tx?.lines ?? []).filter((l) => l.day_to - shift >= 1)
      .map((l) => fromLine({ ...l, day_from: Math.max(1, l.day_from - shift), day_to: l.day_to - shift }));
    return ls.length ? ls : [blankLine()];
  });
  const [ref] = useState(newRef);
  const [busy, setBusy] = useState(false);
  // فشلٌ مجهولُ المصير (انقطاع، مهلة) لطبلةٍ جديدة: ربما انحفظت بمرجعها. الإعادةُ بالمرجع نفسِه ترجعها هي —
  // فتعديلٌ بعدها كان يُرمى بصمت؛ النموذجُ يُقفل على «أعد المحاولة» بما كُتب (درسُ 0264، shouldReleaseRef).
  const [locked, setLocked] = useState(false);
  const known = [...new Set(b.treatments.flatMap((x) => x.lines.map((l) => l.product_name)))].slice(0, 60);
  const set = (k: string, p: Partial<LineDraft>) => setLines(lines.map((l) => (l.key === k ? { ...l, ...p } : l)));

  const save = async () => {
    const out: FlockLineInput[] = [];
    for (const [i, l] of lines.entries()) {
      const from = optInt(l.day_from), to = optInt(l.day_to), amt = optNum(l.dose_amount);
      if (!l.product_name.trim()) { toast.error(t("flk.tx.lineNeedsName", { n: i + 1 })); return; }
      if (!(from != null && from >= 1 && to != null && to >= from && to <= 90)) { toast.error(t("flk.tx.lineBadDays", { n: i + 1 })); return; }
      if (amt != null && !(amt > 0)) { toast.error(t("flk.tx.lineBadDose", { n: i + 1 })); return; }
      out.push({
        day_from: from, day_to: to, product_id: null, product_name: l.product_name.trim(), kind: l.kind,
        dose_amount: amt, dose_unit: amt != null ? l.dose_unit : null, dose_per: amt != null ? l.dose_per : null,
        strength_pct: amt != null && l.dose_per === "kg_bw" ? optNum(l.strength_pct) : null, hours: optInt(l.hours), route: l.route,
        withdrawal_meat_days: l.kind === "med" ? optInt(l.wd_meat) : null, withdrawal_egg_days: l.kind === "med" && layer ? optInt(l.wd_egg) : null,
        note: l.note.trim() || null,
      });
    }
    setBusy(true);
    try {
      const r = await flockApi.saveTreatment({
        id: tx?.id, expect_updated_at: tx?.updated_at ?? null, client_ref: tx ? null : ref, case_id: b.case.id,
        title: title.trim() || null, start_on: start, note: note.trim() || null, lines: out,
      });
      onSaved(r.replayed ? t("flk.savedBefore") : frozen || (tx && r.id !== tx.id) ? t("flk.tx.newVersion", { n: r.version }) : t("flk.saved"));
    } catch (e) {
      if (!tx && !rejectedBeforeCommit(e)) setLocked(true);
      toast.error(flockError(e, t));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} size="lg" title={tx ? t("flk.tx.editTitle") : t("flk.tx.newTitle")}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("flk.cancel")}</Button>
        <Button loading={busy} onClick={() => void save()} data-flock-save>{locked ? t("flk.retry") : frozen ? t("flk.tx.saveVersion") : t("flk.save")}</Button>
      </>}>
      <fieldset disabled={locked} className="min-w-0 space-y-4" data-flock-tx-sheet>
        {locked && <p className="rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm font-bold text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-200" data-flock-unknown>{t("flk.unknownFate")}</p>}
        {frozen && <p className="rounded-xl border border-warn-200 bg-warn-50 p-3 text-sm font-bold text-warn-700 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200" data-flock-tx-frozen>{t("flk.tx.frozenNote")}{shift > 0 ? ` ${t("flk.tx.shiftNote", { day: dayLabel(vStart, today) })}` : ""}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">{t("flk.tx.title")}</span><input className="input" value={title} maxLength={200} placeholder={t("flk.tx.titleHint")} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="block"><span className="label">{t("flk.tx.start")}</span>
            <input type="date" className="input" value={start} min={b.case.placed_on} onChange={(e) => setStart(e.target.value)} />
            <span className="mt-1 block text-2xs text-ink-subtle">{start ? t("flk.ageShort", { age: ageOn(b.case.placed_on, start) }) : ""}</span>
          </label>
        </div>
        <datalist id="flock-products">{known.map((n) => <option key={n} value={n} />)}</datalist>
        {lines.map((l, i) => {
          const wd = l.kind === "med" && l.wd_meat.trim() === "";
          return (
            <div key={l.key} className="space-y-2 rounded-xl border border-line p-3" data-flock-line={i}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-brand-700 dark:text-brand-300">{t("flk.tx.lineN", { n: i + 1 })}</span>
                <div className="flex gap-1">
                  <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2" aria-label={t("flk.tx.copyLine")} onClick={() => setLines([...lines.slice(0, i + 1), { ...l, key: newRef() }, ...lines.slice(i + 1)])}><Copy size={14} /></button>
                  {lines.length > 1 && <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-danger-600" aria-label={t("flk.delete")} onClick={() => setLines(lines.filter((x) => x.key !== l.key))}><Trash2 size={14} /></button>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <input className="input col-span-2" list="flock-products" value={l.product_name} maxLength={160} placeholder={t("flk.tx.product")} onChange={(e) => set(l.key, { product_name: e.target.value })} data-flock-product />
                <select className="input" value={l.kind} onChange={(e) => set(l.key, { kind: e.target.value as FlockLineKind })}>{KINDS.map((k) => <option key={k} value={k}>{t(`flk.lineKind.${k}`)}</option>)}</select>
                <label className="block"><span className="label">{t("flk.tx.from")}</span><input type="number" min={1} max={90} className="input" value={l.day_from} onChange={(e) => set(l.key, { day_from: e.target.value })} /></label>
                <label className="block"><span className="label">{t("flk.tx.to")}</span><input type="number" min={1} max={90} className="input" value={l.day_to} onChange={(e) => set(l.key, { day_to: e.target.value })} /></label>
                <label className="block"><span className="label">{t("flk.tx.route")}</span><select className="input" value={l.route} onChange={(e) => set(l.key, { route: e.target.value as FlockLineRoute })}>{ROUTES.map((r) => <option key={r} value={r}>{t(`flk.route.${r}`)}</option>)}</select></label>
                <label className="block"><span className="label">{t("flk.tx.dose")}</span><input type="number" inputMode="decimal" min={0} step="any" className="input" value={l.dose_amount} onChange={(e) => set(l.key, { dose_amount: e.target.value })} data-flock-dose /></label>
                <label className="block"><span className="label">{t("flk.tx.unit")}</span><select className="input" value={l.dose_unit} onChange={(e) => set(l.key, { dose_unit: e.target.value as FlockDoseUnit })}>{UNITS.map((u) => <option key={u} value={u}>{t(`flk.unit.${u}`)}</option>)}</select></label>
                <label className="block"><span className="label">{t("flk.tx.per")}</span><select className="input" value={l.dose_per} onChange={(e) => set(l.key, { dose_per: e.target.value as FlockDosePer })}>{PERS.map((p) => <option key={p} value={p}>{t(`flk.per.${p}`)}</option>)}</select></label>
                {l.dose_per === "kg_bw" && <label className="block"><span className="label">{t("flk.tx.strength")}</span><input type="number" inputMode="decimal" min={0} max={100} step="any" className="input" value={l.strength_pct} onChange={(e) => set(l.key, { strength_pct: e.target.value })} /></label>}
                <label className="block"><span className="label">{t("flk.tx.hours")}</span><input type="number" min={1} max={24} className="input" value={l.hours} placeholder={t("flk.tx.hoursHint")} onChange={(e) => set(l.key, { hours: e.target.value })} /></label>
                {l.kind === "med" && (
                  <label className="block"><span className="label">{t("flk.tx.wdMeat")}</span>
                    <input type="number" min={0} max={120} className={wd ? "input border-danger-500" : "input"} value={l.wd_meat} onChange={(e) => set(l.key, { wd_meat: e.target.value })} data-flock-wd />
                    <span className={wd ? "mt-1 block text-2xs font-bold text-danger-600" : "mt-1 block text-2xs text-ink-subtle"}>{wd ? t("flk.tx.wdUnknownHint") : t("flk.tx.wdZeroHint")}</span>
                  </label>
                )}
                {l.kind === "med" && layer && (
                  <label className="block"><span className="label">{t("flk.tx.wdEgg")}</span><input type="number" min={0} max={120} className="input" value={l.wd_egg} onChange={(e) => set(l.key, { wd_egg: e.target.value })} /></label>
                )}
                <input className="input col-span-2" value={l.note} maxLength={500} placeholder={t("flk.tx.lineNote")} onChange={(e) => set(l.key, { note: e.target.value })} />
              </div>
              <p className="text-2xs text-ink-subtle">
                {start && optInt(l.day_from) && optInt(l.day_to) ? t("flk.tx.lineDates", {
                  from: dayLabel(addDays(start, (optInt(l.day_from) ?? 1) - 1), today), to: dayLabel(addDays(start, (optInt(l.day_to) ?? 1) - 1), today),
                  a1: ageOn(b.case.placed_on, addDays(start, (optInt(l.day_from) ?? 1) - 1)), a2: ageOn(b.case.placed_on, addDays(start, (optInt(l.day_to) ?? 1) - 1)),
                }) : ""}
              </p>
            </div>
          );
        })}
        {lines.length < 30 && (
          <Button variant="outline" leftIcon={<Plus size={16} />} onClick={() => setLines([...lines, blankLine(optInt(lines[lines.length - 1]?.day_from ?? "1") ?? 1)])} data-flock-add-line>{t("flk.tx.addLine")}</Button>
        )}
        <label className="block"><span className="label">{t("flk.note")}</span><textarea className="input min-h-16" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} /></label>
      </fieldset>
    </Dialog>
  );
}

/* ── البطاقة: السطور، «لا تبيع قبل»، والأفعال ─────────────────────────────── */
export function TreatmentCard({ b, tx, today, closed, canEdit, canSend, onEdit, onChanged }: {
  b: FlockBundle; tx: FlockTreatment; today: string; closed: boolean; canEdit: boolean; canSend: boolean; onEdit: () => void; onChanged: (msg?: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  useWarmWaQuota();
  const [stop, setStop] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const old = tx.status === "replaced";
  const last = lastGiven(tx);
  const safe = safeLines(t, b, tx, today);
  // التاريخُ للوجبة كلّها — ويُقال حين تؤخّره طبلةٌ أخرى، فلا يُظنّ خطأً بهذه.
  const own = withdrawalOf([tx]).meat, all = withdrawalOf(b.treatments).meat;
  const phone = b.farm.owner_phone;
  // الطباعةُ والإرسال ولو أُغلقت الوجبة (سجلٌّ للمربي)؛ والتعديلُ والإيقافُ لطبيبٍ والوجبةُ مفتوحة (الخادمُ يحرسهما).
  const sendable = !old && canSend;
  const editable = !old && !closed && canEdit;

  const mark = async (what: "sent" | "printed" | "stop" | "done" | "resume", on?: string) => {
    setBusy(true);
    try { await flockApi.markTreatment(tx.id, what, on ?? null); onChanged(what === "sent" ? t("flk.tx.sentDone") : what === "printed" ? undefined : t("flk.saved")); }
    catch (e) { toast.error(flockError(e, t)); }
    finally { setBusy(false); }
  };
  // الطباعةُ داخل الضغطة: النافذةُ تُفتح وتُكتب الآن، والختمُ بعدها.
  const print = () => {
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) { toast.error(t("flk.tx.printBlocked")); return; }
    win.document.open();
    win.document.write(sheetHtml(t, b, tx));
    win.document.close();
    if (!tx.printed_at) void mark("printed");
  };
  // الواتساب أوّلُ ما يُنادى — لا انتظارَ قبله؛ والختمُ حين يرجع، والمنعُ زرُّ إعادةٍ بضغطةٍ جديدة.
  const send = () => {
    if (!phone) { toast.error(t("flk.noPhone")); return; }
    const sent = sendWhatsApp({ phone: waNumber(phone, getDialCode()), text: sheetText(t, b, tx), ownerName: b.farm.owner_name, ownerPhone: phone, kind: "flock_tx" });
    sent.then(() => { if (!tx.sent_at) void mark("sent"); else onChanged(t("flk.tx.sentDone")); }, (e: unknown) => {
      const msg = quotaMessage(e) ?? flockError(e, t);
      if ((e as { name?: string } | null)?.name === "WaBlockedError") toast.toast({ tone: "warn", title: msg, action: { label: t("flk.retry"), onClick: send } });
      else toast.error(msg);
    });
  };

  return (
    <div className={old ? "card p-4 opacity-60" : "card p-4"} data-flock-tx={tx.id} data-status={tx.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-extrabold text-ink">
            {tx.title || t("flk.tx.untitled")}
            {tx.version > 1 && <Badge tone="neutral" className="px-2 py-0 text-2xs">{t("flk.tx.version", { n: tx.version })}</Badge>}
            <Badge tone={tx.status === "active" ? "brand" : tx.status === "stopped" ? "warn" : "neutral"} className="px-2 py-0 text-2xs">{t(`flk.tx.status.${tx.status}`)}</Badge>
          </div>
          <div className="text-xs text-ink-muted">
            {t("flk.tx.span", { from: dayLabel(tx.start_on, today), to: dayLabel(last, today), a1: ageOn(b.case.placed_on, tx.start_on), a2: ageOn(b.case.placed_on, last) })}
            {tx.stopped_on ? ` · ${t("flk.tx.stoppedOn", { day: dayLabel(tx.stopped_on, today) })}` : ""}
            {tx.sent_at ? ` · ${t("flk.tx.sentOn", { day: dayLabel(localDay(tx.sent_at), today) })}` : ""}
            {tx.printed_at ? ` · ${t("flk.tx.printedOn", { day: dayLabel(localDay(tx.printed_at), today) })}` : ""}
          </div>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {tx.lines.map((l) => {
          const wd = lineWd(t, b, l);
          const span = lineSpan(tx, l);
          return (
            <li key={l.id} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <div className="font-bold text-ink">{l.product_name} <span className="text-xs font-normal text-ink-muted">· {t(`flk.lineKind.${l.kind}`)}</span></div>
              <div className="text-xs text-ink-muted">
                {[!span ? t("flk.tx.lineNotGiven") : `${dayLabel(span.from, today)}–${dayLabel(span.to, today)}${span.cut ? ` (${t("flk.tx.cut")})` : ""}`,
                  doseText(t, l), t(`flk.route.${l.route}`), l.hours ? t("flk.tx.hoursN", { n: l.hours }) : "", l.note ?? ""].filter(Boolean).join(" · ")}
              </div>
              {l.kind === "med" && <div className={wd.unknown ? "text-xs font-bold text-danger-600" : "text-xs text-ink-muted"}>{t("flk.tx.wdLabel")}: {wd.text}</div>}
            </li>
          );
        })}
      </ul>
      {!old && (
        <div className="mt-3 space-y-1" data-flock-tx-safe>
          {safe.map((x, i) => (
            <div key={i} className={x.unknown ? "rounded-xl bg-danger-50 p-2.5 text-sm font-bold text-danger-700 dark:bg-danger-500/10 dark:text-danger-200" : "rounded-xl bg-surface-2 p-2.5 text-sm font-bold text-ink"}>{x.text}</div>
          ))}
          {all && own !== all && <p className="text-2xs text-ink-subtle">{t("flk.tx.caseWide")}</p>}
        </div>
      )}
      {(sendable || editable) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {sendable && <Button size="sm" variant="outline" leftIcon={<Printer size={15} />} onClick={print} disabled={busy} data-flock-tx-print>{t("flk.tx.print")}</Button>}
          {sendable && <Button size="sm" variant="outline" leftIcon={<MessageCircle size={15} />} onClick={send} disabled={busy || !phone} data-flock-tx-send>{t("flk.tx.send")}</Button>}
          {editable && <Button size="sm" variant="ghost" leftIcon={<Pencil size={15} />} onClick={onEdit} disabled={busy} data-flock-tx-edit>{t("flk.edit")}</Button>}
          {editable && tx.status === "active" && <Button size="sm" variant="ghost" leftIcon={<Pause size={15} />} onClick={() => setStop(localISO())} disabled={busy} data-flock-tx-stop>{t("flk.tx.stop")}</Button>}
          {editable && tx.status === "active" && <Button size="sm" variant="ghost" leftIcon={<Square size={15} />} onClick={() => void mark("done")} disabled={busy}>{t("flk.tx.done")}</Button>}
          {editable && (tx.status === "stopped" || tx.status === "done") && <Button size="sm" variant="ghost" leftIcon={<Play size={15} />} onClick={() => void mark("resume")} disabled={busy}>{t("flk.tx.resume")}</Button>}
        </div>
      )}
      {stop != null && (
        <Dialog open onClose={() => setStop(null)} size="sm" title={t("flk.tx.stopTitle")}
          footer={<>
            <Button variant="ghost" onClick={() => setStop(null)}>{t("flk.cancel")}</Button>
            <Button loading={busy} onClick={() => { const on = stop; setStop(null); void mark("stop", on); }} data-flock-save>{t("flk.tx.stop")}</Button>
          </>}>
          <label className="block"><span className="label">{t("flk.tx.stopOn")}</span>
            <input type="date" className="input" value={stop} min={tx.start_on} max={localISO()} onChange={(e) => setStop(e.target.value)} />
            <span className="mt-1 block text-2xs text-ink-subtle">{t("flk.tx.stopHint")}</span>
          </label>
        </Dialog>
      )}
    </div>
  );
}

/* ── ما يصل للمربي: نصُّ واتساب ومطبوعة ─────────────────────────────────────── */
export function sheetText(t: TFunction, b: FlockBundle, tx: FlockTreatment): string {
  const today = localISO();
  const out = [
    t("flk.wa.txHead", { farm: b.farm.name, title: tx.title || t("flk.tx.untitled") }),
    t("flk.wa.txStart", { day: dayLabel(tx.start_on, today), age: ageOn(b.case.placed_on, tx.start_on) }),
    ...(tx.stopped_on ? [t("flk.tx.stoppedOn", { day: dayLabel(tx.stopped_on, today) })] : []),
    "",
  ];
  for (const l of tx.lines) {
    const wd = lineWd(t, b, l);
    const span = lineSpan(tx, l);
    if (!span) { out.push(`• ${l.product_name} — ${t("flk.tx.lineNotGiven")}`); continue; }
    out.push(`• ${t("flk.wa.txLine", {
      from: dayLabel(span.from, today), to: dayLabel(span.to, today),
      product: l.product_name, dose: doseText(t, l), route: t(`flk.route.${l.route}`),
    })}${span.cut ? ` (${t("flk.tx.cut")})` : ""}${l.hours ? ` · ${t("flk.tx.hoursN", { n: l.hours })}` : ""}${l.note ? ` · ${l.note}` : ""}${l.kind === "med" ? ` · ${t("flk.tx.wdLabel")}: ${wd.text}` : ""}`);
  }
  out.push("");
  for (const x of safeLines(t, b, tx, today)) out.push(x.text);
  if (tx.note) out.push(tx.note);
  out.push(t("flk.wa.sign", { clinic: getClinicName() || "doctorVet" }));
  return out.join("\n");
}

export function sheetHtml(t: TFunction, b: FlockBundle, tx: FlockTreatment): string {
  const today = localISO();
  const dir = i18next.dir();
  const safe = safeLines(t, b, tx, today);
  const logo = getClinicLogo();
  const rows = tx.lines.map((l) => {
    const wd = lineWd(t, b, l);
    const span = lineSpan(tx, l);
    const when = !span ? esc(t("flk.tx.lineNotGiven"))
      : `${esc(`${dayLabel(span.from, today)} – ${dayLabel(span.to, today)}`)}${span.cut ? ` <span class="u">(${esc(t("flk.tx.cut"))})</span>` : ""}<div class="s">${esc(t("flk.tx.ages", { a1: ageOn(b.case.placed_on, span.from), a2: ageOn(b.case.placed_on, span.to) }))}</div>`;
    return `<tr><td>${when}</td>
      <td><b>${esc(l.product_name)}</b><div class="s">${esc(t(`flk.lineKind.${l.kind}`))}</div></td>
      <td>${esc(doseText(t, l))}</td><td>${esc(t(`flk.route.${l.route}`))}${l.hours ? `<div class="s">${esc(t("flk.tx.hoursN", { n: l.hours }))}</div>` : ""}</td>
      <td class="${wd.unknown ? "u" : ""}">${esc(wd.text)}</td><td>${esc(l.note ?? "")}</td></tr>`;
  }).join("");
  return `<!doctype html><html lang="${esc(i18next.language || "ar")}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(tx.title || t("flk.tx.untitled"))}</title>
<style>
*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;margin:14mm;color:#111;font-size:13px}
.h{display:flex;align-items:center;gap:12px;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}
.h img{max-height:52px;max-width:120px}.h .c{font-size:18px;font-weight:800}.m{color:#444;font-size:12px}
h1{font-size:17px;margin:8px 0}table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{border:1px solid #999;padding:6px;text-align:start;vertical-align:top}th{background:#eee;font-size:12px}
.s{color:#555;font-size:11px}.u{color:#b00;font-weight:800}.f{margin-top:12px;padding:10px;border:2px solid #111;font-size:15px;font-weight:800}
.f.u{border-color:#b00}.n{margin-top:8px;white-space:pre-wrap}.p{margin-top:14px}@media print{.p{display:none}body{margin:10mm}}
</style></head><body onload="setTimeout(function(){window.print()},250)">
<div class="h">${logo ? `<img src="${esc(logo)}" alt="">` : ""}<div><div class="c">${esc(getClinicName() || "doctorVet")}</div>
<div class="m">${esc(t("flk.print.farm", { farm: b.farm.name, owner: b.farm.owner_name || "—" }))}</div></div></div>
<h1>${esc(tx.title || t("flk.tx.untitled"))}${tx.version > 1 ? ` · ${esc(t("flk.tx.version", { n: tx.version }))}` : ""}</h1>
<div class="m">${esc(t("flk.print.meta", { kind: t(`flk.kind.${b.case.kind}`), breed: b.case.breed || "—", start: dayLabel(tx.start_on, today), age: ageOn(b.case.placed_on, tx.start_on) }))}${tx.stopped_on ? ` · <b class="u">${esc(t("flk.tx.stoppedOn", { day: dayLabel(tx.stopped_on, today) }))}</b>` : ""}</div>
<table><thead><tr><th>${esc(t("flk.print.days"))}</th><th>${esc(t("flk.tx.product"))}</th><th>${esc(t("flk.tx.dose"))}</th><th>${esc(t("flk.tx.route"))}</th><th>${esc(t("flk.tx.wdLabel"))}</th><th>${esc(t("flk.note"))}</th></tr></thead><tbody>${rows}</tbody></table>
${safe.map((x) => `<div class="f${x.unknown ? " u" : ""}">${esc(x.text)}</div>`).join("")}
${tx.note ? `<div class="n">${esc(tx.note)}</div>` : ""}
<button class="p" onclick="window.print()">${esc(t("flk.tx.print"))}</button>
</body></html>`;
}
