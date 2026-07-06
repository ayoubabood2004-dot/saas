import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { KeyRound, Lock, Unlock, Delete, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { appRoleToStaffRole } from "@/lib/staff";
import { getOverrideEnabled, setOverrideEnabled } from "@/lib/settings";
import {
  hasOverridePin, lockNow, setDeviceLocked, setOverridePin,
  unlockWithPin, useOverride,
} from "@/lib/managerOverride";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { Button, Tooltip, useToast } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { cn } from "@/lib/utils";

const mmss = (msLeft: number) => {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/* ---------------------------------------------------------------------------
 * The little corner control next to the theme/language toggles.
 *  · hidden until the clinic enables the feature in Settings;
 *  · key icon → PIN pad → 10-minute manager session;
 *  · while unlocked: an amber countdown chip that re-locks on click.
 * ------------------------------------------------------------------------- */
export function OverrideCorner({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const ov = useOverride();
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const navigate = useNavigate();

  // 1-second ticker drives the countdown text while a session runs.
  useEffect(() => {
    if (!ov.active) return;
    const id = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [ov.active]);

  const staff = user?.role === "admin" || user?.role === "doctor" || user?.role === "reception";
  if (!user || !staff || !getOverrideEnabled()) return null;
  const baseRole = appRoleToStaffRole(user.role);
  // Managers on an unlocked device have nothing to unlock — stay invisible.
  if (!ov.active && !ov.deviceLocked && baseRole === "manager") return null;

  if (ov.active) {
    return (
      <Tooltip label={t("override.relock", "قفل وضع المدير الآن")}>
        <button
          onClick={() => { playTap(); lockNow(); navigate("/"); }}
          aria-label={t("override.relock", "قفل وضع المدير الآن")}
          data-override="chip"
          className="flex h-10 items-center gap-1.5 rounded-full bg-warn-50 px-3 text-xs font-bold tabular-nums text-warn-700 transition hover:bg-warn-100 dark:bg-warn-500/15 dark:text-warn-300"
        >
          <Unlock size={14} />
          {mmss((ov.until ?? 0) - Date.now())}
        </button>
      </Tooltip>
    );
  }

  return (
    <>
      <Tooltip label={t("override.open", "وضع المدير")}>
        <button
          onClick={() => { playTap(); setOpen(true); }}
          aria-label={t("override.open", "وضع المدير")}
          data-override="key"
          className={cn(
            "grid place-items-center rounded-full text-ink-muted transition hover:bg-surface-1 hover:text-ink",
            compact ? "h-11 w-11" : "h-10 w-10",
          )}
        >
          <KeyRound size={18} />
        </button>
      </Tooltip>
      <PinModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/* ------------------------------- PIN pad -------------------------------- */
function PinModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const pinRef = useRef(pin);
  pinRef.current = pin;

  useEffect(() => {
    if (!open) { setPin(""); setError(null); }
  }, [open]);

  const submit = async (candidate: string) => {
    setBusy(true);
    const res = await unlockWithPin(candidate);
    setBusy(false);
    if (res.ok) {
      playSuccess();
      onClose();
      return;
    }
    playWarning();
    setPin("");
    setShake((v) => v + 1);
    if (res.reason === "locked") {
      const mins = res.lockedUntil ? Math.max(1, Math.ceil((res.lockedUntil - Date.now()) / 60000)) : 5;
      setError(t("override.lockedOut", { n: mins, defaultValue: "محاولات كثيرة خاطئة — القفل مغلق لمدة {{n}} دقائق" }));
    } else if (res.reason === "no_pin") {
      setError(t("override.noPin", "لم يُعيَّن رمز بعد — يعيّنه المدير من الإعدادات"));
    } else if (res.reason === "wrong") {
      setError(
        res.remaining != null
          ? t("override.wrongLeft", { n: res.remaining, defaultValue: "رمز خاطئ — تبقّى {{n}} محاولات" })
          : t("override.wrong", "رمز خاطئ"),
      );
    } else {
      setError(t("override.error", "تعذّر التحقق — حاول مجدداً"));
    }
  };

  const push = (d: string) => {
    if (busy) return;
    playTap();
    setError(null);
    const next = (pinRef.current + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) void submit(next);
  };
  const pop = () => { if (!busy) setPin((p) => p.slice(0, -1)); };

  // Physical keyboard support (numbers row / numpad / backspace).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) push(e.key);
      else if (e.key === "Backspace") pop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  return (
    <Modal open={open} onClose={onClose} title={t("override.title", "وضع المدير")}>
      <div className="mx-auto max-w-xs text-center">
        <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><ShieldCheck size={26} /></span>
        <p className="mb-5 text-sm text-ink-muted">{t("override.enterPin", "أدخل الرمز السري المكوّن من 4 أرقام")}</p>

        {/* dots */}
        <div key={shake} className="mb-2 flex justify-center gap-3" style={{ animation: shake ? "vpShake .3s" : "none" }}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                "h-4 w-4 rounded-full border-2 transition-colors",
                i < pin.length ? "border-brand-600 bg-brand-600" : "border-line bg-surface-2",
              )}
            />
          ))}
        </div>
        <style>{`@keyframes vpShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }`}</style>
        <p className={cn("mb-4 min-h-5 text-xs font-semibold", error ? "text-danger-600" : "text-transparent")}>{error || "·"}</p>

        {/* keypad */}
        <div dir="ltr" className="mx-auto grid w-56 grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => push(d)}
              disabled={busy}
              className="h-14 rounded-2xl border border-line bg-surface-2 font-display text-xl font-bold text-ink transition hover:border-brand-300 hover:bg-brand-50 active:scale-95 disabled:opacity-50 dark:hover:bg-brand-500/10"
            >
              {d}
            </button>
          ))}
          <span />
          <button
            onClick={() => push("0")}
            disabled={busy}
            className="h-14 rounded-2xl border border-line bg-surface-2 font-display text-xl font-bold text-ink transition hover:border-brand-300 hover:bg-brand-50 active:scale-95 disabled:opacity-50 dark:hover:bg-brand-500/10"
          >
            0
          </button>
          <button
            onClick={() => { playTap(); pop(); }}
            disabled={busy}
            aria-label={t("common.delete", "حذف")}
            className="grid h-14 place-items-center rounded-2xl border border-line bg-surface-2 text-ink-muted transition hover:text-danger-600 active:scale-95 disabled:opacity-50"
          >
            <Delete size={20} />
          </button>
        </div>

        <p className="mt-5 text-2xs text-ink-subtle">{t("override.audit", "كل محاولة فتح — صحيحة أو خاطئة — تُسجَّل في سجل الحركات.")}</p>
      </div>
    </Modal>
  );
}

