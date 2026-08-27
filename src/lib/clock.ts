/* ============================================================================
 * عرض الساعة بصيغة العيادة — ١٢ ساعة (ص/م) أو ٢٤ ساعة.
 *
 * القاعدة الصارمة: التخزين "HH:MM" بساعة ٢٤ دائماً وأبداً — قابل للفرز
 * والمقارنة نصياً، وهو ما تعتمد عليه جدولة الجرعات كلها. الصيغة المختارة
 * بالإعدادات تخصّ **العرض وحده**، فكل شاشة تعرض وقتاً تمرّره من هنا.
 * ==========================================================================*/
import i18n from "@/i18n";
import { getClockFormat } from "./settings";

/** "14:30" → "٢:٣٠ م" بصيغة ١٢، أو "14:30" بصيغة ٢٤. غير الصالح يرجع كما هو. */
export function fmtClock(hhmm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim());
  if (!m) return hhmm ?? "";
  if (getClockFormat() === "24") return `${m[1].padStart(2, "0")}:${m[2]}`;
  let h = Number(m[1]);
  const suffix = h >= 12 ? i18n.t("clock.pm", "م") : i18n.t("clock.am", "ص");
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m[2]} ${suffix}`;
}

/** ساعة كاملة "14:00" → "٢ م" — لرؤوس أعمدة الساعات حيث الدقائق ضجيج. */
export function fmtHour(hhmm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim());
  if (!m) return hhmm ?? "";
  if (getClockFormat() === "24") return `${m[1].padStart(2, "0")}:${m[2]}`;
  let h = Number(m[1]);
  const suffix = h >= 12 ? i18n.t("clock.pm", "م") : i18n.t("clock.am", "ص");
  h = h % 12;
  if (h === 0) h = 12;
  return m[2] === "00" ? `${h} ${suffix}` : `${h}:${m[2]} ${suffix}`;
}
