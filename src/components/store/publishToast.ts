import type { TFunction } from "i18next";
import type { StorePublishResult } from "@/types";
import type { Missing } from "@/lib/storeBoard";
import { formatNum } from "@/lib/utils";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/* «قائمةٌ ناقصة أخطرُ من خطأ ظاهر» — النشرُ يقول ما انتشر **وما تُخطّي ولماذا** بالعدد.
 * «انتشر ٢٧» وثلاثةٌ بلا صورةٍ بقيت مخفيّةً بصمت كان سيُصدَّق: المصوّرُ يظنّها بالمتجر. */

type ToastApi = {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  toast: (t: { tone?: "success" | "error" | "warn" | "info"; title: string; description?: string }) => void;
};

export function missText(t: TFunction, m: Missing): string {
  return m === "photo" ? t("sb.miss.photo", "صورة") : m === "price" ? t("sb.miss.price", "سعر") : t("sb.miss.expired", "صلاحية منتهية");
}

export function publishToast(toast: ToastApi, t: TFunction, r: StorePublishResult, on: boolean, single = false): void {
  const skipped = r.skipped_no_photo + r.skipped_no_price + r.skipped_expired;
  if (!on) {
    playTap();
    if (r.changed > 0) toast.success(single ? t("sb.hidOne", "انخفى من المتجر") : t("sb.hidMany", "انخفى {{n}} منتج", { n: formatNum(r.changed) }));
    else toast.toast({ tone: "info", title: t("sb.nothing", "ما تغيّر شي — كانت هيچي أصلاً") });
    return;
  }
  if (skipped === 0) {
    if (r.changed > 0) {
      playSuccess();
      toast.success(single ? t("sb.shownOne", "انتشر بالمتجر") : t("sb.shownMany", "انتشر {{n}} منتج بالمتجر", { n: formatNum(r.changed) }));
    } else {
      playTap();
      toast.toast({ tone: "info", title: t("sb.nothing", "ما تغيّر شي — كانت هيچي أصلاً") });
    }
    return;
  }
  playWarning();
  const why = [
    r.skipped_no_photo ? t("sb.skipPhoto", "{{n}} بلا صورة", { n: formatNum(r.skipped_no_photo) }) : null,
    r.skipped_no_price ? t("sb.skipPrice", "{{n}} بلا سعر", { n: formatNum(r.skipped_no_price) }) : null,
    r.skipped_expired ? t("sb.skipExpired", "{{n}} منتهي الصلاحية", { n: formatNum(r.skipped_expired) }) : null,
  ].filter(Boolean).join(t("sb.sep", "، "));
  toast.error(
    r.changed > 0
      ? t("sb.shownSome", "انتشر {{n}} — وما انتشر: {{why}}", { n: formatNum(r.changed), why })
      : t("sb.shownNone", "ما انتشر — {{why}}", { why }),
    t("sb.skipHint", "الزبون ما يشوف منتجاً بلا صورة أو بلا سعر أو منتهي. كمّل الناقص وانشره."),
  );
}
