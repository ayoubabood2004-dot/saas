import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CloudOff, CloudUpload, AlertTriangle } from "lucide-react";
import { outboxCount, outboxDeadCount, flushOutbox, outboxReviewList, outboxWaitingOthers } from "@/lib/outbox";
import { Tooltip } from "@/components/ui";
import { playTap } from "@/lib/sounds";

/** شارة صندوق الصادر: تظهر فقط حين توجد كتاباتٌ محفوظة بالجهاز تنتظر النت،
 *  ودوستها تحاول الرفع فوراً. اختفاؤها = كل شيء وصل السيرفر.
 *
 *  ولها حالةٌ ثانية أحمر: عملياتٌ رفضتها القاعدة مراراً فانتقلت لرفّ
 *  «المعطّلات». كانت تُحذف بصمتٍ وسطرٍ بالكونسول لا يقرأه أحد — أي ضياعُ
 *  بياناتٍ لا يعلم به صاحبها. صارت تبقى بحمولتها وتصرخ هنا، ودوستها تستأنفها
 *  بعد أن يُصلَّح سببُ الرفض. */
/** `compact`: أيقونةٌ وعدّادٌ بلا نصّ (القائمةُ الجانبية المطويّة). */
export function OutboxChip({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  /* «بانتظار النت» لما يرفعه الداخلُ وحدَه: ما ينتظر حساباً آخر لا ينتظر النت — كان يُعدّ هنا
   * أبداً بلا مخرج. يُعدّ منفصلاً، وضغطةٌ تنقل لصفحة المراجعة حيث يُشرح ويُحذف بقرار المدير. */
  const own = () => outboxCount() - outboxWaitingOthers().length;
  const [count, setCount] = useState(own);
  const [others, setOthers] = useState(() => outboxWaitingOthers().length);
  const [dead, setDead] = useState(() => outboxDeadCount());
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(() => outboxReviewList().length);
  const navigate = useNavigate();
  const location = useLocation();

  const sync = useCallback(() => { setCount(own()); setOthers(outboxWaitingOthers().length); setDead(outboxDeadCount()); setReview(outboxReviewList().length); }, []);

  useEffect(() => {
    window.addEventListener("vp-outbox", sync);
    const iv = setInterval(sync, 15_000);
    return () => { window.removeEventListener("vp-outbox", sync); clearInterval(iv); };
  }, [sync]);

  if (count <= 0 && dead <= 0 && others <= 0) return null;

  const tryNow = async () => {
    if (busy) return;
    playTap(); setBusy(true);
    try {
      /* الرفُّ كلُّه يُراجَع بصفحة /outbox (قرارُ المالك ١٣/١٠): ما بلا ختمٍ قد أُدخل يدوياً فرفعُه
       * الأعمى يكرّره، والمرفوضُ أبداً كان يدور بإعادةٍ عمياء بلا مخرجٍ ولا سبب. والطابورُ يُرفع. */
      if (dead > 0 || others > 0) navigate("/outbox", { replace: location.pathname === "/outbox" });
      await flushOutbox();
    } finally { setBusy(false); sync(); }
  };

  // الأحمر يسبق الأصفر: عمليةٌ رفضتها القاعدة أخطرُ من عمليةٍ تنتظر النت.
  const stuck = dead > 0;
  const tip = review > 0 || (dead <= 0 && count <= 0 && others > 0)
    ? t("outbox.reviewTip")
    : stuck
    ? t("outbox.stuckTip", "القاعدة رفضتها مراراً فما انحذفت — محفوظة بجهازك. دوس لإعادة المحاولة")
    : t("outbox.tip", "محفوظ بجهازك وينرفع تلقائياً لما يرجع النت — دوس للمحاولة هسة");

  return (
    <Tooltip label={tip}>
      <button
        onClick={tryNow}
        data-outboxchip
        className={
          stuck
            ? "flex items-center gap-1.5 rounded-full border border-danger-300 bg-danger-50 px-3 py-1.5 text-2xs font-bold text-danger-700 transition hover:bg-danger-100 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-200"
            : "flex items-center gap-1.5 rounded-full border border-warn-300 bg-warn-50 px-3 py-1.5 text-2xs font-bold text-warn-700 transition hover:bg-warn-100 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200"
        }
      >
        {busy ? <CloudUpload size={14} className="animate-pulse" />
          : stuck ? <AlertTriangle size={14} /> : <CloudOff size={14} />}
        {compact
          ? <span className="tabular-nums">{stuck ? dead : count > 0 ? count : others}</span>
          : stuck
          ? t("outbox.stuck", { n: dead, defaultValue: "متعثّرة: {{n}}" })
          : count > 0
          ? t("outbox.waiting", { n: count, defaultValue: "بانتظار النت: {{n}}" })
          : t("outbox.others", { n: others })}
      </button>
    </Tooltip>
  );
}
