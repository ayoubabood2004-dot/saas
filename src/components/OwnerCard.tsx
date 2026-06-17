import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { User, Phone, Mail, MapPin, Copy, Check } from "lucide-react";
import type { Pet } from "@/types";
import { cn } from "@/lib/utils";
import { playCopySuccess, playWarning } from "@/lib/sounds";
import { useToast } from "@/components/ui";

/**
 * Prominent "Owner details" side-card for the Patient Record. Shows the owner's
 * name, phone, optional email and the hierarchical address (Area, Governorate),
 * plus a smart copy-to-clipboard button with audio-visual feedback: the icon
 * flips to a green check + "Copied!" for 2s, and a short sound plays.
 */
export function OwnerCard({ pet }: { pet: Pet }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);

  // Clear the pending "Copied!" reset if the card unmounts mid-window.
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const name = pet.owner_name?.trim();
  const phone = pet.owner_phone?.trim();
  const email = pet.owner_email?.trim();
  const gov = pet.owner_governorate?.trim();
  const area = pet.owner_area?.trim();
  // Address reads smallest → largest unit, e.g. "Al-Adhamiya, Baghdad".
  const address = [area, gov].filter(Boolean).join(", ");

  const hasAny = !!(name || phone || email || address);

  const handleCopy = async () => {
    // Build the formatted block — only the fields we actually have on file.
    const lines = [
      name && `${t("owner.name")}: ${name}`,
      phone && `${t("owner.phone")}: ${phone}`,
      email && `${t("owner.email")}: ${email}`,
      address && `${t("owner.address")}: ${address}`,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      playCopySuccess();
      setCopied(true);
      window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      playWarning();
      toast.error(t("owner.copyFail"));
    }
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
                <div className="min-w-0">
                  <dt className="text-xs text-ink-subtle">{t("owner.name")}</dt>
                  <dd className="truncate font-medium text-ink">{name}</dd>
                </div>
              </div>
            )}
            {phone && (
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand-600"><Phone size={16} /></span>
                <div className="min-w-0">
                  <dt className="text-xs text-ink-subtle">{t("owner.phone")}</dt>
                  <dd className="truncate font-medium text-ink"><a href={`tel:${phone}`} className="hover:text-brand-600" dir="ltr">{phone}</a></dd>
                </div>
              </div>
            )}
            {email && (
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand-600"><Mail size={16} /></span>
                <div className="min-w-0">
                  <dt className="text-xs text-ink-subtle">{t("owner.email")}</dt>
                  <dd className="truncate font-medium text-ink"><a href={`mailto:${email}`} className="hover:text-brand-600" dir="ltr">{email}</a></dd>
                </div>
              </div>
            )}
            {address && (
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand-600"><MapPin size={16} /></span>
                <div className="min-w-0">
                  <dt className="text-xs text-ink-subtle">{t("owner.address")}</dt>
                  <dd className="truncate font-medium text-ink">{address}</dd>
                </div>
              </div>
            )}
          </dl>

          <button
            type="button"
            onClick={handleCopy}
            aria-live="polite"
            className={cn(
              "mt-4 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition-colors",
              copied
                ? "border-success-300 bg-success-50 text-success-700 dark:border-success-500/40 dark:bg-success-500/15 dark:text-success-300"
                : "border-line bg-surface-2 text-ink hover:border-brand-300 hover:text-brand-600",
            )}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? t("owner.copied") : t("owner.copy")}
          </button>
        </>
      ) : (
        <p className="text-sm text-ink-subtle">{t("owner.noInfo")}</p>
      )}
    </div>
  );
}
