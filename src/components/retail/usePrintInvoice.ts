import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui";
import { repo } from "@/lib/repo";
import { openInvoicePrint, invoiceNo, type PrintFormat } from "@/lib/invoicePrint";
import { resolveStaffName } from "@/lib/staffNames";
import { getClinicLogo, getClinicSocials, getClinicName } from "@/lib/settings";
import type { Invoice, InvoiceItem } from "@/types";

/**
 * Centralised invoice printing: loads line items if needed, atomically bumps the
 * server-side print counter, then opens a format-tailored print window. Returns
 * the new print number so callers can reflect "prints: N" without a full reload.
 */
export function useInvoicePrinter() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const toast = useToast();

  return async function printInvoice(
    invoice: Invoice,
    format: PrintFormat,
    opts?: { items?: InvoiceItem[]; onCounted?: (n: number) => void },
  ): Promise<number> {
    let items = opts?.items;
    if (!items) {
      /* الطباعةُ تُجهَض ولا تمضي ناقصة: كان الفشل يُبلع إلى `[]` فيخرج إيصالٌ
       * بإجماليٍّ بلا سطور — ورقةٌ بيد الزبون تكذب. ورقةٌ ناقصة أسوأ من لا ورقة. */
      try {
        items = await repo.listInvoiceItems(invoice.id);
      } catch (e) {
        toast.error(t("retail.printItemsFailed", "تعذّر جلب سطور الفاتورة — ما تنطبع ناقصة. أعد المحاولة."), e instanceof Error ? e.message : undefined);
        return invoice.print_count ?? 0;
      }
    }
    let printNo = (invoice.print_count ?? 0) + 1;
    try { printNo = await repo.bumpInvoicePrints(invoice.id); } catch { /* keep optimistic count */ }

    // البائع يُطبع باسمه — يُحل من كاش الكادر؛ فشل الحل ما يمنع الطباعة.
    const sellerName = await resolveStaffName(invoice.staff_id).catch(() => null); /* swallow-ok: اسمُ البائع زينةٌ بالإيصال — لا يمنع الطباعة (بخلاف السطور أعلاه) */
    const socials = getClinicSocials();
    const ok = await openInvoicePrint({ ...invoice, print_count: printNo }, items ?? [], {
      clinicName: getClinicName() || user?.full_name || "doctorVet",
      clinicPhone: user?.phone ?? null,
      brand: "doctorVet",
      format,
      lang: i18n.language,
      printNo,
      logoUrl: getClinicLogo(),
      facebook: socials.facebook || null,
      instagram: socials.instagram || null,
      sellerName,
    });
    if (!ok) toast.error(t("retail.popupBlocked", "Allow pop-ups to print"), t("retail.popupBlockedHint", "Your browser blocked the print window — enable pop-ups for this site."));
    else void repo.logClientEvent("invoice.print", { ref: invoiceNo(invoice.id), format }); // activity trail
    opts?.onCounted?.(printNo);
    return printNo;
  };
}
