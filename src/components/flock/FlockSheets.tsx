/* ============================================================================
 * نوافذُ حالة الحقل الصغيرة (رفيقةُ نطاق flk): نافقُ اليوم، التحصين، الإغلاق، تعديلُ الوجبة، برامجُ العيادة.
 *
 * «نافق اليوم» عشرون ثانية (الخطّة §٧-هـ): صفٌّ لكلّ قاعة، والفراغُ «ما انسأل» لا صفر — صفرٌ مكتوب يُحفظ صفراً.
 * والقاعاتُ تُحفظ واحدةً واحدة بمرجعها: فشلُ قاعةٍ لا يُسقط ما انحفظ قبلها، ويُقال باسمها، وإعادتُها لا تكرّر
 * المنحفظ (client_ref). والإغلاقُ بيعاً قبل «لا تبيع قبل» يُرفض بالخادم ويُؤكَّد هنا بالتاريخ — لا يُتجاوز بنقرة.
 * ========================================================================= */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Button, Dialog, useToast } from "@/components/ui";
import { localISO } from "@/lib/utils";
import { rejectedBeforeCommit } from "@/lib/errors";
import { flockApi } from "@/lib/flockApi";
import { ageOn, dueOn } from "@/lib/flockMath";
import type { FlockBundle, FlockCase, FlockFarm, FlockKind, FlockMortality, FlockProgram, FlockProgramStep, FlockRoute, FlockVax } from "@/lib/flockTypes";
import { dayLabel, flockError, newRef } from "./flockShared";

export type VaxMode = "new" | "give" | "skip" | "edit";
export const ROUTES: FlockRoute[] = ["water", "spray", "eye", "sc", "im", "wing", "feed", "other"];
const KINDS: FlockKind[] = ["broiler", "layer", "breeder", "other"];

/** خانةُ عددٍ صحيح: الفراغُ null (لا صفر). */
const intOrNull = (v: string): number | null => (v.trim() === "" ? null : Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : NaN);

