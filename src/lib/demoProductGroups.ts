/* ============================================================================
 * مرآةُ المنتجات المربوطة (0277) بالتجريبيّ — دوالُّ الخادم الأربع حرفاً بحرف على مخزن الجهاز: البوّابةُ (المدير والطبيب أو PIN حيّ)،
 * وما رآه الجهاز شرطُ الكتابة (group_changed ثمّ price_moved)، والعملةُ والمخزنُ واحد، والكلُّ أو لا شيء (المخزنُ يُحفظ مرّةً بعد
 * كلّ الفحوص)، ومجموعةٌ بقي منها عضوٌ واحد تنفكّ. كسولةٌ (productGroupsApi يستوردها بـimport()) فلا تدخل حزمةَ الإقلاع.
 * ========================================================================= */
import type { Product } from "@/types";
import { loadDB, saveDB } from "./demoStore";
import { demoApiGate, demoBaseRole, demoHint, demoPinLive } from "./demoRole";
import { currencyOf, groupKeyOf, pricesOf, type GroupSeen } from "./productGroups";
import type { FollowResult, LinkResult, SetPriceResult, UnlinkResult } from "./productGroupsApi";

function gate(): void {
  demoApiGate();
  const r = demoBaseRole();
  if (r !== "manager" && r !== "veterinarian" && !demoPinLive()) {
    throw Object.assign(demoHint("forbidden", "ربط المنتجات وأسعار المجموعة للمدير والطبيب."), { code: "42501" });
  }
}
const round2 = (n: number | null): number | null => (n == null ? null : Math.round(n * 100) / 100);
function priceOk(v: number | null): void {
  if (v != null && (!Number.isFinite(v) || v < 0 || v >= 1e10)) throw demoHint("bad_price", "السعر لازم رقم صفر أو أكثر.");
}
const membersOf = (ps: Product[], key: string): Product[] => ps.filter((p) => groupKeyOf(p.bulk_group) === key);
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** مرآةُ `_pgrp_seen_ok`: الأعضاءُ أنفسُهم، ثمّ كلٌّ بسعرَيه بعملته. */
function seenOk(rows: Product[], seen: GroupSeen | null | undefined): void {
  if (!seen || typeof seen !== "object" || Array.isArray(seen)) throw demoHint("bad_seen", "الشاشة ما أرسلت الأسعار اللي شافتها — حدّث الصفحة وأعد.");
  const a = Object.keys(seen).sort().join(","), b = rows.map((r) => r.id).sort().join(",");
  if (a !== b) throw demoHint("group_changed", "المجموعة تغيّرت من جهاز ثاني (انضاف منتج أو انفصل) — ما انحفظ شي. حدّث القائمة وأعد.");
  for (const r of rows) {
    const s = seen[r.id], x = pricesOf(r);
    if (!s || typeof s !== "object" || num(s.s) !== x.sell || num(s.p) !== x.buy) {
      throw demoHint("price_moved", "سعر منتج بالمجموعة تغيّر من جهاز ثاني (مثلاً رفع أسعار) من فتحت الشاشة — ما انحفظ شي. حدّث القائمة وشوف الأسعار.");
    }
  }
}
function setPrices(p: Product, sell: number | null, buy: number | null): boolean {
  const usd = currencyOf(p) === "USD";
  const x = pricesOf(p);
  const ch = (sell != null && x.sell !== sell) || (buy != null && x.buy !== buy);
  if (usd) { if (sell != null) p.sell_price_usd = sell; if (buy != null) p.purchase_price_usd = buy; }
  else { if (sell != null) p.sell_price = sell; if (buy != null) p.purchase_price = buy; }
  return ch;
}

