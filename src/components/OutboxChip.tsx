import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloudOff, CloudUpload } from "lucide-react";
import { outboxCount, flushOutbox } from "@/lib/outbox";
import { Tooltip } from "@/components/ui";
import { playTap } from "@/lib/sounds";

/** شارة صندوق الصادر: تظهر فقط حين توجد كتاباتٌ محفوظة بالجهاز تنتظر النت،
 *  ودوستها تحاول الرفع فوراً. اختفاؤها = كل شيء وصل السيرفر. */
export function OutboxChip() {
  const { t } = useTranslation();
  const [count, setCount] = useState(() => outboxCount());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onChange = (e: Event) => setCount((e as CustomEvent<{ count: number }>).detail?.count ?? outboxCount());
    window.addEventListener("vp-outbox", onChange);
    const iv = setInterval(() => setCount(outboxCount()), 15_000);
    return () => { window.removeEventListener("vp-outbox", onChange); clearInterval(iv); };
  }, []);

  if (count <= 0) return null;

  const tryNow = async () => {
    if (busy) return;
    playTap(); setBusy(true);
    try { await flushOutbox(); } finally { setBusy(false); setCount(outboxCount()); }
  };

  return (
    <Tooltip label={t("outbox.tip", "محفوظ بجهازك وينرفع تلقائياً لما يرجع النت — دوس للمحاولة هسة")}>
      <button
        onClick={tryNow}
        data-outboxchip
        className="flex items-center gap-1.5 rounded-full border border-warn-300 bg-warn-50 px-3 py-1.5 text-2xs font-bold text-warn-800 transition hover:bg-warn-100 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200"
      >
        {busy ? <CloudUpload size={14} className="animate-pulse" /> : <CloudOff size={14} />}
        {t("outbox.waiting", { n: count, defaultValue: "بانتظار النت: {{n}}" })}
      </button>
    </Tooltip>
  );
}
