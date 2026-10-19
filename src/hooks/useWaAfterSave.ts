// رسالةُ واتساب **بعد حفظ** — إبلاغُ السائق بعد تبديل الطلب أو تعديله.
//
// الحفظُ ينتظر الشبكة، فحين يصل الإرسالُ تكون الضغطةُ قد ضاعت، وسفاري (آيفون/آيباد) يمنع
// الفتحَ فترمي sendWhatsApp خطأ WaBlockedError. كان كلُّ مُنادٍ يبلعه بـ`catch {}`: يُغلق الحوار
// بـ«تم» والسائقُ ما وصله شيء ولا أحدَ يعرف. هنا يُقال باسمه، ومعه زرٌّ يعيد الإرسالَ بضغطةٍ
// جديدة — والضغطةُ الجديدة تفتح بلحظتها لأن الحصّةَ مسخَّنة (useWarmWaQuota).
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui";
import { sendWhatsApp, quotaMessage, useWarmWaQuota, type WaSend } from "@/lib/quotas";

/** أرسل بعد حفظ؛ لا يرمي أبداً — المنعُ زرٌّ بتوست، والحصّةُ رسالتُها. `who` اسمُ المستلم: سطرُ التوست
 *  الثاني (النصُّ نصُّ quotaMessage نفسُه — القاموسُ البارد بسقفه، فلا نصَّ ثانياً للمعنى نفسه). */
export function useWaAfterSave(): (m: WaSend, who: string) => Promise<void> {
  const { t } = useTranslation();
  const toast = useToast();
  useWarmWaQuota();
  const send = (m: WaSend, who: string): Promise<void> =>
    sendWhatsApp(m).catch((e: unknown) => {
      const msg = quotaMessage(e) ?? t("errors.tryAgain", "حاول مرة أخرى.");
      if ((e as { name?: string } | null)?.name === "WaBlockedError") {
        toast.toast({
          tone: "warn", title: msg, description: who,
          // بلا انتظارٍ قبلها: الضغطةُ على الزرّ هي الضغطةُ التي يفتح بها.
          action: { label: t("common.retry", "إعادة المحاولة"), onClick: () => { void send(m, who); } },
        });
      } else {
        toast.error(msg, who);
      }
    });
  return send;
}