export function demoGroupLink(ids: string[], group: string | null, sellIn: number, buyIn: number | null, seen: GroupSeen): LinkResult {
  gate();
  const want = [...new Set(ids.filter(Boolean))];
  let key = groupKeyOf(group);
  const isNew = key == null;
  const sell = round2(sellIn), buy = round2(buyIn);
  if (!want.length) throw demoHint("nothing_to_link", "اختر منتج واحد على الأقل.");
  if (want.length > 200) throw demoHint("too_many", "أكثر من ٢٠٠ منتج بربطة وحدة — قسّمها.");
  if (sell == null) throw demoHint("price_required", "اكتب سعر البيع الموحّد للمجموعة.");
  priceOk(sell); priceOk(buy);
  const db = loadDB();
  const ps = db.products ?? [];
  const chosen = want.map((id) => ps.find((p) => p.id === id));
  if (chosen.some((p) => !p)) throw demoHint("product_missing", "منتج من اللي اخترتهم ما عاد موجود (انحذف أو اندمج) — حدّث القائمة.");
  let all: Product[];
  if (isNew) all = chosen as Product[];
  else {
    const cur = membersOf(ps, key as string);
    if (!cur.length) throw demoHint("group_missing", "المجموعة ما عادت موجودة (انفكّت من جهاز ثاني) — حدّث القائمة.");
    all = [...new Map([...cur, ...(chosen as Product[])].map((p) => [p.id, p])).values()];
  }
  if (all.length < 2) throw demoHint("group_needs_two", "الربط يحتاج منتجين على الأقل.");
  if (new Set(all.map(currencyOf)).size > 1) throw demoHint("group_mixed", "منتجات بالدولار ومنتجات بالدينار — سعر واحد ما يصير. اربط كل عملة وحدها.");
  if (new Set(all.map((p) => p.farm_id ?? "-")).size > 1) throw demoHint("group_farm", "مواد مخزن الحقل ما تنربط بمواد العيادة.");
  seenOk(all, seen);
  const old = [...new Set((chosen as Product[]).map((p) => groupKeyOf(p.bulk_group)).filter((g): g is string => g != null && g !== key))];
  if (isNew) key = `grp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const added = (chosen as Product[]).filter((p) => groupKeyOf(p.bulk_group) !== key).length;
  for (const p of all) { p.bulk_group = key; setPrices(p, sell, buy); }
  let dissolved = 0;
  for (const g of old) {
    const left = membersOf(ps, g);
    if (left.length === 1) { left[0].bulk_group = null; dissolved++; }
  }
  saveDB(db);
  return { group: key as string, n: all.length, added, dissolved };
}

export function demoGroupUnlink(group: string, ids: string[]): UnlinkResult {
  gate();
  const key = groupKeyOf(group);
  const want = [...new Set(ids.filter(Boolean))];
  if (!key || !want.length) throw demoHint("nothing_to_unlink", "اختر المنتج اللي تريد تفصله.");
  const db = loadDB();
  const ps = db.products ?? [];
  const ms = membersOf(ps, key);
  if (want.some((id) => !ms.some((m) => m.id === id))) throw demoHint("group_changed", "المجموعة تغيّرت من جهاز ثاني (المنتج انفصل أو انحذف) — حدّث القائمة.");
  for (const m of ms) if (want.includes(m.id)) m.bulk_group = null;
  let left = membersOf(ps, key);
  let dissolved = false;
  if (left.length === 1) { left[0].bulk_group = null; left = []; dissolved = true; }
  saveDB(db);
  return { group: key, unlinked: want.length, left: left.length, dissolved: dissolved || left.length === 0 };
}

export function demoGroupSetPrice(group: string, sellIn: number | null, buyIn: number | null, seen: GroupSeen): SetPriceResult {
  gate();
  const key = groupKeyOf(group);
  const sell = round2(sellIn), buy = round2(buyIn);
  if (!key) throw demoHint("group_missing", "المجموعة ما عادت موجودة — حدّث القائمة.");
  if (sell == null && buy == null) throw demoHint("nothing_to_set", "ما تغيّر سعر.");
  priceOk(sell); priceOk(buy);
  const db = loadDB();
  const ms = membersOf(db.products ?? [], key);
  if (ms.length < 2) throw demoHint("group_missing", "المجموعة ما عادت موجودة (انفكّت أو انحذفت منتجاتها) — حدّث القائمة.");
  if (new Set(ms.map(currencyOf)).size > 1) throw demoHint("group_mixed", "بالمجموعة منتجات بالدولار ومنتجات بالدينار — سعر واحد ما يصير. افصل اللي عملته غير.");
  seenOk(ms, seen);
  let changed = 0;
  for (const m of ms) if (setPrices(m, sell, buy)) changed++;
  saveDB(db);
  return { group: key, n: ms.length, changed };
}

export function demoGroupFollow(productId: string, sell: boolean, buy: boolean): FollowResult {
  gate();
  if (!sell && !buy) throw demoHint("nothing_to_set", "ما تغيّر سعر.");
  const db = loadDB();
  const ps = db.products ?? [];
  const v = ps.find((p) => p.id === productId);
  if (!v) throw demoHint("product_missing", "المادّة ما عادت موجودة — حدّث القائمة.");
  const key = groupKeyOf(v.bulk_group);
  if (!key) return { group: null, n: 0, updated: 0, skipped: 0 };
  const ms = membersOf(ps, key);
  const x = pricesOf(v);
  let updated = 0;
  const usd = currencyOf(v) === "USD";
  for (const m of ms) {
    if (m.id === v.id || currencyOf(m) !== currencyOf(v)) continue;
    // نسخٌ حرفيّ كالخادم: سعرُ المصدر الغائب (دولارٌ بلا شراء) يُنسخ غياباً.
    const y = pricesOf(m);
    if (!((sell && y.sell !== x.sell) || (buy && y.buy !== x.buy))) continue;
    if (usd) { if (sell) m.sell_price_usd = x.sell; if (buy) m.purchase_price_usd = x.buy; }
    else { if (sell) m.sell_price = x.sell ?? 0; if (buy) m.purchase_price = x.buy ?? 0; }
    updated++;
  }
  saveDB(db);
  return { group: key, n: ms.length, updated, skipped: ms.filter((m) => currencyOf(m) !== currencyOf(v)).length };
}
