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

/** One actual money receipt: an amount that physically arrived, at a moment. */
export interface Receipt { amount: number; at: string; method: string | null }

/**
 * The CASH-BASIS view of a sale: when did money actually arrive, and how much.
 * This is what till/receipts reports must sum — a COD order on the road or an
 * open debt contributes NOTHING until it is settled, and a settlement counts on
 * the day it was collected (its leg's `at` stamp), not the sale day.
 *  • refunded sales → no receipts (the money went back);
 *  • payment legs carry their own timestamps; legacy legs without one (paid at
 *    the till when the sale was made) date to the sale itself;
 *  • legacy invoices with no legs at all → one receipt of amount_paid (absent =
 *    fully paid, pre-credit era) dated to the sale.
 */
export function receiptsOf(inv: Invoice): Receipt[] {
  if ((inv.status ?? "paid") === "refunded") return [];
  const legs = inv.payment_details ?? [];
  if (legs.length === 0) {
    const paid = paidOf(inv);
    return paid > EPS ? [{ amount: paid, at: inv.created_at, method: inv.payment_method ?? null }] : [];
  }
  return legs
    .filter((l) => (l.amount ?? 0) > EPS)
    .map((l) => ({ amount: l.amount, at: l.at ?? inv.created_at, method: l.method ?? null }));
}
