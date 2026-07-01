// Credit / debt (نظام الديون والآجل) helpers — the single source of truth for how much
// of a sale has been paid, how much is still owed, and its settlement status. Kept in one
// module so the till, the debts ledger, the invoices panel and analytics all agree.
import type { Invoice, PaymentStatus } from "@/types";

/** Round to 2 decimals, absorbing binary-float drift (0.1 + 0.2 → 0.3, not 0.30000000000000004). */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Money tolerance — differences under this are treated as exactly settled (float-safe). */
const EPS = 0.01;

/** Amount received so far. Legacy invoices (no amount_paid) predate credit sales → fully paid. */
export const paidOf = (inv: Invoice): number => (inv.amount_paid != null ? inv.amount_paid : inv.total);

/** Outstanding balance still owed by the client (never negative). */
export const dueOf = (inv: Invoice): number => Math.max(0, round2(inv.total - paidOf(inv)));

/** Settlement status derived from what has been paid against the total. */
export const paymentStatusOf = (inv: Invoice): PaymentStatus => {
  const paid = paidOf(inv);
  if (paid >= inv.total - EPS) return "paid";
  if (paid <= EPS) return "unpaid";
  return "partial";
};

/** A sale is a live debt when it isn't refunded and still has a balance due. */
export const isDebt = (inv: Invoice): boolean => (inv.status ?? "paid") !== "refunded" && dueOf(inv) > EPS;
