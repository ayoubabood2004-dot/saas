import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { User, Phone, Mail, MapPin, Copy, Check, Pencil } from "lucide-react";
import type { Pet } from "@/types";
import { repo } from "@/lib/repo";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import { PhoneInput } from "@/components/PhoneInput";
import { GovernorateAreaPicker } from "@/components/GovernorateAreaPicker";

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
export function OwnerCard({ pet, canEdit = false, onUpdated, bare = false }: { pet: Pet; canEdit?: boolean; onUpdated?: () => void; /** Render without the card chrome (for embedding in a shared banner). */ bare?: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  // The single field/button currently flashing its "Copied!" state, or null.
  const [copiedKey, setCopiedKey] = useState<CopyKey | null>(null);
  const [editing, setEditing] = useState(false);
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
    <div className={bare ? "" : "card p-5"}>
      <h3 className="mb-3 flex items-center gap-2 font-bold text-ink">
        <User size={18} className="text-brand-600" /> {t("owner.title")}
        {canEdit && (
          <button
            type="button" onClick={() => setEditing(true)} title={t("owner.edit", "تعديل")}
            className="ms-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 transition hover:bg-brand-50 dark:hover:bg-brand-500/15"
          >
            <Pencil size={14} /> {t("owner.edit", "تعديل")}
          </button>
        )}
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

      {canEdit && (
        <EditOwnerModal
          pet={pet} open={editing}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onUpdated?.(); }}
        />
      )}
    </div>
  );
}

/** "تعديل بيانات المالك" — prefilled from the pet, persists via repo.updatePet, then the
 *  parent reloads so the card reflects the change instantly (no hard refresh). */
function EditOwnerModal({ pet, open, onClose, onSaved }: { pet: Pet; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gov, setGov] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);

  // Re-seed the form from the current owner each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setName(pet.owner_name ?? ""); setPhone(pet.owner_phone ?? ""); setEmail(pet.owner_email ?? "");
    setGov(pet.owner_governorate ?? ""); setArea(pet.owner_area ?? "");
  }, [open, pet]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await repo.updatePet(pet.id, {
        owner_name: name.trim(),
        owner_phone: phone.trim(),
        owner_email: email.trim(),
        owner_governorate: gov.trim(),
        owner_area: area.trim(),
      });
      toast.success(t("owner.saved", "تم تحديث بيانات المالك"));
      onSaved();
    } catch (e) {
      toast.error(t("owner.saveFail", "تعذّر حفظ التعديلات"), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("owner.editTitle", "تعديل بيانات المالك")}>
      <div className="space-y-3">
        <div>
          <label className="label">{t("owner.name", "المالك")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">{t("owner.phone", "الهاتف")}</label>
          <PhoneInput value={phone} onChange={setPhone} />
        </div>
        <div>
          <label className="label">{t("owner.email", "البريد")}</label>
          <input type="email" dir="ltr" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@email.com" />
        </div>
        <GovernorateAreaPicker governorate={gov} area={area} onChange={(g, a) => { setGov(g); setArea(a); }} />
        <Button className="mt-1 w-full" loading={busy} onClick={save}>{t("common.save", "حفظ")}</Button>
      </div>
    </Modal>
  );
}
