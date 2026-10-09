import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera } from "lucide-react";
import type { StoreProfile } from "@/types";
import { repo } from "@/lib/repo";
import { usePermissions } from "@/hooks/usePermissions";
import { useEntitlements } from "@/lib/entitlements";
import { StoreBoard } from "@/components/store/StoreBoard";

/* ============================================================================
 * صورُ المنتجات — شاشةُ موظّف التصوير (0222)، ولمن يملك الإذن من الكادر.
 *
 * منذ 0229 هي **لوحةُ المتجر نفسُها** (`StoreBoard`) تبدأ بـ«بلا صورة»: المصوّرُ يصوّر
 * ويعاين قبل الرفع، ثمّ ينشر ويسعّر ويوصف ويدرج بقسم من نفس البطاقة — المقيسُ
 * أنّ الشغلَ كان يقف عند الصورة لأن ما بعدها بشاشةٍ ثانية. والخادمُ يسأل الإذنَ
 * بكلّ نداء؛ هنا يُعرض ما يملكه فقط (بلا إذن المتجر: صورٌ وحدها).
 * ========================================================================= */

export function ProductPhotos() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const { has } = useEntitlements();
  const canStore = can("manageStore") && has("store");
  const [profile, setProfile] = useState<StoreProfile | null>(null);

  // رابطُ المتجر لزرّ «افتح المتجر الحقيقي» بالمعاينة — وفشلُه لا يمسّ اللوحة.
  useEffect(() => {
    if (!canStore) return;
    let alive = true;
    void repo.getStoreProfile().then((p) => { if (alive) setProfile(p); }).catch(() => undefined);
    return () => { alive = false; };
  }, [canStore]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6" data-photos>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><Camera size={22} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-extrabold text-ink">{canStore ? t("sb.photosTitle", "صور المنتجات والمتجر") : t("photos.title", "صور المنتجات")}</h1>
          <p className="text-sm text-ink-subtle">
            {canStore
              ? t("sb.photosSub", "صوّر، عاين الصورة، وانشر — وكل منتج يقول شنو ناقصه")
              : t("photos.sub", "صوّر المنتج، أو اختار صورته من الألبوم أو المكتبة — الصورة تطلع بالمتجر والمخزون")}
          </p>
        </div>
      </div>
      <StoreBoard mode="photos" storeSlug={profile?.slug ?? null} storeOn={!!profile?.enabled} />
    </div>
  );
}
