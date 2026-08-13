import { useEffect, useState } from "react";
import { sendWhatsApp, quotaMessage, type WaSend } from "@/lib/quotas";
import { useTranslation } from "react-i18next";
import { BellRing, Check, X, Phone, MessageCircle, CalendarClock, Stethoscope } from "lucide-react";
import type { Appointment, Pet } from "@/types";
import { repo } from "@/lib/repo";
import { bumpBookingRequests, requestNotifyPermission } from "@/lib/bookingRequests";
import { getCached, setCached } from "@/lib/swrCache";
import { getDialCode, getClinicName } from "@/lib/settings";
import { waNumber } from "@/lib/phone";
import { formatTime, dateLocale } from "@/lib/utils";
import { PetAvatar } from "@/components/PetAvatar";
import { useToast } from "@/components/ui";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/**
 * صندوق «طلبات الحجز» — حجوزات الزبائن الواصلة من حساباتهم وتنتظر قرار العيادة.
 * يظهر أعلى الاستقبال فقط عند وجود طلبات: تأكيد بضغطة (مع خيار إبلاغ الزبون
 * واتساب)، أو اعتذار. أول تفاعل معه يطلب إذن إشعارات المتصفح حتى تنبّه العيادة
 * فوراً بالطلبات الجاية.
 */
export function BookingRequests() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [requests, setRequests] = useState<Appointment[]>([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const list = await repo.listBookingRequests();
      const petList = await repo.getPetsByIds([...new Set(list.map((a) => a.pet_id))]).catch(() => [] as Pet[]);
      const map = Object.fromEntries(petList.map((p) => [p.id, p]));
      setCached("bk_requests", { requests: list, pets: map });
      setRequests(list);
      setPets(map);
    } catch { /* transient */ }
  };

  useEffect(() => {
    // رسمة فورية من آخر نسخة محفوظة — التحديث الحقيقي يلحقها بالخفاء
    const cached = getCached<{ requests: Appointment[]; pets: Record<string, Pet> }>("bk_requests");
    if (cached) { setRequests(cached.requests); setPets(cached.pets); }
    void load();
    const id = window.setInterval(() => { void load(); }, 45000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decide = async (a: Appointment, status: "confirmed" | "cancelled") => {
    if (busyId) return;
    setBusyId(a.id);
    requestNotifyPermission(); // user gesture — the right moment to ask
    try {
      await repo.setAppointmentStatus(a.id, status);
      if (status === "confirmed") playSuccess(); else playWarning();
      toast.success(status === "confirmed" ? t("bookReq.confirmed", "تم تأكيد الحجز ✓") : t("bookReq.rejected", "تم الاعتذار عن الحجز"));
      setRequests((rs) => rs.filter((r) => r.id !== a.id));
      bumpBookingRequests();
    } catch (e) {
      toast.error(t("records.saveError", "تعذر الحفظ — حاول مرة ثانية."), e instanceof Error ? e.message : undefined);
    } finally {
      setBusyId(null);
    }
  };

  // زوج (رقم/نص) بدل رابط جاهز: الإرسال يمرّ بنقطة الاختناق التي تفحص
  // الحصة وتسجّل الرسالة — الرابط المباشر كان يتخطّى الاثنين.
  const waHref = (a: Appointment): WaSend | null => {
    const phone = pets[a.pet_id]?.owner_phone;
    if (!phone) return null;
    const when = `${new Date(a.scheduled_at).toLocaleDateString(i18n.language === "ar" ? dateLocale() : "en-US", { weekday: "long", day: "numeric", month: "long" })} ${formatTime(a.scheduled_at, i18n.language)}`;
    const msg = t("bookReq.waMsg", {
      owner: pets[a.pet_id]?.owner_name ?? "",
      pet: pets[a.pet_id]?.name ?? "",
      when,
      clinic: getClinicName(),
      defaultValue: "مرحباً {{owner}} 🌟 تم تأكيد موعد {{pet}} — {{when}} في {{clinic}}. بانتظاركم!",
    });
    return { phone: waNumber(phone, getDialCode()), text: msg, petId: a.pet_id, ownerName: pets[a.pet_id]?.owner_name ?? null, ownerPhone: phone, kind: "booking" };
  };

  if (requests.length === 0) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-3xl border border-brand-200 bg-brand-50/70 dark:border-brand-500/30 dark:bg-brand-500/10">
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-soft">
          <BellRing size={17} />
          <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger-500 px-1 text-2xs font-bold text-white">{requests.length}</span>
        </span>
        <h2 className="font-display font-bold text-ink">{t("bookReq.title", "طلبات حجز جديدة")}</h2>
        <p className="ms-auto hidden text-xs text-ink-subtle sm:block">{t("bookReq.hint", "من حسابات الزبائن — أكّد أو اعتذر وينوصل الزبون")}</p>
      </div>

      <div className="space-y-2 p-3">
        {requests.map((a) => {
          const pet = pets[a.pet_id];
          const wa = waHref(a);
          return (
            <div key={a.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-1 p-3.5 sm:flex-row sm:items-center">
              {pet && <PetAvatar pet={pet} size={44} photoFallback />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">
                  {pet?.name ?? t("bookReq.aPet", "حيوان")}
                  {pet?.owner_name && <span className="font-normal text-ink-muted"> — {pet.owner_name}</span>}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
                  <span className="flex items-center gap-1"><Stethoscope size={12} /> {t(`service.${a.service}`)} · {a.doctor_name}</span>
                  <span className="flex items-center gap-1 font-semibold text-brand-700 dark:text-brand-300 tabular-nums">
                    <CalendarClock size={12} />
                    {new Date(a.scheduled_at).toLocaleDateString(i18n.language === "ar" ? dateLocale() : "en-US", { weekday: "long", day: "numeric", month: "long" })} {formatTime(a.scheduled_at, i18n.language)}
                  </span>
                </p>
                {a.symptoms && <p className="mt-1 truncate text-xs text-ink-subtle">💬 {a.symptoms}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {pet?.owner_phone && (
                  <a href={`tel:${pet.owner_phone}`} onClick={() => playTap()} title={t("dashboard.callClinic", "اتصال")}
                     className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface-2 text-ink-muted transition hover:text-brand-600">
                    <Phone size={15} />
                  </a>
                )}
                {wa && (
                  <button type="button" onClick={() => { playTap(); void sendWhatsApp(wa).catch((e) => { const m = quotaMessage(e); if (m) window.alert(m); }); }} title={t("bookReq.waTitle", "إبلاغ الزبون واتساب")}
                     className="grid h-9 w-9 place-items-center rounded-xl bg-success-500 text-white shadow-soft transition hover:bg-success-600">
                    <MessageCircle size={15} />
                  </button>
                )}
                <button
                  onClick={() => decide(a, "cancelled")}
                  disabled={busyId === a.id}
                  className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs font-semibold text-ink-muted transition hover:border-danger-300 hover:text-danger-600 disabled:opacity-50"
                >
                  <X size={14} /> {t("bookReq.reject", "اعتذار")}
                </button>
                <button
                  onClick={() => decide(a, "confirmed")}
                  disabled={busyId === a.id}
                  className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-bold text-white shadow-soft transition hover:bg-brand-700 disabled:opacity-50"
                >
                  <Check size={14} /> {t("bookReq.confirm", "تأكيد الحجز")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
