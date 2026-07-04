import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Gift, MessageCircle } from "lucide-react";
import type { Pet } from "@/types";
import { PetAvatar } from "@/components/PetAvatar";
import { cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { getDialCode, getClinicName } from "@/lib/settings";
import { waNumber } from "@/lib/phone";

interface BirthdayEntry { pet: Pet; inDays: number; turningAge: number }

/** Pets whose birthday (month + day of their DOB) falls within the next `windowDays`. */
function upcomingBirthdays(pets: Pet[], windowDays = 7): BirthdayEntry[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out: BirthdayEntry[] = [];
  for (const p of pets) {
    if (!p.dob || p.deceased) continue; // never greet a deceased pet
    const birth = new Date(p.dob);
    if (Number.isNaN(birth.getTime())) continue;
    // The next occurrence of this month/day, this year or next.
    let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
    next.setHours(0, 0, 0, 0);
    if (next.getTime() < today.getTime()) next = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate());
    const inDays = Math.round((next.getTime() - today.getTime()) / 86400000);
    if (inDays >= 0 && inDays < windowDays) {
      out.push({ pet: p, inDays, turningAge: next.getFullYear() - birth.getFullYear() });
    }
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

/** Dashboard CRM widget — upcoming pet birthdays this week with a one-tap WhatsApp greeting. */
export function BirthdaysWidget({ pets }: { pets: Pet[] }) {
  const { t } = useTranslation();
  const list = useMemo(() => upcomingBirthdays(pets), [pets]);

  const whenLabel = (inDays: number) =>
    inDays === 0 ? t("dash.birthdays.today", "Today")
      : inDays === 1 ? t("dash.birthdays.tomorrow", "Tomorrow")
        : t("dash.birthdays.inDays", { n: inDays, defaultValue: "in {{n}} days" });

  // Open WhatsApp with a pre-filled Arabic greeting. Build the international
  // number via the clinic dial code (same helper as Campaigns) so a nationally
  // stored number like 07xx… becomes a valid 9647xx… link.
  const greet = (pet: Pet) => {
    playTap();
    if (!(pet.owner_phone ?? "").trim()) return;
    const num = waNumber(pet.owner_phone ?? "", getDialCode());
    if (!num) return;
    const clinic = getClinicName() || t("app.name", "doctorVet");
    const msg = t("dash.birthdays.greeting", { name: pet.name, clinic, defaultValue: "Happy birthday {{name}}! 🐾🎉" });
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center gap-2.5 bg-gradient-to-br from-accent-500/15 to-brand-500/10 px-4 py-3.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-500 text-white shadow-soft"><Gift size={17} /></span>
        <h3 className="font-display font-bold text-ink">{t("dash.birthdays.title", "Upcoming birthdays")}</h3>
        {list.length > 0 && <span className="chip ms-auto bg-accent-50 text-2xs font-bold text-accent-700 dark:bg-accent-500/15 dark:text-accent-300">{list.length}</span>}
      </div>

      {list.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-subtle">{t("dash.birthdays.empty", "No birthdays this week.")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map(({ pet, inDays, turningAge }) => {
            const hasPhone = !!(pet.owner_phone ?? "").replace(/\D/g, "");
            return (
              <li key={pet.id} className="flex items-center gap-3 px-4 py-2.5">
                <PetAvatar pet={pet} size={38} photoFallback />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                    {pet.name}
                    <span className="chip shrink-0 bg-brand-50 text-2xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{t("dash.birthdays.turning", { n: turningAge, defaultValue: "turning {{n}}" })}</span>
                  </p>
                  <p className="truncate text-xs text-ink-muted">{pet.owner_name || "—"} · {whenLabel(inDays)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => greet(pet)}
                  disabled={!hasPhone}
                  aria-label={t("dash.birthdays.whatsapp", "Send WhatsApp greeting")}
                  title={t("dash.birthdays.whatsapp", "Send WhatsApp greeting")}
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full transition",
                    hasPhone ? "bg-success-50 text-success-600 hover:bg-success-100 dark:bg-success-500/15 dark:text-success-300" : "cursor-not-allowed bg-surface-2 text-ink-subtle opacity-50",
                  )}
                >
                  <MessageCircle size={17} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
