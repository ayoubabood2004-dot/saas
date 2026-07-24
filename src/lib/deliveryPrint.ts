// ============================================================================
// Delivery slip (وصل التوصيل) — a compact A5 note the courier carries.
// Shows WHO to deliver to, WHERE, and — big and unmissable — HOW MUCH to
// collect at the door (goods + delivery fee). Self-contained HTML like the
// other print modules; the invoice itself prints separately if needed.
// ============================================================================
import type { DeliveryOrder, Courier } from "@/types";
import { getClinicName, getClinicLogo } from "./settings";
import { money } from "./utils";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildDeliverySlipHTML(order: DeliveryOrder, courier: Courier | null, orderNo: string): string {
  const clinic = getClinicName() || "doctorVet";
  const logo = getClinicLogo();
  const collect = Math.round((order.cod_amount + (order.fee_to_clinic ? 0 : order.delivery_fee)) * 100) / 100;
  const goods = order.fee_to_clinic ? Math.round((order.cod_amount - order.delivery_fee) * 100) / 100 : order.cod_amount;
  const handOver = order.cod_amount; // what the courier must hand back to the clinic
  const rows: string[] = [];
  const row = (k: string, v: string) => rows.push(`<div class="r"><span class="k">${k}</span><span class="v">${v}</span></div>`);
  row("الزبون", esc(order.customer_name || "—"));
  if (order.customer_phone) row("الهاتف", `<bdo dir="ltr">${esc(order.customer_phone)}</bdo>`);
  if (order.address) row("العنوان", esc(order.address));
  if (courier) row("السائق", esc(courier.name) + (courier.phone ? ` — <bdo dir="ltr">${esc(courier.phone)}</bdo>` : ""));
  if (order.note) row("ملاحظة", esc(order.note));

  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>وصل توصيل ${esc(orderNo)}</title>
<style>
  @page { size: A5; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Tahoma, sans-serif; color: #0f172a; padding: 4mm; }
  .head { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; }
  .head img { height: 42px; width: 42px; object-fit: contain; border-radius: 8px; }
  .head .c { font-size: 17px; font-weight: 800; }
  .head .t { font-size: 12px; color: #475569; }
  .no { margin-inline-start: auto; text-align: left; font-size: 12px; color: #475569; }
  .no b { display: block; font-size: 14px; color: #0f172a; }
  .r { display: flex; gap: 8px; padding: 7px 0; border-bottom: 1px dashed #cbd5e1; font-size: 14px; }
  .k { color: #475569; min-width: 64px; font-weight: 700; }
  .v { font-weight: 600; }
  .money { margin-top: 12px; border: 2px solid #0f172a; border-radius: 12px; overflow: hidden; }
  .money .line { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 14px; border-bottom: 1px solid #e2e8f0; }
  .money .total { background: #0f172a; color: #fff; font-size: 20px; font-weight: 800; padding: 12px; display: flex; justify-content: space-between; }
  .hand { margin-top: 8px; font-size: 13px; color: #475569; text-align: center; }
  .foot { margin-top: 14px; display: flex; justify-content: space-between; font-size: 12px; color: #64748b; }
  .sig { margin-top: 18px; display: flex; gap: 24px; }
  .sig div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 12px; color: #475569; text-align: center; }
</style></head><body onload="setTimeout(function(){window.print()},150)">
  <div class="head">
    ${logo ? `<img src="${logo}" alt="">` : ""}
    <div><div class="c">${esc(clinic)}</div><div class="t">وصل توصيل — الدفع عند الاستلام</div></div>
    <div class="no">رقم الطلب<b>${esc(orderNo)}</b></div>
  </div>
  <div style="margin-top:8px">${rows.join("")}</div>
  <div class="money">
    <div class="line"><span>قيمة البضاعة${order.prepaid > 0 ? " (المتبقي)" : ""}</span><span>${money(goods)}</span></div>
    ${order.delivery_fee > 0 ? `<div class="line"><span>أجرة التوصيل</span><span>${money(order.delivery_fee)}</span></div>` : ""}
    <div class="total"><span>المطلوب من الزبون</span><span>${money(collect)}</span></div>
  </div>
  <div class="hand">يُسلِّم السائق للعيادة: <b>${money(handOver)}</b>${order.fee_to_clinic ? " (شامل أجرة التوصيل)" : order.delivery_fee > 0 ? " — الأجرة للسائق" : ""}</div>
  <div class="sig"><div>توقيع الزبون</div><div>توقيع السائق</div></div>
  <div class="foot"><span>${new Date(order.created_at).toLocaleString("ar-IQ")}</span><span>doctorVet</span></div>
</body></html>`;
}

export function openDeliverySlip(order: DeliveryOrder, courier: Courier | null, orderNo: string): boolean {
  const html = buildDeliverySlipHTML(order, courier, orderNo);
  const w = window.open("", "_blank", "width=640,height=760");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
