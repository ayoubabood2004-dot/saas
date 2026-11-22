import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Mic } from "lucide-react";
import { outboxInternals } from "@/lib/outbox";
import { PENDING_EVENT, PENDING_KEY, pendingCounts, readPendingFlag } from "@/lib/voice/voicePending";
import { playTap } from "@/lib/sounds";

/** شارةُ «تسجيلاتٌ ما ارتفعت» (0287) — بجانب شارة الصادر، من علمٍ متزامن بلا قاعدة (voicePending.ts).
 *
 *  بحزمة الإقلاع عمداً وصغيرة: الرفُّ والرافعُ كسولان. حين يكون للداخل تسجيلٌ ينتظر تُحمِّل الرافعَ
 *  (بلا نصوص) فيرتفع بلا أن تُفتح الزيارة. وتسمع «اطلع» المحجوب (`vp:voice-leave`: صوتٌ بالذاكرة وحدها)
 *  فتفتح /voice?leave=1 وتمسكه (preventDefault) — أوّلُ شارةٍ تسمعه تكفي (stopImmediatePropagation). */
export function VoiceChip({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const read = () => pendingCounts(readPendingFlag(), outboxInternals.whoNow()?.user ?? null);
  const [c, setC] = useState(read);

  useEffect(() => {
    const sync = () => setC(read());
    const onStorage = (e: StorageEvent) => { if (e.key === PENDING_KEY) sync(); };
    const onLeave = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); navigate("/voice?leave=1"); };
    window.addEventListener(PENDING_EVENT, sync);
    window.addEventListener("storage", onStorage);
    window.addEventListener("vp:voice-leave", onLeave);
    const iv = setInterval(sync, 15_000);
    return () => {
      window.removeEventListener(PENDING_EVENT, sync);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("vp:voice-leave", onLeave);
      clearInterval(iv);
    };
  }, [navigate]);

  useEffect(() => {
    if (c.mine > 0) void import("@/lib/voice/voiceUploader").then((m) => m.armUploader()).catch(() => undefined);
  }, [c.mine]);

  if (c.mine <= 0 && c.others <= 0) return null;
  const failed = c.mineFailed > 0;
  const open = () => { playTap(); navigate("/voice", { replace: location.pathname === "/voice" }); };
  // الأحمرُ = تسجيلٌ فشل ويحتاج الطبيب (العددُ نفسُه؛ السببُ بصفحة /voice) — نصٌّ واحد بالإقلاع لا ثلاثة.
  return (
    <button
      type="button"
      onClick={open}
      data-voicechip
      aria-label={compact ? t("outbox.voice", { n: c.mine > 0 ? c.mine : c.others }) : undefined}
      className={
        failed
          ? "flex items-center gap-1.5 rounded-full border border-danger-300 bg-danger-50 px-3 py-1.5 text-2xs font-bold text-danger-700 transition hover:bg-danger-100 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-200"
          : "flex items-center gap-1.5 rounded-full border border-warn-300 bg-warn-50 px-3 py-1.5 text-2xs font-bold text-warn-700 transition hover:bg-warn-100 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200"
      }
    >
      {failed ? <AlertTriangle size={14} /> : <Mic size={14} />}
      {compact
        ? <span className="tabular-nums">{c.mine > 0 ? c.mine : c.others}</span>
        : c.mine > 0 ? t("outbox.voice", { n: c.mine })
        : t("outbox.voiceOthers", { n: c.others })}
    </button>
  );
}