/* ── نافقُ اليوم ────────────────────────────────────────────────────────── */
export function MortalitySheet({ b, row, onClose, onSaved }: { b: FlockBundle; row?: FlockMortality; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const today = localISO();
  const houses = b.houses.length ? [...b.houses].sort((x, y) => x.position - y.position) : [{ id: null as string | null, label: t("flk.wholeFlock") }];
  const editing = !!row;
  const [day, setDay] = useState(row?.on_date ?? today);
  const [days, setDays] = useState(String(row?.days ?? 1));
  const [source, setSource] = useState<"staff" | "farmer">(row?.source === "farmer" ? "farmer" : "staff");
  const [note, setNote] = useState(row?.note ?? "");
  // صفٌّ لكلّ قاعة: {نافق، فرز} نصّاً — الفراغُ «لم يُبلَّغ».
  const [vals, setVals] = useState<Record<string, { dead: string; culled: string }>>(() =>
    Object.fromEntries(houses.map((h) => [h.id ?? "", row && (row.house_id ?? "") === (h.id ?? "") ? { dead: String(row.dead), culled: String(row.culled) } : { dead: "", culled: "" }])));
  const [refs] = useState<Record<string, string>>(() => Object.fromEntries(houses.map((h) => [h.id ?? "", newRef()])));
  const [done, setDone] = useState<Set<string>>(new Set());
  // قاعةٌ فشل حفظُها بلا جوابٍ حاسم (انقطاع، مهلة): ربما انحفظت بمرجعها. تُقفل خاناتُها على ما أُرسل — الإعادةُ بالمرجع نفسِه
  // ترجع المحفوظَ هو، فتعديلٌ بعدها كان يُرمى بصمت (درسُ 0264).
  const [unsure, setUnsure] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const shownHouses = editing ? houses.filter((h) => (h.id ?? "") === (row.house_id ?? "")) : houses;

  const save = async () => {
    const n = Math.trunc(Number(days));
    if (!day || day > today || !(n >= 1 && n <= 60)) { toast.error(t("flk.err.flock_mortality_date")); return; }
    const todo = shownHouses.filter((h) => {
      const v = vals[h.id ?? ""];
      return !done.has(h.id ?? "") && (v.dead.trim() !== "" || v.culled.trim() !== "");
    });
    if (!todo.length) { toast.error(t("flk.mort.nothing")); return; }
    setBusy(true);
    const nextErrs: Record<string, string> = {};
    const nextDone = new Set(done);
    const nextUnsure = new Set(unsure);
    for (const h of todo) {
      const k = h.id ?? "";
      const dead = intOrNull(vals[k].dead) ?? 0;
      const culled = intOrNull(vals[k].culled) ?? 0;
      if (!Number.isFinite(dead) || !Number.isFinite(culled) || dead < 0 || culled < 0) { nextErrs[k] = t("flk.err.flock_mortality_bad"); continue; }
      try {
        await flockApi.saveMortality(editing
          ? { id: row.id, expect_updated_at: row.updated_at, house_id: h.id, on_date: day, days: n, dead, culled, note: note || null }
          : { case_id: b.case.id, house_id: h.id, on_date: day, days: n, dead, culled, source, note: note || null, client_ref: refs[k] });
        nextDone.add(k);
        nextUnsure.delete(k);
      } catch (e) {
        nextErrs[k] = flockError(e, t);
        if (!editing && !rejectedBeforeCommit(e)) { nextUnsure.add(k); nextErrs[k] = `${nextErrs[k]} — ${t("flk.unknownFate")}`; }
      }
    }
    setBusy(false);
    setDone(nextDone);
    setUnsure(nextUnsure);
    setErrs(nextErrs);
    if (!Object.keys(nextErrs).length) onSaved();
    else if (nextDone.size > done.size) toast.warn(t("flk.mort.partial"));
  };

  return (
    <Dialog open onClose={onClose} title={editing ? t("flk.mort.editTitle") : t("flk.mort.title")}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{done.size ? t("flk.closeBtn") : t("flk.cancel")}</Button>
        <Button loading={busy} onClick={() => void save()} data-flock-save>{t("flk.save")}</Button>
      </>}>
      <div className="space-y-4" data-flock-mortality-sheet>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">{t("flk.mort.day")}</span>
            <input type="date" className="input" value={day} min={b.case.placed_on} max={today} disabled={unsure.size > 0} onChange={(e) => setDay(e.target.value)} />
            <span className="mt-1 block text-2xs text-ink-subtle">{day ? t("flk.ageShort", { age: ageOn(b.case.placed_on, day) }) : ""}</span>
          </label>
          <label className="block">
            <span className="label">{t("flk.mort.days")}</span>
            <input type="number" inputMode="numeric" min={1} max={60} className="input" value={days} disabled={unsure.size > 0} onChange={(e) => setDays(e.target.value)} />
            <span className="mt-1 block text-2xs text-ink-subtle">{t("flk.mort.daysHint")}</span>
          </label>
        </div>
        <div className="space-y-2">
          {shownHouses.map((h) => {
            const k = h.id ?? "";
            return (
              <div key={k} className="rounded-xl border border-line p-3" data-flock-house={k || "all"}>
                <div className="mb-2 flex items-center justify-between text-sm font-bold text-ink">
                  <span>{h.label}</span>
                  {done.has(k) && <span className="text-xs text-success-600">{t("flk.mort.houseSaved")}</span>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" inputMode="numeric" min={0} className="input" placeholder={t("flk.mort.dead")} disabled={done.has(k) || unsure.has(k)}
                    value={vals[k].dead} onChange={(e) => setVals({ ...vals, [k]: { ...vals[k], dead: e.target.value } })} data-flock-dead />
                  <input type="number" inputMode="numeric" min={0} className="input" placeholder={t("flk.mort.culled")} disabled={done.has(k) || unsure.has(k)}
                    value={vals[k].culled} onChange={(e) => setVals({ ...vals, [k]: { ...vals[k], culled: e.target.value } })} data-flock-culled />
                </div>
                {errs[k] && <p className="mt-1 text-xs font-bold text-danger-600" data-flock-house-err>{errs[k]}</p>}
              </div>
            );
          })}
          <p className="text-2xs text-ink-subtle">{t("flk.mort.blankHint")}</p>
        </div>
        {!editing && (
          <div>
            <span className="label">{t("flk.mort.source")}</span>
            <div className="flex gap-2">
              {(["staff", "farmer"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setSource(v)} disabled={unsure.size > 0}
                  className={source === v ? "chip bg-brand-600 text-white" : "chip bg-surface-2 text-ink-muted"}>{t(`flk.mort.src.${v}`)}</button>
              ))}
            </div>
          </div>
        )}
        <label className="block">
          <span className="label">{t("flk.note")}</span>
          <input className="input" value={note} maxLength={1000} disabled={unsure.size > 0} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </Dialog>
  );
}