/* ------------------------- Settings card (managers) ---------------------- */
export function ManagerOverrideCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const ov = useOverride();
  const [enabled, setEnabled] = useState(getOverrideEnabled());
  const [pinSet, setPinSet] = useState(false);
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);

  useEffect(() => { void hasOverridePin().then(setPinSet); }, []);

  // REAL managers only — a temporarily elevated receptionist must not see this.
  if (appRoleToStaffRole(user?.role) !== "manager" || (ov.deviceLocked && !ov.active)) return null;

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setOverrideEnabled(next);
    if (next) playSuccess(); else playTap();
  };

  const savePin = async () => {
    if (!/^\d{4}$/.test(pin1)) { toast.error(t("override.pinFormat", "الرمز يجب أن يكون 4 أرقام بالضبط")); return; }
    if (pin1 !== pin2) { toast.error(t("override.pinMismatch", "الرمزان غير متطابقين")); return; }
    setBusy(true);
    try {
      await setOverridePin(pin1);
      setPinSet(true);
      setPin1(""); setPin2("");
      playSuccess();
      toast.success(t("override.pinSaved", "تم حفظ الرمز السري"));
    } catch (e) {
      playWarning();
      toast.error(t("override.pinSaveFail", "تعذّر حفظ الرمز"), e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  };

  const lockDevice = () => {
    if (!confirmLock) { playTap(); setConfirmLock(true); return; }
    setDeviceLocked(true);
    playSuccess();
    navigate("/");
  };

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  return (
    <div className="card p-5 mb-4">
      <h2 className="font-bold text-ink mb-1 flex items-center gap-2"><KeyRound size={18} className="text-brand-600" /> {t("override.cardTitle", "وضع المدير برمز سري")}</h2>
      <p className="text-xs text-ink-subtle mb-4">{t("override.cardHint", "أيقونة مفتاح صغيرة بجانب أزرار اللون واللغة: الموظف يدخل الرمز فيشاهد شاشات المدير لعشر دقائق، أو تقفل جهاز الاستقبال بواجهة محدودة يفتحها الرمز. كل استخدام يُسجَّل في سجل الحركات.")}</p>

      {/* enable */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">{t("override.enable", "تفعيل وضع المدير")}</p>
          <p className="text-xs text-ink-subtle mt-0.5">{t("override.enableHint", "معطّل افتراضياً — عند التفعيل تظهر الأيقونة للموظفين وعلى الأجهزة المقفلة.")}</p>
        </div>
        <button role="switch" aria-checked={enabled} onClick={toggle} className="mt-0.5 shrink-0" aria-label={t("override.enable", "تفعيل وضع المدير")}>
          <span className={cn("relative block h-6 w-11 rounded-full transition-colors", enabled ? "bg-brand-600" : "border border-line bg-surface-3")}>
            <span className={cn("absolute start-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", enabled && "translate-x-5 rtl:-translate-x-5")} />
          </span>
        </button>
      </div>

      {enabled && (
        <>
          {/* PIN */}
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm font-bold text-ink mb-1">{pinSet ? t("override.changePin", "تغيير الرمز السري") : t("override.setPin", "تعيين الرمز السري")}</p>
            <p className="text-xs text-ink-subtle mb-3">{t("override.pinHint", "4 أرقام — يُحفظ مشفّراً ولا يظهر لأحد بعد حفظه.")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password" inputMode="numeric" autoComplete="one-time-code" placeholder="••••"
                className="input w-28 text-center tracking-[6px]" dir="ltr"
                value={pin1} onChange={(e) => setPin1(digits(e.target.value))}
                aria-label={t("override.newPin", "الرمز الجديد")}
              />
              <input
                type="password" inputMode="numeric" autoComplete="one-time-code" placeholder="••••"
                className="input w-28 text-center tracking-[6px]" dir="ltr"
                value={pin2} onChange={(e) => setPin2(digits(e.target.value))}
                aria-label={t("override.confirmPin", "تأكيد الرمز")}
              />
              <Button size="sm" onClick={savePin} loading={busy} disabled={pin1.length !== 4 || pin2.length !== 4}>
                {t("override.savePin", "حفظ الرمز")}
              </Button>
              {pinSet && <span className="chip bg-success-50 text-2xs font-semibold text-success-600 dark:bg-success-500/15 dark:text-success-300">{t("override.pinIsSet", "الرمز معيَّن ✓")}</span>}
            </div>
          </div>

          {/* device lock */}
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm font-bold text-ink mb-1 flex items-center gap-1.5"><MonitorSmartphone size={15} className="text-brand-600" /> {t("override.devLock", "قفل هذا الجهاز بواجهة الاستقبال")}</p>
            <p className="text-xs text-ink-subtle mb-3">{t("override.devLockHint", "مناسب لجهاز الرسبشن المفتوح بحسابك: تختفي التقارير والإعدادات من هذا الجهاز فقط، ورمزك السري يعيدها عشر دقائق كلما احتجت.")}</p>
            <Button
              size="sm" variant={confirmLock ? "primary" : "secondary"}
              leftIcon={<Lock size={15} />}
              disabled={!pinSet}
              onClick={lockDevice}
              onBlur={() => setConfirmLock(false)}
            >
              {confirmLock ? t("override.devLockConfirm", "اضغط مرة أخرى للتأكيد") : t("override.devLockBtn", "قفل الجهاز الآن")}
            </Button>
            {!pinSet && <p className="mt-1.5 text-2xs font-semibold text-warn-600">{t("override.needPinFirst", "عيّن الرمز السري أولاً حتى تتمكن من فتح القفل لاحقاً.")}</p>}
          </div>
        </>
      )}
    </div>
  );
}
