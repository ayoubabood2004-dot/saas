// ============================================================================
// تبويبا منتقي المكتبة (0285): «مكتبة عيادتي» و«المكتبة العامة». مالكُ النطاق `libp` — المنتقي يحمّله
// كسولاً (`page()`) حين يكون للعيادة مكتبتُها فقط، فعيادةٌ بلا مكتبةٍ خاصّة لا تدفع وزنَه ولا نصوصَه.
// ============================================================================
import { useTranslation } from "react-i18next";
import { Building2, Images, type LucideIcon } from "lucide-react";
import { cn, formatNum } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import type { LibScope } from "@/lib/libraryScope";

export function LibraryScope({ scope, onScope, mine, pub }: {
  scope: LibScope;
  onScope: (s: LibScope) => void;
  mine: number;
  pub: number;
}) {
  const { t } = useTranslation();
  const tab = (s: LibScope, label: string, n: number, Icon: LucideIcon) => (
    <button type="button" onClick={() => { playTap(); onScope(s); }} data-libscope={s}
      className={cn("inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition",
        scope === s ? "bg-brand-600 text-white" : "border border-line bg-surface-1 text-ink-muted hover:text-ink")}>
      <Icon size={14} /> {label} <span className="opacity-75">{formatNum(n)}</span>
    </button>
  );
  return (
    <div className="flex flex-wrap gap-1.5" data-libscopes>
      {tab("mine", t("libp.mine"), mine, Images)}
      {tab("public", t("libp.public"), pub, Building2)}
    </div>
  );
}