/* ── التحصين: إضافة، انعطى، ما ينعطى، تعديلُ المخطَّط ───────────────────────── */
export function VaxSheet({ b, vax, mode, onClose, onSaved }: { b: FlockBundle; vax?: FlockVax; mode: VaxMode; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const today = localISO();
  const [status, setStatus] = useState<FlockVax["status"]>(mode === "give" ? "given" : mode === "skip" ? "skipped" : vax?.status ?? "planned");
  const [vaccine, setVaccine] = useState(vax?.vaccine ?? "");
  const [disease, setDisease] = useState(vax?.disease ?? "");
  const [route, setRoute] = useState<FlockRoute>(vax?.route ?? "water");
  const [age, setAge] = useState(vax?.planned_age != null ? String(vax.planned_age) : "");
  // اليومُ افتراضاً لا يومُ الخطّة: تحصينٌ متأخّر يُختم بيومه المخطَّط فيُخفي التأخير (مراجعةٌ عدائيّة) — ومن أعطاه بيومه يغيّره.
  const [givenOn, setGivenOn] = useState(vax?.given_on ?? today);
  const [givenBy, setGivenBy] = useState<NonNullable<FlockVax["given_by"]>>(vax?.given_by ?? "farmer");
  const [batch, setBatch] = useState(vax?.batch_no ?? "");
  const [birds, setBirds] = useState(vax?.birds_count != null ? String(vax.birds_count) : "");
  const [takeOk, setTakeOk] = useState<boolean | null>(vax?.take_ok ?? null);
  const [note, setNote] = useState(vax?.note ?? "");
  const [skip, setSkip] = useState(vax?.skip_reason ?? "");
  const [busy, setBusy] = useState(false);
  const locked = mode === "give" || mode === "skip"; // البندُ معروف — الحالةُ وحدها تتغيّر

  // «انعطى» بالغلط يرجع «مخطّط» (الخادمُ يمنع حذفَ المنجَز ويقول: رجّعه مخطّط).
  const revert = async () => {
    if (!vax) return;
    setBusy(true);
    try {
      await flockApi.saveVax({ id: vax.id, expect_updated_at: vax.updated_at, case_id: b.case.id, vaccine: vax.vaccine, disease: vax.disease, route: vax.route,
        planned_age: vax.planned_age ?? (vax.given_on ? ageOn(b.case.placed_on, vax.given_on) : 1), status: "planned", note: vax.note });
      onSaved();
    } catch (e) { toast.error(flockError(e, t)); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!vaccine.trim()) { toast.error(t("flk.vax.needName")); return; }
    if (status === "planned" && !(Number(age) >= 1)) { toast.error(t("flk.vax.needAge")); return; }
    if (status === "skipped" && !skip.trim()) { toast.error(t("flk.vax.needReason")); return; }
    setBusy(true);
    try {
      await flockApi.saveVax({
        id: vax?.id, expect_updated_at: vax?.updated_at ?? null, case_id: b.case.id, vaccine: vaccine.trim(), disease: disease.trim() || null, route,
        planned_age: age.trim() ? Math.trunc(Number(age)) : null, status,
        given_on: status === "given" ? givenOn : null, given_by: status === "given" ? givenBy : null,
        batch_no: status === "given" ? batch.trim() || null : null, birds_count: status === "given" && birds.trim() ? Math.trunc(Number(birds)) : null,
        take_ok: status === "given" ? takeOk : null, note: note.trim() || null, skip_reason: status === "skipped" ? skip.trim() : null,
      });
      onSaved();
    } catch (e) { toast.error(flockError(e, t)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} title={mode === "give" ? t("flk.vax.giveTitle", { vaccine }) : mode === "skip" ? t("flk.vax.skipTitle", { vaccine }) : vax ? t("flk.vax.editTitle") : t("flk.vax.addTitle")}
      footer={<>
        {vax?.status === "given" && <Button variant="ghost" onClick={() => void revert()} disabled={busy} data-flock-vax-revert>{t("flk.vax.revert")}</Button>}
        <Button variant="ghost" onClick={onClose}>{t("flk.cancel")}</Button>
        <Button loading={busy} onClick={() => void save()} data-flock-save>{t("flk.save")}</Button>
      </>}>
      <div className="space-y-4" data-flock-vax-sheet>
        {!locked && (
          <div className="flex flex-wrap gap-2">
            {(["planned", "given", "skipped"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setStatus(v)} className={status === v ? "chip bg-brand-600 text-white" : "chip bg-surface-2 text-ink-muted"}>{t(`flk.vax.status.${v}`)}</button>
            ))}
          </div>
        )}
        {!locked && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">{t("flk.vax.vaccine")}</span><input className="input" value={vaccine} maxLength={120} onChange={(e) => setVaccine(e.target.value)} data-flock-vaccine /></label>
            <label className="block"><span className="label">{t("flk.vax.disease")}</span><input className="input" value={disease} maxLength={120} onChange={(e) => setDisease(e.target.value)} /></label>
            <label className="block"><span className="label">{t("flk.vax.route")}</span>
              <select className="input" value={route} onChange={(e) => setRoute(e.target.value as FlockRoute)}>
                {ROUTES.map((r) => <option key={r} value={r}>{t(`flk.route.${r}`)}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">{t("flk.vax.age")}</span>
              <input type="number" inputMode="numeric" min={1} className="input" value={age} onChange={(e) => setAge(e.target.value)} data-flock-vax-age />
              {age.trim() && Number(age) >= 1 && <span className="mt-1 block text-2xs text-ink-subtle">{dayLabel(dueOn(b.case.placed_on, Math.trunc(Number(age))), today)}</span>}
            </label>
          </div>
        )}
        {status === "given" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">{t("flk.vax.givenOn")}</span>
              <input type="date" className="input" value={givenOn} min={b.case.placed_on} max={today} onChange={(e) => setGivenOn(e.target.value)} />
              <span className="mt-1 block text-2xs text-ink-subtle">{givenOn ? t("flk.ageShort", { age: ageOn(b.case.placed_on, givenOn) }) : ""}</span>
            </label>
            <div><span className="label">{t("flk.vax.givenBy")}</span>
              <div className="flex flex-wrap gap-1.5">
                {(["vet", "farmer", "hatchery", "other"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setGivenBy(v)} className={givenBy === v ? "chip bg-brand-600 text-white" : "chip bg-surface-2 text-ink-muted"}>{t(`flk.givenBy.${v}`)}</button>
                ))}
              </div>
            </div>
            <label className="block"><span className="label">{t("flk.vax.batch")}</span><input className="input" value={batch} maxLength={60} onChange={(e) => setBatch(e.target.value)} /></label>
            <label className="block"><span className="label">{t("flk.vax.birds")}</span><input type="number" inputMode="numeric" min={0} className="input" value={birds} onChange={(e) => setBirds(e.target.value)} /></label>
            <div className="sm:col-span-2"><span className="label">{t("flk.vax.take")}</span>
              <div className="flex flex-wrap gap-1.5">
                {([[true, "yes"], [false, "no"], [null, "unknown"]] as const).map(([v, k]) => (
                  <button key={k} type="button" onClick={() => setTakeOk(v)} className={takeOk === v ? "chip bg-brand-600 text-white" : "chip bg-surface-2 text-ink-muted"}>{t(`flk.vax.take_${k}`)}</button>
                ))}
              </div>
              <span className="mt-1 block text-2xs text-ink-subtle">{t("flk.vax.takeHint")}</span>
            </div>
          </div>
        )}
        {status === "skipped" && (
          <label className="block"><span className="label">{t("flk.vax.skipReason")}</span><input className="input" value={skip} maxLength={300} onChange={(e) => setSkip(e.target.value)} data-flock-skip /></label>
        )}
        <label className="block"><span className="label">{t("flk.note")}</span><input className="input" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
    </Dialog>
  );
}

