import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui";
import { repo } from "@/lib/repo";
import { openInvoicePrint, type PrintFormat } from "@/lib/invoicePrint";
import { getClinicLogo, getClinicSocials } from "@/lib/settings";
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
      try { items = await repo.listInvoiceItems(invoice.id); } catch { items = []; }
    }
    let printNo = (invoice.print_count ?? 0) + 1;
    try { printNo = await repo.bumpInvoicePrints(invoice.id); } catch { /* keep optimistic count */ }

    const socials = getClinicSocials();
    const ok = openInvoicePrint({ ...invoice, print_count: printNo }, items ?? [], {
      clinicName: user?.full_name || "doctorVet",
      clinicPhone: user?.phone ?? null,
      brand: "doctorVet",
      format,
      lang: i18n.language,
      printNo,
      logoUrl: getClinicLogo(),
      facebook: socials.facebook || null,
      instagram: socials.instagram || null,
    });
    if (!ok) toast.error(t("retail.popupBlocked", "Allow pop-ups to print"), t("retail.popupBlockedHint", "Your browser blocked the print window — enable pop-ups for this site."));
    opts?.onCounted?.(printNo);
    return printNo;
  };
}
