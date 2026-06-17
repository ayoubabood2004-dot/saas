import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { User, Phone, Mail, MapPin, Copy, Check } from "lucide-react";
import type { Pet } from "@/types";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui";

/** Strict audio feedback for a successful copy — native HTML5 Audio, as specified. */
const playSuccessSound = () => {
  new Audio("/sounds/copy-success.mp3").play().catch((e) => console.warn("Audio play failed", e));
};

/** Which copy button is showing its "Copied ✓" state (only one at a time). */
type CopyKey = "name" | "phone" | "email" | "address" | "all";

/** Small, subtle inline copy button with its own ✓ state. */
function CopyButton({ copied, onClick, label }: { copied: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors",
        copied ? "text-success-600 dark:text-success-400" : "text-ink-subtle hover:bg-surface-2 hover:text-brand-600",
      )}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

/**
 * Prominent "Owner details" side-card for the Patient Record. Shows the owner's
 * name, phone, optional email and the hierarchical address (Area, Governorate).
 * Each field has its own subtle copy button with independent ✓ feedback, plus a
 * "Copy all details" button. Every successful copy plays a short sound.
 */
export function OwnerCard({ pet }: { pet: Pet }) {
  const { t } = useTranslation();
  const toast = useToast();
  // The single field/button currently flashing its "Copied!" state, or null.
  const [copiedKey, setCopiedKey] = useState<CopyKey | null>(null);
  const resetTimer = useRef<number | undefined>(undefined);

  // Clear the pending reset if the card unmounts mid-window.
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const name = pet.owner_name?.trim();
  const phone = pet.owner_phone?.trim();
  const email = pet.owner_email?.trim();
  const gov = pet.owner_governorate?.trim();
  const area = pet.owner_area?.trim();
  // Address reads smallest → largest unit, e.g. "Al-Adhamiya, Baghdad".
  const address = [area, gov].filter(Boolean).join(", ");

  const hasAny = !!(name || phone || email || address);

  // Copy a single value, flash that field's ✓ for 2s, and play the success sound.
  const copy = async (key: CopyKey, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      playSuccessSound();
      setCopiedKey(key);
      window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast.error(t("owner.copyFail"));
    }
  };

  const copyAll = () => {
    const lines = [
      name && `${t("owner.name")}: ${name}`,
      phone && `${t("owner.phone")}: ${phone}`,
      email && `${t("owner.email")}: ${email}`,
      address && `${t("owner.address")}: ${address}`,
    ].filter(Boolean) as string[];
    void copy("all", lines.join("\n"));
  };

  return (
    <div className="card p-5">
      <h3 className="mb-3 flex items-center gap-2 font-bold text-ink">
        <User size={18} className="text-brand-600" /> {t("owner.title")}
      </h3>

      {hasAny ? (
        <>
          <dl className="space-y-2.5">
            {name && (
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand-600"><User size={16} /></span>
                <div className="min-w-0 flex-1">
                  <dt className="text-xs text-ink-subtle">{t("owner.name")}</dt>
                  <dd className="truncate font-medium text-ink">{name}</dd>
                </div>
                <CopyButton copied={copiedKey === "name"} onClick={() => copy("name", name)} label={`${t("owner.copyOne")} — ${t("owner.name")}`} />
              </div>
            )}
            {phone && (
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand-600"><Phone size={16} /></span>
                <div className="min-w-0 flex-1">
                  <dt className="text-xs text-ink-subtle">{t("owner.phone")}</dt>
                  <dd className="truncate font-medium text-ink"><a href={`tel:${phone}`} className="hover:text-brand-600" dir="ltr">{phone}</a></dd>
                </div>
                <CopyButton copied={copiedKey === "phone"} onClick={() => copy("phone", phone)} label={`${t("owner.copyOne")} — ${t("owner.phone")}`} />
              </div>
            )}
            {email && (
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand-600"><Mail size={16} /></span>
                <div className="min-w-0 flex-1">
                  <dt className="text-xs text-ink-subtle">{t("owner.email")}</dt>
                  <dd className="truncate font-medium text-ink"><a href={`mailto:${email}`} className="hover:text-brand-600" dir="ltr">{email}</a></dd>
                </div>
                <CopyButton copied={copiedKey === "email"} onClick={() => copy("email", email)} label={`${t("owner.copyOne")} — ${t("owner.email")}`} />
              </div>
            )}
            {address && (
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand-600"><MapPin size={16} /></span>
                <div className="min-w-0 flex-1">
                  <dt className="text-xs text-ink-subtle">{t("owner.address")}</dt>
                  <dd className="truncate font-medium text-ink">{address}</dd>
                </div>
                <CopyButton copied={copiedKey === "address"} onClick={() => copy("address", address)} label={`${t("owner.copyOne")} — ${t("owner.address")}`} />
              </div>
            )}
          </dl>

          <button
            type="button"
            onClick={copyAll}
            aria-live="polite"
            className={cn(
              "mt-4 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition-colors",
              copiedKey === "all"
                ? "border-success-300 bg-success-50 text-success-700 dark:border-success-500/40 dark:bg-success-500/15 dark:text-success-300"
                : "border-line bg-surface-2 text-ink hover:border-brand-300 hover:text-brand-600",
            )}
          >
            {copiedKey === "all" ? <Check size={16} /> : <Copy size={16} />}
            {copiedKey === "all" ? t("owner.copied") : t("owner.copy")}
          </button>
        </>
      ) : (
        <p className="text-sm text-ink-subtle">{t("owner.noInfo")}</p>
      )}
    </div>
  );
}
