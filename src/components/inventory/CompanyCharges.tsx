import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { HandCoins, Plus, Trash2, Check, RotateCcw, CalendarClock } from "lucide-react";
import type { CompanyCharge } from "@/types";
import { repo } from "@/lib/repo";
import { Button, useToast } from "@/components/ui";
import { cn, money, formatDate, localISO } from "@/lib/utils";
import { withTimeout, describeDbError } from "@/lib/errors";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/* ============================================================================
 * مطالبات الشركة اليدوية (0155) — ما تطلبه الشركةُ ولا فاتورةَ شراءٍ له.
 *
 * أجرةُ نقل، فرقُ سعرٍ اتُّفق عليه بعد التسليم، تالفٌ حُسب على العيادة، رصيدٌ
 * قديمٌ مُرحَّلٌ من دفترٍ ورقيّ. تُجمع على الدين وحده ولا تمسّ مخزوناً ولا
 * كلفةً ولا ربحاً — ولذلك هي صفٌّ مستقلّ لا فاتورةُ شراءٍ وهميّة.
 *
 * والمبلغُ وحده إلزاميّ: التاريخُ يفترض اليوم، والسببُ والملاحظةُ اختياريان.
 * لأن المطالبةَ تُقيَّد لحظةَ سماعِها بالهاتف، ولو اشترطنا سبباً مكتوباً
 * لَتُركت غيرَ مقيَّدةٍ أصلاً — وهذا أسوأُ من سببٍ ناقص.
 * ==========================================================================*/

export const chargeOutstanding = (c: CompanyCharge) => (c.settled_at ? 0 : c.amount);

