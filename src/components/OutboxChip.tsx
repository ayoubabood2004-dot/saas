import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloudOff, CloudUpload, AlertTriangle } from "lucide-react";
import { outboxCount, outboxDeadCount, flushOutbox, outboxRevive } from "@/lib/outbox";
import { Tooltip } from "@/components/ui";
import { playTap } from "@/lib/sounds";

/** شارة صندوق الصادر: تظهر فقط حين توجد كتاباتٌ محفوظة بالجهاز تنتظر النت،
 *  ودوستها تحاول الرفع فوراً. اختفاؤها = كل شيء وصل السيرفر.
 *
 *  ولها حالةٌ ثانية أحمر: عملياتٌ رفضتها القاعدة مراراً فانتقلت لرفّ
 *  «المعطّلات». كانت تُحذف بصمتٍ وسطرٍ بالكونسول لا يقرأه أحد — أي ضياعُ
 *  بياناتٍ لا يعلم به صاحبها. صارت تبقى بحمولتها وتصرخ هنا، ودوستها تستأنفها
 *  بعد أن يُصلَّح سببُ الرفض. */
export function OutboxChip() {
  const { t } = useTranslation();
  const [count, setCount] = useState(() => outboxCount());
  const [dead, setDead] = useState(() => outboxDeadCount());
  const [busy, setBusy] = useState(false);

  const sync = useCallback(() => { setCount(outboxCount()); setDead(outboxDeadCount()); }, []);

  useEffect(() => {
    const onChange = (e: Event) => {
      const d = (e as CustomEvent<{ count?: number; dead?: number }>).detail;
      setCount(d?.count ?? outboxCount());
      setDead(d?.dead ?? outboxDeadCount());
    };
    window.addEventListener("vp-outbox", onChange);
    const iv = setInterval(sync, 15_000);
    return () => { window.removeEventListener("vp-outbox", onChange); clearInterval(iv); };
  }, [sync]);

  if (count <= 0 && dead <= 0) return null;

  const tryNow = async () => {
    if (busy) return;
    playTap(); setBusy(true);
    try {
      if (dead > 0) outboxRevive();   // المعطّلات ترجع للطابور بعدّادٍ صفر
      await flushOutbox();
    } finally { setBusy(false); sync(); }
  };

  // الأحمر يسبق الأصفر: عمليةٌ رفضتها القاعدة أخطرُ من عمليةٍ تنتظر النت.
  const stuck = dead > 0;
  const tip = stuck
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
        {stuck
          ? t("outbox.stuck", { n: dead, defaultValue: "متعثّرة: {{n}}" })
          : t("outbox.waiting", { n: count, defaultValue: "بانتظار النت: {{n}}" })}
      </button>
    </Tooltip>
  );
}
