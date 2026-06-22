import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MessageCircle, Send, Check, Search, Users, Gift, Syringe, Tag, CheckCircle2,
} from "lucide-react";
import type { Pet, Species } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { PetAvatar } from "@/components/PetAvatar";
import { useToast, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getDialCode } from "@/lib/settings";
import { nationalNumber, phoneDigits } from "@/lib/phone";
import { playTap } from "@/lib/sounds";

const VAR_OWNER = "{{اسم_المالك}}";
const VAR_PET = "{{اسم_الحيوان}}";

type SpeciesFilter = "all" | "cat" | "dog";

/** Build the international wa.me number (digits only): dial code + national number. */
function waNumber(phone: string, dialCode: string): string {
  const cc = phoneDigits(dialCode);
  const nat = nationalNumber(phone, dialCode);
  return `${cc}${nat}`;
}

/** Substitute the template variables with this client's data. */
function renderMessage(template: string, ownerName: string, petName: string): string {
  return template.split(VAR_OWNER).join(ownerName || "").split(VAR_PET).join(petName || "");
}

export function WhatsAppCampaigns() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const dial = getDialCode();
  const taRef = useRef<HTMLTextAreaElement>(null);

  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<SpeciesFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    repo.listAllPets(user?.clinic_id ?? user?.id)
      .then((p) => { if (alive) setPets(p); })
      .catch(() => { /* surface nothing — empty state covers it */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user?.clinic_id, user?.id]);

  // Default, ready-to-use Arabic templates.
  const templates = useMemo(() => [
    { id: "birthday", icon: Gift, label: t("campaigns.tplBirthday", "Birthday greeting"), text: t("campaigns.msgBirthday", `Hello ${VAR_OWNER}! 🎉`) },
    { id: "vaccine", icon: Syringe, label: t("campaigns.tplVaccine", "Vaccination reminder"), text: t("campaigns.msgVaccine", `Hello ${VAR_OWNER}`) },
    { id: "offer", icon: Tag, label: t("campaigns.tplOffer", "General offer"), text: t("campaigns.msgOffer", `Hello ${VAR_OWNER}`) },
  ], [t]);

  // One row per pet (so {{اسم_الحيوان}} is meaningful); filtered by species + search.
  const rows = useMemo(() => {
    const ql = query.trim().toLowerCase();
    return pets.filter((p) => {
      const matchesSpecies = filter === "all" || p.species === (filter as Species);
      if (!matchesSpecies) return false;
      if (!ql) return true;
      return p.name.toLowerCase().includes(ql)
        || (p.owner_name ?? "").toLowerCase().includes(ql)
        || phoneDigits(p.owner_phone ?? "").includes(phoneDigits(ql));
    });
  }, [pets, filter, query]);

  const selectedRows = useMemo(() => pets.filter((p) => selected.has(p.id)), [pets, selected]);
  const allFilteredSelected = rows.length > 0 && rows.every((p) => selected.has(p.id));

  const toggle = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    setSelected((s) => {
      const n = new Set(s);
      if (allFilteredSelected) rows.forEach((p) => n.delete(p.id));
      else rows.forEach((p) => n.add(p.id));
      return n;
    });
  };

  // Insert a variable token at the textarea caret (or append).
  const insertVar = (token: string) => {
    const ta = taRef.current;
    playTap();
    if (!ta) { setMessage((m) => m + token); return; }
    const start = ta.selectionStart ?? message.length;
    const end = ta.selectionEnd ?? message.length;
    const next = message.slice(0, start) + token + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      ta.focus();
      const caret = start + token.length;
      ta.setSelectionRange(caret, caret);
    });
  };

  const sendTo = (pet: Pet) => {
    const phone = (pet.owner_phone ?? "").trim();
    if (!phone) { toast.error(t("campaigns.noPhone", "No number")); return; }
    if (!message.trim()) { toast.error(t("campaigns.noTemplate", "Write the message first.")); return; }
    const text = renderMessage(message, pet.owner_name ?? "", pet.name);
    const num = waNumber(phone, dial);
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    playTap();
    setSent((s) => new Set(s).add(pet.id));
  };

  const sentCount = selectedRows.filter((p) => sent.has(p.id)).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-success-500 text-white shadow-soft"><MessageCircle size={24} /></span>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">{t("campaigns.title", "WhatsApp Campaigns")}</h1>
          <p className="text-sm text-ink-subtle">{t("campaigns.subtitle", "Reach clients via direct WhatsApp links — no API cost, no ban risk.")}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr,380px] lg:items-start">
        {/* LEFT — template + audience */}
        <div className="space-y-5">
          {/* Template manager */}
          <div className="card p-5">
            <h2 className="mb-1 flex items-center gap-2 font-bold text-ink"><Tag size={18} className="text-brand-600" /> {t("campaigns.templates", "Templates")}</h2>
            <p className="mb-3 text-xs text-ink-subtle">{t("campaigns.templateHint", "Pick a template or write your own. Tap a variable to insert it.")}</p>

            <div className="mb-3 flex flex-wrap gap-2">
              {templates.map((tpl) => {
                const Icon = tpl.icon;
                return (
                  <button key={tpl.id} onClick={() => { playTap(); setMessage(tpl.text); }}
                    className="inline-flex items-center gap-1.5 rounded-2xl border border-line bg-surface-1 px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:border-brand-300 hover:text-brand-600">
                    <Icon size={15} /> {tpl.label}
                  </button>
                );
              })}
            </div>

            {/* Variable badges */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-ink-muted">{t("campaigns.variables", "Variables")}:</span>
              <button onClick={() => insertVar(VAR_OWNER)} className="chip bg-brand-50 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300">{VAR_OWNER}</button>
              <button onClick={() => insertVar(VAR_PET)} className="chip bg-accent-50 text-xs font-semibold text-accent-700 transition hover:bg-accent-100 dark:bg-accent-500/15 dark:text-accent-300">{VAR_PET}</button>
            </div>

            <label className="label">{t("campaigns.messageLabel", "Message text")}</label>
            <textarea
              ref={taRef}
              className="input min-h-[120px] leading-relaxed"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("campaigns.messagePh", "Write your WhatsApp message…")}
            />
          </div>

          {/* Audience selector */}
          <div className="card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-bold text-ink"><Users size={18} className="text-brand-600" /> {t("campaigns.audience", "Audience")}</h2>
              <span className="chip bg-surface-2 text-2xs font-bold text-ink-muted">{selected.size} {t("campaigns.selectedShort", "selected")}</span>
            </div>

            {/* Filters + search */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {([["all", t("campaigns.all", "All")], ["cat", t("campaigns.cats", "Cats only")], ["dog", t("campaigns.dogs", "Dogs only")]] as const).map(([id, label]) => (
                <button key={id} onClick={() => { playTap(); setFilter(id); }}
                  className={cn("rounded-full px-3 py-1.5 text-xs font-semibold transition", filter === id ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                  {label}
                </button>
              ))}
              <div className="relative ms-auto min-w-[160px] flex-1 sm:flex-none">
                <Search size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
                <input className="input h-9 py-0 ltr:pl-9 rtl:pr-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("campaigns.searchPh", "Search by name or phone…")} />
              </div>
            </div>

            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-subtle">{pets.length === 0 ? t("campaigns.noClients", "No clients yet.") : t("campaigns.noMatch", "No matching results.")}</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-line">
                {/* Select-all header */}
                <label className="flex items-center gap-3 border-b border-line bg-surface-2 px-3 py-2.5 text-sm font-semibold text-ink-muted">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={allFilteredSelected} onChange={toggleAll} />
                  {t("campaigns.selectAll", "Select all")} <span className="text-2xs font-normal text-ink-subtle">· {rows.length}</span>
                </label>
                <div className="max-h-[340px] overflow-y-auto divide-y divide-line [scrollbar-width:thin]">
                  {rows.map((p) => {
                    const checked = selected.has(p.id);
                    const hasPhone = !!(p.owner_phone ?? "").trim();
                    return (
                      <label key={p.id} className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 transition hover:bg-surface-2", checked && "bg-brand-50/40 dark:bg-brand-500/10")}>
                        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={checked} onChange={() => toggle(p.id)} />
                        <PetAvatar pet={p} size={34} photoFallback />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                            {p.name}
                            <span className="chip shrink-0 bg-surface-2 text-2xs font-medium text-ink-muted">{t(`pet.species.${p.species}`)}</span>
                          </p>
                          <p className="truncate text-xs text-ink-muted">{p.owner_name || "—"}{hasPhone ? <span dir="ltr"> · {p.owner_phone}</span> : <span className="text-danger-500"> · {t("campaigns.noPhone", "No number")}</span>}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — execution queue */}
        <div className="card flex max-h-[80vh] flex-col p-0 lg:sticky lg:top-4">
          <div className="flex items-center justify-between gap-2 border-b border-line bg-gradient-to-br from-success-500/15 to-brand-500/10 px-4 py-3.5">
            <h2 className="flex items-center gap-2 font-bold text-ink"><Send size={17} className="text-success-600" /> {t("campaigns.queue", "Send queue")}</h2>
            {selectedRows.length > 0 && (
              <span className="chip bg-surface-1 text-2xs font-bold text-ink-muted tabular-nums">{sentCount} / {selectedRows.length}</span>
            )}
          </div>

          {selectedRows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-subtle">{t("campaigns.queueEmpty", "Select clients from the list to build the send queue.")}</p>
          ) : (
            <div className="flex-1 overflow-y-auto p-2 [scrollbar-width:thin]">
              <ul className="space-y-1.5">
                {selectedRows.map((p) => {
                  const isSent = sent.has(p.id);
                  const hasPhone = !!(p.owner_phone ?? "").trim();
                  return (
                    <li key={p.id} className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface-1 p-2.5">
                      <PetAvatar pet={p} size={34} photoFallback />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{p.owner_name || "—"}</p>
                        <p className="truncate text-xs text-ink-muted">{p.name}{hasPhone ? <span dir="ltr"> · {p.owner_phone}</span> : ""}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => sendTo(p)}
                        disabled={!hasPhone}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                          !hasPhone ? "cursor-not-allowed bg-surface-2 text-ink-subtle opacity-50"
                            : isSent ? "bg-surface-2 text-ink-muted"
                              : "bg-success-600 text-white hover:bg-success-700 shadow-soft",
                        )}
                      >
                        {isSent ? <Check size={14} /> : <MessageCircle size={14} />}
                        {isSent ? t("campaigns.sent", "Sent") : t("campaigns.send", "Send via WhatsApp")}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {selectedRows.length > 0 && sentCount === selectedRows.length && (
            <div className="flex items-center justify-center gap-1.5 border-t border-line px-4 py-3 text-sm font-semibold text-success-600">
              <CheckCircle2 size={16} /> {t("campaigns.allSent", "All messages sent 🎉")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