/* ── إغلاقُ الوجبة ──────────────────────────────────────────────────────── */
export function CloseSheet({ b, onClose, onSaved }: { b: FlockBundle; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const today = localISO();
  const s = b.stats;
  const [on, setOn] = useState(today);
  const [reason, setReason] = useState<NonNullable<FlockCase["close_reason"]>>("sold");
  const [count, setCount] = useState(String(s.alive));
  const [kg, setKg] = useState("");
  const [confirmWd, setConfirmWd] = useState(false);
  const [busy, setBusy] = useState(false);
  const early = reason === "sold" && ((!!s.safe_meat_from && on < s.safe_meat_from) || s.withdrawal_unknown);
  const save = async () => {
    if (early && !confirmWd) { toast.error(t("flk.close.confirmFirst")); return; }
    setBusy(true);
    try {
      await flockApi.closeCase(b.case.id, {
        closed_on: on, reason, sold_count: reason === "sold" && count.trim() ? Math.trunc(Number(count)) : null,
        sold_avg_kg: reason === "sold" && kg.trim() ? Number(kg) : null, confirm_withdrawal: early && confirmWd,
      });
      onSaved();
    } catch (e) { toast.error(flockError(e, t)); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={t("flk.close.title", { farm: b.farm.name })}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("flk.cancel")}</Button>
        <Button variant={early ? "danger" : "primary"} loading={busy} disabled={early && !confirmWd} onClick={() => void save()} data-flock-save>{t("flk.closeCase")}</Button>
      </>}>
      <div className="space-y-4" data-flock-close-sheet>
        <div className="flex flex-wrap gap-2">
          {(["sold", "depleted", "transferred", "other"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setReason(v)} className={reason === v ? "chip bg-brand-600 text-white" : "chip bg-surface-2 text-ink-muted"}>{t(`flk.close.reason.${v}`)}</button>
          ))}
        </div>
        <label className="block"><span className="label">{t("flk.close.on")}</span>
          <input type="date" className="input" value={on} min={b.case.placed_on} max={today} onChange={(e) => { setOn(e.target.value); setConfirmWd(false); }} />
          <span className="mt-1 block text-2xs text-ink-subtle">{on ? t("flk.ageShort", { age: ageOn(b.case.placed_on, on) }) : ""}</span>
        </label>
        {reason === "sold" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">{t("flk.close.count")}</span><input type="number" inputMode="numeric" min={0} className="input" value={count} onChange={(e) => setCount(e.target.value)} /></label>
            <label className="block"><span className="label">{t("flk.close.kg")}</span><input type="number" inputMode="decimal" min={0} step="0.01" className="input" value={kg} onChange={(e) => setKg(e.target.value)} /></label>
          </div>
        )}
        {early && (
          <label className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm font-bold text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-200" data-flock-close-wd>
            <input type="checkbox" className="mt-1" checked={confirmWd} onChange={(e) => setConfirmWd(e.target.checked)} />
            <span>{s.withdrawal_unknown && !(s.safe_meat_from && on < s.safe_meat_from)
              ? t("flk.close.wdUnknown", { farm: b.farm.name })
              : t("flk.close.wdEarly", { farm: b.farm.name, day: dayLabel(s.safe_meat_from, today), on: dayLabel(on, today) })}</span>
          </label>
        )}
      </div>
    </Dialog>
  );
}

