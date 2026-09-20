import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui";
import { storeSlugCached } from "@/lib/storeOrdersLive";
import { storeUrl } from "@/lib/storeLib";
import { openBlankFormPrint } from "@/lib/invoicePrint";
import { getClinicLogo, getClinicSocials, getClinicName } from "@/lib/settings";

/**
 * طباعةُ وصلٍ فارغ — نفسُ ترويسة العيادة، بلا بيانات، تُملأ بالقلم.
 *
 * لا عدّادَ طباعةٍ ولا سطرَ نشاط: لا فاتورةَ هنا تُعدّ طباعاتُها، والورقةُ
 * لا تدّعي وجوداً بالسجلّ (انظر `buildBlankFormHTML`). وكلُّ ما تقرأه من
 * الإعدادات **من الذاكرة** — لا رحلةَ شبكةٍ بين ضغطةِ الزرّ وفتحِ النافذة،
 * وإلا عدَّها المتصفّحُ منبثقةً غيرَ مطلوبةٍ وحجبها.
 */
export function useBlankFormPrinter() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const toast = useToast();

  return async function printBlankForm(): Promise<void> {
    const socials = getClinicSocials();
    const ok = await openBlankFormPrint({
      clinicName: getClinicName() || user?.full_name || "doctorVet",
      clinicPhone: user?.phone ?? null,
      brand: "doctorVet",
      lang: i18n.language,
      logoUrl: getClinicLogo(),
      storeUrl: (() => { const sl = storeSlugCached(); return sl ? storeUrl(sl) : null; })(),
      facebook: socials.facebook || null,
      instagram: socials.instagram || null,
    });
    if (!ok) {
      toast.error(
        t("retail.popupBlocked", "Allow pop-ups to print"),
        t("retail.popupBlockedHint", "Your browser blocked the print window — enable pop-ups for this site."),
      );
    }
  };
}
