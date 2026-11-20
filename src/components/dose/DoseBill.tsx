/* ============================================================================
 * شارةُ سعر الجرعة وسطرُ «مستحق من الطبلة» (0269) — شكلٌ واحد لسجلّ الحيوان ولطبلة الزيارة.
 *
 * بلا نصوص: كلُّ صفحةٍ تعطي نصوصَها من نطاقها المملوك (`dsht` لسجلّ الحيوان، و`vbk` للزيارة) — النطاقُ المملوك
 * يصل مع صفحته وحدها ولا يُقرأ خارجها (i18n-owned-guard)، والنصفُ البارد على سقفه. والحالُ (سعرٌ قبل الإعطاء،
 * «بانتظار البيع»، «انحسبت») من `useDoseSheet` وحده — هنا رسمٌ فقط.
 * ========================================================================= */
import { useNavigate } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui";
import { money } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import type { SheetBill } from "@/lib/doseBilling";

export interface DoseBillText {
  will(price: string): string;
  pending(price: string): string;
  billed(price: string): string;
  due(total: string): string;
  dueN(n: number): string;
  sell: string;
}

/** سعرُ الجرعة: قبل الإعطاء ما ستُحسب به، وبعده «بانتظار البيع» أو «انحسبت». */
export function DoseBillChip({ bill, text }: { bill: SheetBill | null | undefined; text: DoseBillText }) {
  if (!bill) return null;
  const price = money(bill.price);
  if (bill.state === "billed") return <span className="chip bg-success-50 text-[11px] text-success-700 dark:bg-success-500/15 dark:text-success-200" data-dosebill-state="billed">{text.billed(price)}</span>;
  if (bill.state === "pending") return <span className="chip bg-warn-50 text-[11px] text-warn-700 dark:bg-warn-500/15 dark:text-warn-200" data-dosebill-state="pending">{text.pending(price)}</span>;
  return <span className="chip bg-brand-50 text-[11px] text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" data-dosebill-state="will">{text.will(price)}</span>;
}

/** «مستحق من الطبلة»: معلَّقاتُ الحيوان كلُّها بانتظار البيع، وزرٌّ يفتح بيعةَ صاحبه فتنزل بالسلّة. */
export function DoseDueBar({ pending, href, text }: { pending: { count: number; total: number } | null; href: string; text: DoseBillText }) {
  const navigate = useNavigate();
  if (!pending || pending.count === 0) return null;
  return (
    <div className="card flex flex-wrap items-center gap-3 border-warn-300 bg-warn-50/60 p-3 dark:bg-warn-500/10" data-dosedue>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-ink">{text.due(money(pending.total))}</p>
        <p className="text-2xs text-ink-muted">{text.dueN(pending.count)}</p>
      </div>
      <Button size="sm" leftIcon={<ShoppingCart size={16} />} onClick={() => { playTap(); navigate(href); }}>{text.sell}</Button>
    </div>
  );
}
