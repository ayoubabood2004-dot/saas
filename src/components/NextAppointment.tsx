import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Check, Clock, Plus } from "lucide-react";
import type { Appointment } from "@/types";
import { repo } from "@/lib/repo";
import { formatDate, formatTime } from "@/lib/utils";
import { SERVICE_COLOR } from "@/lib/clinic";
import { playSuccess, playTap } from "@/lib/sounds";

export function NextAppointment({ appt, onChanged }: { appt: Appointment | null; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [flash, setFlash] = useState<string | null>(null);

  if (!appt) {
    return (
      <button className="card w-full p-4 flex items-center justify-between text-start hover:shadow-soft" onClick={() => { playTap(); navigate("/book"); }}>
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-full bg-brand-50 text-brand-600"><Plus size={20} /></span>
          <span className="font-semibold text-ink">{t("appt.bookNew")}</span>
        </div>
      </button>
    );
  }

  const color = SERVICE_COLOR[appt.service];

  const confirm = async () => {
    await repo.setAppointmentStatus(appt.id, "confirmed");
    playSuccess();
    setFlash(t("appt.confirmed"));
    onChanged();
  };

  const postpone = async () => {
    playTap();
    setFlash(t("appt.postponeRequested"));
  };

  return (
    <div className={`card p-4 ${color.bg} ring-1 ${color.ring} animate-fade-in`}>
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock size={18} className={color.text} />
        <span className={`text-sm font-bold ${color.text}`}>{t("appt.next")}</span>
        <span className={`chip ms-auto text-xs bg-white ${color.text}`}>{t(`service.${appt.service}`)}</span>
      </div>
      <p className="font-bold text-ink">{appt.doctor_name}</p>
      <p className="text-sm text-ink-muted flex items-center gap-1.5 mt-0.5">
        <Clock size={14} /> {formatDate(appt.scheduled_at, i18n.language)} · {formatTime(appt.scheduled_at, i18n.language)}
      </p>

      {flash ? (
        <p className="mt-3 text-sm font-medium text-brand-700 flex items-center gap-1.5"><Check size={16} /> {flash}</p>
      ) : (
        <div className="flex gap-2 mt-3">
          <button className="btn-primary flex-1 py-2 text-sm" onClick={confirm}>{t("appt.confirmAttendance")}</button>
          <button className="btn-ghost flex-1 py-2 text-sm bg-white" onClick={postpone}>{t("appt.requestPostpone")}</button>
        </div>
      )}
    </div>
  );
}