/* ── تعديلُ الحقل: رقمُ صاحبه هو عنوانُ كلّ طبلةٍ وتقرير — غلطُه يرسلها لغيره ─────────────── */
export function FarmEditSheet({ b, onClose, onSaved }: { b: FlockBundle; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const f: FlockFarm = b.farm;
  const [name, setName] = useState(f.name);
  const [owner, setOwner] = useState(f.owner_name ?? "");
  const [phone, setPhone] = useState(f.owner_phone ?? "");
  const [area, setArea] = useState(f.area ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) { toast.error(t("flk.err.flock_farm_name")); return; }
    setBusy(true);
    try {
      await flockApi.saveFarm({ id: f.id, name: name.trim(), owner_name: owner.trim() || null, owner_phone: phone.trim() || null, area: area.trim() || null }, f.updated_at);
      onSaved();
    } catch (e) { toast.error(flockError(e, t)); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={t("flk.farmEdit.title")}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("flk.cancel")}</Button>
        <Button loading={busy} onClick={() => void save()} data-flock-save>{t("flk.save")}</Button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2" data-flock-farm-sheet>
        <label className="block"><span className="label">{t("flk.open.farmName")}</span><input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block"><span className="label">{t("flk.farmEdit.owner")}</span><input className="input" value={owner} maxLength={120} onChange={(e) => setOwner(e.target.value)} /></label>
        <label className="block"><span className="label">{t("flk.farmEdit.phone")}</span><input className="input" dir="ltr" inputMode="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} data-flock-farm-phone /></label>
        <label className="block"><span className="label">{t("flk.farmEdit.area")}</span><input className="input" value={area} maxLength={120} onChange={(e) => setArea(e.target.value)} /></label>
        <p className="text-2xs text-ink-subtle sm:col-span-2">{t("flk.farmEdit.hint")}</p>
      </div>
    </Dialog>
  );
}