export function CompanyChargesBlock({ companyId, charges, canEdit, onChanged }: {
  companyId: string;
  charges: CompanyCharge[];
  canEdit: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [chargedAt, setChargedAt] = useState(() => localISO());
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const outstanding = useMemo(() => charges.reduce((s, c) => s + chargeOutstanding(c), 0), [charges]);

  const submit = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      playWarning();
      toast.error(t("purchase.charge.needAmount", "أدخل مبلغاً صحيحاً"));
      return;
    }
    setBusy(true);
    try {
      await withTimeout(repo.addCompanyCharge({
        company_id: companyId,
        amount: amt,
        reason: reason.trim() || null,
        note: note.trim() || null,
        charged_at: chargedAt || null,
      }), 12000);
      await onChanged();
      setAmount(""); setReason(""); setNote(""); setChargedAt(localISO());
      setOpen(false);
      playSuccess();
      toast.success(t("purchase.charge.added", "انضافت المطالبة"));
    } catch (e) {
      playWarning();
      toast.error(t("purchase.charge.saveFail", "تعذّرت إضافة المطالبة"), describeDbError(e, t));
    } finally { setBusy(false); }
  };

  const toggleSettled = async (c: CompanyCharge) => {
    playTap();
    try {
      await withTimeout(repo.setCompanyChargeSettled(c.id, !c.settled_at), 12000);
      await onChanged();
    } catch (e) {
      toast.error(t("purchase.charge.saveFail", "تعذّرت إضافة المطالبة"), describeDbError(e, t));
    }
  };

  // حذفٌ بخطوتين: الضغطةُ الأولى تُسلّح الصفَّ والثانية تنفّذ — لا محوَ سطرٍ
  // بضغطةٍ واحدة، ولا تأكيدَ بنافذة متصفّحٍ تُقبل بلا قراءة.
  const onDelete = (id: string) => {
    if (confirmDel !== id) { playTap(); setConfirmDel(id); return; }
    setConfirmDel(null);
    void (async () => {
      try {
        await withTimeout(repo.deleteCompanyCharge(id), 12000);
        await onChanged();
      } catch (e) {
        toast.error(t("purchase.charge.delFail", "تعذّر الحذف"), describeDbError(e, t));
      }
    })();
  };

  return (
    <div className="mt-2.5 rounded-xl border border-warn-200 bg-warn-50/40 p-3 dark:border-warn-500/25 dark:bg-warn-500/10">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-warn-100 text-warn-700 dark:bg-warn-500/20 dark:text-warn-300">
          <HandCoins size={14} />
        </span>
        <p className="flex-1 text-xs font-extrabold text-ink">
          {t("purchase.charge.title", "مطالبات بلا فاتورة")}
          {outstanding > 0 && (
            <span className="ms-1.5 font-bold tabular-nums text-warn-700 dark:text-warn-300">{money(outstanding)}</span>
          )}
        </p>
        {canEdit && (
          <Button size="sm" variant="secondary" leftIcon={<Plus size={14} />}
            onClick={() => { playTap(); setOpen((v) => !v); }}>
            {t("purchase.charge.add", "أضف مطالبة")}
          </Button>
        )}
      </div>

      {open && canEdit && (
        <div className="mt-2.5 rounded-xl bg-surface-1 p-3">
          <div className="grid gap-2.5 sm:grid-cols-[120px,1fr,140px]">
            <div>
              <label className="label">{t("purchase.charge.amount", "المبلغ")}</label>
              <input type="number" min="0" step="1" inputMode="numeric" className="input" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} placeholder="0" autoFocus />
            </div>
            <div>
              <label className="label">{t("purchase.charge.reason", "السبب")}</label>
              <input className="input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
                placeholder={t("purchase.charge.reasonPlaceholder", "مثال: أجرة نقل، فرق سعر، تالف…")} />
            </div>
            <div>
              <label className="label">{t("purchase.charge.date", "التاريخ")}</label>
              <input type="date" className="input" value={chargedAt} onChange={(e) => setChargedAt(e.target.value)} />
            </div>
          </div>
          <div className="mt-2.5">
            <label className="label">{t("purchase.charge.note", "ملاحظة")}</label>
            <input className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={t("purchase.charge.optional", "اختياري")} />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={submit} loading={busy} leftIcon={<Plus size={15} />}>
              {t("purchase.charge.save", "تسجيل المطالبة")}
            </Button>
            <span className="text-2xs text-ink-subtle">
              {t("purchase.charge.hint", "تنضاف على دين الشركة فقط — ما تدخل مخزون ولا تحسب كلفة.")}
            </span>
          </div>
        </div>
      )}

      {charges.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {charges.map((c) => (
            <li key={c.id} className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl bg-surface-1 px-3 py-2",
              c.settled_at && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 text-xs font-bold text-ink">
                  <span className="flex items-center gap-1 font-normal text-ink-subtle">
                    <CalendarClock size={10} /> {formatDate(c.charged_at, i18n.language)}
                  </span>
                  {c.reason && <span>{c.reason}</span>}
                  {c.settled_at && (
                    <span className="chip bg-success-100 text-2xs text-success-700 dark:bg-success-500/20 dark:text-success-300">
                      {t("purchase.charge.settled", "مُسوّاة")}
                    </span>
                  )}
                </p>
                {c.note && <p className="truncate text-2xs text-ink-subtle">{c.note}</p>}
              </div>
              <span className={cn("shrink-0 text-sm font-extrabold tabular-nums",
                c.settled_at ? "text-ink-subtle line-through" : "text-warn-700 dark:text-warn-300")}>
                {money(c.amount)}
              </span>
              {canEdit && (
                <>
                  <button onClick={() => void toggleSettled(c)}
                    aria-label={c.settled_at ? t("purchase.charge.unsettle", "فكّ التسوية") : t("purchase.charge.settle", "تسوية")}
                    title={c.settled_at ? t("purchase.charge.unsettle", "فكّ التسوية") : t("purchase.charge.settle", "تسوية")}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-success-50 hover:text-success-600">
                    {c.settled_at ? <RotateCcw size={14} /> : <Check size={14} />}
                  </button>
                  {confirmDel === c.id ? (
                    <button onClick={() => onDelete(c.id)} onBlur={() => setConfirmDel(null)}
                      className="shrink-0 rounded-full bg-danger-600 px-2.5 py-1 text-2xs font-bold text-white transition hover:bg-danger-700">
                      {t("purchase.charge.confirmDel", "تأكيد الحذف؟")}
                    </button>
                  ) : (
                    <button onClick={() => onDelete(c.id)} aria-label={t("purchase.charge.delete", "حذف")}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600">
                      <Trash2 size={14} />
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
