/**
 * Product edits that write only what the user changed (service-consumables design §7.1, hole M7).
 *
 * The product form and the group editor used to send `stock` and `purchase_price` on every save.
 * A form opened before a sale and saved after it to fix a name wrote the opening stock back
 * (phantom goods); one opened before a purchase wrote the old cost back over the new one (the cost
 * that materials are valued at while no average is known); and the `>= 0` guard turned an untouched
 * negative balance into 0. Three silent rewrites, none of them asked for.
 *
 * So each of the two is sent only when its field holds something else than it was filled with, and
 * each one sent is guarded by compare-and-swap on the value the user saw (`updateProduct`'s
 * `expect`, as the sell price has been since 0226). A refused swap is said for what really moved
 * (`updateAsSeen`). Pure and string-free, so `scripts/inventory-cas-test.mjs` tests it by behaviour.
 *
 * Imported by `src/pages/Inventory.tsx` alone, so the build inlines it into that lazy route chunk and
 * main does not grow. A second static importer would split it into a shared chunk of the routes'
 * static closure, which main's `__vite__mapDeps` lists: measure with `store-weight-guard` before adding one.
 */
import type { Product } from "@/types";

/** Columns `updateProduct` can guard: the row is written only while each still equals what was seen. */
export type CasKey = "sell_price" | "sub_unit_price" | "stock" | "purchase_price";
export type CasExpect = Partial<Record<CasKey, number | null>>;

/** What one row's stock and cost fields were filled with, and what the user left in them. */
export interface StockCostSeen {
  /** The number in the stock field, before the `>= 0` guard; null when the stock is not the user's
   *  to set (pooled: the field is hidden, and folding into the pool goes through its own call). */
  stockTyped: number | null;
  /** The stock the field was filled with: what an edit is measured against, and the swap's guard. */
  stockWas: number;
  /** The cost the price field was filled with (a group's shared field is filled from the opened product). */
  costShown: number | null;
  /** This row's own cost as last read: the swap's guard. */
  costWas: number | null;
}

/** The stock field holds another quantity than it was filled with, at the column's 3 dp. Measured
 *  before the `>= 0` guard, so an untouched negative balance never reads as an edit. */
export function stockEdited(typed: number, was: number | null | undefined): boolean {
  return Math.round(typed * 1000) !== Math.round((Number(was) || 0) * 1000);
}

/** Keeps `stock` / `purchase_price` in `patch` only when the user changed them, and guards each one
 *  kept by the value the user saw. Every other key, and the incoming `expect`, pass through as they are. */
export function stockCostPatch(patch: Partial<Product>, seen: StockCostSeen, expect: CasExpect = {}): { patch: Partial<Product>; expect: CasExpect } {
  const { stock, purchase_price, ...rest } = patch;
  const out: Partial<Product> = rest;
  const guard: CasExpect = { ...expect };
  if (stock !== undefined && seen.stockTyped != null && stockEdited(seen.stockTyped, seen.stockWas)) {
    out.stock = stock;
    guard.stock = seen.stockWas;
  }
  if (purchase_price !== undefined && purchase_price !== (Number(seen.costShown) || 0)) {
    out.purchase_price = purchase_price;
    guard.purchase_price = seen.costWas;
  }
  return { patch: out, expect: guard };
}

const PRICE_KEYS: readonly CasKey[] = ["sell_price", "sub_unit_price", "purchase_price"];
/** PostgREST may send numeric as text; null stays null. */
const num = (v: unknown): number | null => (v == null ? null : Number(v));

/** After a refused swap, which guarded value really moved: a guarded price ("price"), only the stock
 *  ("stock"), or nothing that can still be seen (null: the row is gone, or it moved back). A price
 *  that was not sent is not asked about: it did not refuse this write. */
export function casMoved(expect: CasExpect, fresh: Partial<Record<CasKey, unknown>> | null | undefined): "price" | "stock" | null {
  if (!fresh) return null;
  const moved = (k: CasKey) => k in expect && num(fresh[k]) !== num(expect[k]);
  if (PRICE_KEYS.some(moved)) return "price";
  return moved("stock") ? "stock" : null;
}

/** The two repo calls `updateAsSeen` needs, passed in so the rule is tested without a server. */
export interface ProductIO<T> {
  update: (id: string, patch: Partial<Product>, expect: CasExpect) => Promise<T>;
  reread: (id: string) => Promise<Partial<Record<CasKey, unknown>> | null | undefined>;
}

const isPriceMoved = (e: unknown): boolean => {
  const x = e as { code?: string; message?: string } | null;
  return x?.code === "price_moved" || x?.message === "price_moved";
};

/**
 * `updateProduct` under compare-and-swap, with a refusal said for what moved. The server answers
 * `price_moved` for ANY guarded key, but a sale made while the form was open moves only the stock,
 * and "the price changed" would then be false. So the row is read again:
 *  - a guarded price moved: the original `price_moved` (its message asks to reopen and check);
 *  - otherwise (only the stock, the row gone, or the read failed): `no_row_updated`, whose message
 *    ("...deleted/changed on another device. Refresh and try again") is true in every one of them.
 * Any other failure is thrown as it came.
 */
export async function updateAsSeen<T>(io: ProductIO<T>, id: string, patch: Partial<Product>, expect: CasExpect): Promise<T> {
  try {
    return await io.update(id, patch, expect);
  } catch (e) {
    if (!isPriceMoved(e)) throw e;
    let fresh: Partial<Record<CasKey, unknown>> | null | undefined;
    try { fresh = await io.reread(id); } catch { fresh = undefined; }
    if (casMoved(expect, fresh) === "price") throw e;
    throw Object.assign(new Error("no_row_updated"), { code: "no_row_updated" });
  }
}