/* ── تعديلُ الوجبة ──────────────────────────────────────────────────────── */
export function CaseEditSheet({ b, onClose, onSaved }: { b: FlockBundle; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const c = b.case;
  const [kind, setKind] = useState<FlockKind>(c.kind);
  const [breed, setBreed] = useState(c.breed ?? "");
  const [hatchery, setHatchery] = useState(c.hatchery ?? "");
  const [placedOn, setPlacedOn] = useState(c.placed_on);
  const [count, setCount] = useState(String(c.placed_count));
  const [note, setNote] = useState(c.note ?? "");
  const [busy, setBusy] = useState(false);
  const hasHouses = b.houses.length > 0;
  const save = async () => {
    setBusy(true);
    try {
      await flockApi.updateCase(c.id, {
        kind, breed: breed.trim() || null, hatchery: hatchery.trim() || null, placed_on: placedOn,
        ...(hasHouses ? {} : { placed_count: Math.trunc(Number(count)) }), note: note.trim() || null,
      }, c.updated_at);
      onSaved();
    } catch (e) { toast.error(flockError(e, t)); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={t("flk.editCase")}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("flk.cancel")}</Button>
        <Button loading={busy} onClick={() => void save()} data-flock-save>{t("flk.save")}</Button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2" data-flock-edit-sheet>
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          {KINDS.map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={kind === k ? "chip bg-brand-600 text-white" : "chip bg-surface-2 text-ink-muted"}>{t(`flk.kind.${k}`)}</button>)}
        </div>
        <label className="block"><span className="label">{t("flk.breed")}</span><input className="input" value={breed} maxLength={60} onChange={(e) => setBreed(e.target.value)} /></label>
        <label className="block"><span className="label">{t("flk.hatchery")}</span><input className="input" value={hatchery} maxLength={120} onChange={(e) => setHatchery(e.target.value)} /></label>
        <label className="block"><span className="label">{t("flk.placedOn")}</span><input type="date" className="input" value={placedOn} onChange={(e) => setPlacedOn(e.target.value)} /></label>
        <label className="block"><span className="label">{t("flk.placedCount")}</span>
          <input type="number" inputMode="numeric" min={1} className="input" value={count} disabled={hasHouses} onChange={(e) => setCount(e.target.value)} />
          {hasHouses && <span className="mt-1 block text-2xs text-ink-subtle">{t("flk.countFromHouses")}</span>}
        </label>
        <label className="block sm:col-span-2"><span className="label">{t("flk.note")}</span><textarea className="input min-h-20" value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
    </Dialog>
  );
}

/* ── برامجُ التحصين (للمدير) — لا قالبَ يُشحن بلا توقيع (القرار ٦): العيادةُ تكتب برنامجها ─────── */
export function ProgramsSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [list, setList] = useState<FlockProgram[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id?: string; name: string; kind: FlockKind; steps: FlockProgramStep[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => { setErr(null); flockApi.programs().then(setList).catch((e) => { setList(null); setErr(flockError(e, t)); }); };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  const steps = useMemo(() => [...(edit?.steps ?? [])].sort((x, y) => x.age - y.age), [edit]);
  const save = async (archived = false) => {
    if (!edit) return;
    if (!edit.name.trim() || edit.steps.some((s) => !s.vaccine.trim() || !(s.age >= 1))) { toast.error(t("flk.err.flock_program")); return; }
    setBusy(true);
    try { await flockApi.saveProgram({ id: edit.id, name: edit.name.trim(), kind: edit.kind, steps: steps, archived }); setEdit(null); load(); }
    catch (e) { toast.error(flockError(e, t)); }
    finally { setBusy(false); }
  };
  const setStep = (i: number, p: Partial<FlockProgramStep>) => edit && setEdit({ ...edit, steps: edit.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  return (
    <Dialog open onClose={onClose} size="lg" title={edit ? (edit.id ? t("flk.prog.editTitle") : t("flk.prog.newTitle")) : t("flk.prog.title")}
      footer={edit ? <>
        {edit.id && <Button variant="ghost" onClick={() => void save(true)} disabled={busy}>{t("flk.prog.archive")}</Button>}
        <Button variant="ghost" onClick={() => setEdit(null)}>{t("flk.cancel")}</Button>
        <Button loading={busy} onClick={() => void save()} data-flock-save>{t("flk.save")}</Button>
      </> : undefined}>
      {edit ? (
        <div className="space-y-3" data-flock-program-edit>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">{t("flk.prog.name")}</span><input className="input" value={edit.name} maxLength={80} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <div><span className="label">{t("flk.kindLabel")}</span>
              <div className="flex flex-wrap gap-1.5">{KINDS.map((k) => <button key={k} type="button" onClick={() => setEdit({ ...edit, kind: k })} className={edit.kind === k ? "chip bg-brand-600 text-white" : "chip bg-surface-2 text-ink-muted"}>{t(`flk.kind.${k}`)}</button>)}</div>
            </div>
          </div>
          {edit.steps.map((s, i) => (
            <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-line p-2 sm:grid-cols-4">
              <label className="block"><span className="label">{t("flk.vax.age")}</span><input type="number" min={1} className="input" value={s.age || ""} onChange={(e) => setStep(i, { age: Math.trunc(Number(e.target.value)) })} /></label>
              <label className="block"><span className="label">{t("flk.vax.vaccine")}</span><input className="input" value={s.vaccine} maxLength={120} onChange={(e) => setStep(i, { vaccine: e.target.value })} /></label>
              <label className="block"><span className="label">{t("flk.vax.route")}</span>
                <select className="input" value={s.route} onChange={(e) => setStep(i, { route: e.target.value as FlockRoute })}>{ROUTES.map((r) => <option key={r} value={r}>{t(`flk.route.${r}`)}</option>)}</select>
              </label>
              <label className="block"><span className="label">{t("flk.vax.disease")}</span><input className="input" value={s.disease ?? ""} maxLength={120} onChange={(e) => setStep(i, { disease: e.target.value || null })} /></label>
              <label className="flex items-center gap-2 pb-3 text-xs font-bold text-ink-muted"><input type="checkbox" checked={s.at_hatchery} onChange={(e) => setStep(i, { at_hatchery: e.target.checked })} />{t("flk.prog.hatchery")}</label>
              <button type="button" className="grid h-11 place-items-center rounded-lg text-ink-muted hover:text-danger-600" aria-label={t("flk.delete")} onClick={() => setEdit({ ...edit, steps: edit.steps.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>
            </div>
          ))}
          <Button variant="outline" leftIcon={<Plus size={16} />} onClick={() => setEdit({ ...edit, steps: [...edit.steps, { age: (steps[steps.length - 1]?.age ?? 0) + 7, vaccine: "", disease: null, route: "water", at_hatchery: false }] })}>{t("flk.prog.addStep")}</Button>
        </div>
      ) : err ? (
        <div className="space-y-3 text-center"><p className="text-sm text-danger-600">{err}</p><Button variant="outline" onClick={load}>{t("flk.retry")}</Button></div>
      ) : !list ? (
        <div className="card h-24 animate-pulse" />
      ) : (
        <div className="space-y-2" data-flock-programs-list>
          <p className="text-xs text-ink-muted">{t("flk.prog.intro")}</p>
          {list.length === 0 && <p className="text-sm text-ink-muted">{t("flk.prog.none")}</p>}
          {list.map((p) => (
            <button key={p.id} type="button" onClick={() => setEdit({ id: p.id, name: p.name, kind: p.kind, steps: p.steps })}
              className="card flex w-full items-center justify-between gap-3 p-3 text-start">
              <span className="min-w-0"><span className="block truncate font-bold text-ink">{p.name}</span>
                <span className="block text-xs text-ink-muted">{t(`flk.kind.${p.kind}`)} · {t("flk.prog.steps", { n: p.steps.length })}</span></span>
            </button>
          ))}
          <Button leftIcon={<Plus size={16} />} onClick={() => setEdit({ name: "", kind: "broiler", steps: [] })} data-flock-program-new>{t("flk.prog.new")}</Button>
        </div>
      )}
    </Dialog>
  );
}
