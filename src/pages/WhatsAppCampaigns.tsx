import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  MessageCircle, Send, Check, Search, Users, Gift, Syringe, Tag, CheckCircle2, Bug, Cake, Clock, UserCheck,
} from "lucide-react";
import type { Pet, Species, Vaccination, MedicalVisit, WhatsAppMessage } from "@/types";
import type { CampaignPrefill, ReminderType } from "@/lib/reminders";
import { computeReminderRows } from "@/lib/reminders";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { PetAvatar } from "@/components/PetAvatar";
import { useToast, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getDialCode, getClinicName } from "@/lib/settings";
import { phoneDigits, waNumber } from "@/lib/phone";
import { playTap } from "@/lib/sounds";

const VAR_OWNER = "{{اسم_المالك}}";
const VAR_PET = "{{اسم_الحيوان}}";
// The clinic's own registered name (Settings → clinic name). Fixed per clinic,
// so it's substituted into the template up-front rather than per recipient.
const VAR_CLINIC = "{{اسم_العيادة}}";

type SpeciesFilter = "all" | Species;
/** Smart audience segments (CRM targeting). */
type Segment = "all" | "vaccine" | "deworming" | "birthday" | "inactive";
/** Pets with no medical visit in this many days count as "inactive" (re-engagement). */
const INACTIVE_DAYS = 180;
/** How far ahead a vaccine/deworming/birthday counts as "due" for a segment. */
const SEGMENT_WINDOW_DAYS = 30;

/** Substitute the template variables with this client's data. */
function renderMessage(template: string, ownerName: string, petName: string): string {
  return template.split(VAR_OWNER).join(ownerName || "").split(VAR_PET).join(petName || "");
}

export function WhatsAppCampaigns() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const dial = getDialCode();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const prefillApplied = useRef(false);

  const [pets, setPets] = useState<Pet[]>([]);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [visits, setVisits] = useState<MedicalVisit[]>([]);
  const [waLog, setWaLog] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<SpeciesFilter>("all");
  const [segment, setSegment] = useState<Segment>("all");
  const [oneMsgPerOwner, setOneMsgPerOwner] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await repo.listAllPets(user?.clinic_id ?? user?.id);
        if (!alive) return;
        setPets(p);
        const ids = p.map((x) => x.id);
        // Vaccinations + visits power the smart segments; the log powers "last contacted".
        const [vax, vis, log] = await Promise.all([
          repo.listAllVaccinations(ids),
          repo.listAllVisits(ids),
          repo.listWhatsAppLog(),
        ]);
        if (!alive) return;
        setVaccinations(vax); setVisits(vis); setWaLog(log);
      } catch { /* empty state covers it */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [user?.clinic_id, user?.id]);

  // Smart-segment membership (pet ids), recomputed from the loaded data.
  const segmentSets = useMemo(() => {
    const rows = computeReminderRows(pets, vaccinations, Date.now(), SEGMENT_WINDOW_DAYS);
    const vaccine = new Set<string>(), deworming = new Set<string>(), birthday = new Set<string>();
    for (const r of rows) {
      if (r.type === "vaccine") vaccine.add(r.petId);
      else if (r.type === "deworming") deworming.add(r.petId);
      else if (r.type === "birthday") birthday.add(r.petId);
    }
    const lastVisit = new Map<string, string>();
    for (const v of visits) {
      const cur = lastVisit.get(v.pet_id);
      if (!cur || v.visit_date > cur) lastVisit.set(v.pet_id, v.visit_date);
    }
    const cutoff = new Date(Date.now() - INACTIVE_DAYS * 86400000).toISOString().slice(0, 10);
    const inactive = new Set<string>();
    for (const p of pets) { const lv = lastVisit.get(p.id); if (!lv || lv < cutoff) inactive.add(p.id); }
    return { vaccine, deworming, birthday, inactive };
  }, [pets, vaccinations, visits]);

  // Latest WhatsApp contact per phone number (digits) → "last contacted" badge.
  const lastContacted = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of waLog) {
      const k = phoneDigits(w.owner_phone ?? "");
      if (!k) continue;
      const cur = m.get(k);
      if (!cur || w.sent_at > cur) m.set(k, w.sent_at);
    }
    return m;
  }, [waLog]);

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "short" });

  // Each clinic's own registered name (falls back to the brand if unset), baked
  // into every template so messages read "عيادة <this clinic>" — not "doctorVet".
  const clinicName = getClinicName() || t("app.name", "doctorVet");
  const withClinic = (s: string) => s.split(VAR_CLINIC).join(clinicName);

  // Default, ready-to-use Arabic templates.
  const templates = useMemo(() => [
    { id: "birthday", icon: Gift, label: t("campaigns.tplBirthday", "Birthday greeting"), text: withClinic(t("campaigns.msgBirthday", `Hello ${VAR_OWNER}! 🎉`)) },
    { id: "vaccine", icon: Syringe, label: t("campaigns.tplVaccine", "Vaccination reminder"), text: withClinic(t("campaigns.msgVaccine", `Hello ${VAR_OWNER}`)) },
    { id: "deworming", icon: Bug, label: t("campaigns.tplDeworming", "Deworming reminder"), text: withClinic(t("campaigns.msgDeworming", `Hello ${VAR_OWNER}`)) },
    { id: "offer", icon: Tag, label: t("campaigns.tplOffer", "General offer"), text: withClinic(t("campaigns.msgOffer", `Hello ${VAR_OWNER}`)) },
  ], [t, clinicName]);

  // Map a reminder type (from the dashboard Reminders widget) to its draft template.
  const TEMPLATE_FOR: Record<ReminderType, string> = { birthday: "birthday", vaccine: "vaccine", deworming: "deworming" };

  // Incoming "تجهيز الإرسال" from the Reminders widget: pre-select the client and
  // draft the message, so the doctor can review/edit and send from the queue.
  useEffect(() => {
    const prefill = location.state as CampaignPrefill | null;
    if (!prefill?.targetPetId || prefillApplied.current) return;
    prefillApplied.current = true;
    setSelected(new Set([prefill.targetPetId]));
    const tpl = templates.find((x) => x.id === TEMPLATE_FOR[prefill.reminderType]);
    if (tpl) setMessage(tpl.text);
    // Surface this client in the audience list, then drop the router state so a
    // refresh or back-navigation doesn't silently re-apply it.
    if (prefill.targetPetName) setQuery(prefill.targetPetName);
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // One row per pet (so {{اسم_الحيوان}} is meaningful); filtered by species + segment + search.
  const rows = useMemo(() => {
    const ql = query.trim().toLowerCase();
    return pets.filter((p) => {
      if (filter !== "all" && p.species !== filter) return false;
      if (segment !== "all" && !segmentSets[segment].has(p.id)) return false;
      if (!ql) return true;
      return p.name.toLowerCase().includes(ql)
        || (p.owner_name ?? "").toLowerCase().includes(ql)
        || phoneDigits(p.owner_phone ?? "").includes(phoneDigits(ql));
    });
  }, [pets, filter, segment, query, segmentSets]);

  const selectedRows = useMemo(() => pets.filter((p) => selected.has(p.id)), [pets, selected]);
  const allFilteredSelected = rows.length > 0 && rows.every((p) => selected.has(p.id));

  // The send queue. When "one message per owner" is on, pets sharing a phone (or
  // owner name) collapse into a single entry — so an owner with several pets gets
  // ONE message ({{اسم_الحيوان}} = their pets joined), never a duplicate per pet.
  interface QueueGroup { key: string; ownerName: string; phone: string; pets: Pet[] }
  const queueGroups = useMemo<QueueGroup[]>(() => {
    if (!oneMsgPerOwner) {
      return selectedRows.map((p) => ({ key: p.id, ownerName: p.owner_name ?? "", phone: (p.owner_phone ?? "").trim(), pets: [p] }));
    }
    const map = new Map<string, QueueGroup>();
    for (const p of selectedRows) {
      const phone = (p.owner_phone ?? "").trim();
      const key = phoneDigits(phone) || `name:${(p.owner_name ?? "").trim().toLowerCase()}` || p.id;
      const g = map.get(key) ?? { key, ownerName: p.owner_name ?? "", phone, pets: [] };
      g.pets.push(p);
      map.set(key, g);
    }
    return Array.from(map.values());
  }, [selectedRows, oneMsgPerOwner]);

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

  const sendTo = (group: QueueGroup) => {
    if (!group.phone) { toast.error(t("campaigns.noPhone", "No number")); return; }
    if (!message.trim()) { toast.error(t("campaigns.noTemplate", "Write the message first.")); return; }
    const petNames = group.pets.map((p) => p.name).join(" و "); // Arabic "and"
    const text = renderMessage(message, group.ownerName, petNames);
    const num = waNumber(group.phone, dial);
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    playTap();
    setSent((s) => new Set(s).add(group.key));
    // Record the send (shared history + "last contacted"); fire-and-forget.
    const nowISO = new Date().toISOString();
    void repo.logWhatsApp({
      pet_id: group.pets[0]?.id ?? null,
      owner_name: group.ownerName || null,
      owner_phone: group.phone || null,
      reminder_type: segment === "all" ? "manual" : segment,
    }).catch(() => { /* non-blocking: the message already opened */ });
    setWaLog((prev) => [{ id: `wa-${group.key}-${nowISO}`, owner_phone: group.phone, owner_name: group.ownerName, sent_at: nowISO, reminder_type: segment }, ...prev]);
  };

  const sentCount = queueGroups.filter((g) => sent.has(g.key)).length;

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

            {/* Smart segments (CRM targeting) */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {([
                { id: "all", label: t("campaigns.segAll", "الكل"), icon: Users, count: pets.length },
                { id: "vaccine", label: t("campaigns.segVaccine", "تطعيمات مستحقة"), icon: Syringe, count: segmentSets.vaccine.size },
                { id: "deworming", label: t("campaigns.segDeworming", "ديدان مستحقة"), icon: Bug, count: segmentSets.deworming.size },
                { id: "birthday", label: t("campaigns.segBirthday", "أعياد ميلاد"), icon: Cake, count: segmentSets.birthday.size },
                { id: "inactive", label: t("campaigns.segInactive", "غير نشطين"), icon: Clock, count: segmentSets.inactive.size },
              ] as const).map((s) => {
                const Icon = s.icon;
                const active = segment === s.id;
                return (
                  <button key={s.id} onClick={() => { playTap(); setSegment(s.id); }}
                    className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition", active ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                    <Icon size={13} /> {s.label}
                    <span className={cn("rounded-full px-1.5 text-2xs tabular-nums", active ? "bg-white/20" : "bg-surface-1 text-ink-subtle")}>{s.count}</span>
                  </button>
                );
              })}
            </div>

            {/* Species filter + search */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {(["all", "dog", "cat", "horse", "cow", "bird", "rabbit", "other"] as const).map((s) => (
                <button key={s} onClick={() => { playTap(); setFilter(s); }}
                  className={cn("rounded-full px-2.5 py-1 text-2xs font-semibold transition", filter === s ? "bg-ink text-surface-1" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                  {s === "all" ? t("campaigns.segAll", "الكل") : t(`pet.species.${s}`)}
                </button>
              ))}
              <div className="relative ms-auto min-w-[150px] flex-1 sm:flex-none">
                <Search size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
                <input className="input h-9 py-0 ltr:pl-9 rtl:pr-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("campaigns.searchPh", "Search by name or phone…")} />
              </div>
            </div>

            {/* Dedupe toggle — one message per owner/number */}
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-muted">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={oneMsgPerOwner} onChange={(e) => setOneMsgPerOwner(e.target.checked)} />
              <UserCheck size={14} className="text-brand-600" /> {t("campaigns.oneMsgPerOwner", "رسالة واحدة لكل مالك (دمج الحيوانات)")}
            </label>

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
                    const contactedAt = lastContacted.get(phoneDigits(p.owner_phone ?? ""));
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
                        {contactedAt && (
                          <span className="chip shrink-0 inline-flex items-center gap-1 bg-surface-2 text-2xs font-medium text-ink-subtle" title={t("campaigns.lastContacted", "آخر تواصل")}>
                            <Clock size={11} /> {fmtDate(contactedAt)}
                          </span>
                        )}
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
            {queueGroups.length > 0 && (
              <span className="chip bg-surface-1 text-2xs font-bold text-ink-muted tabular-nums">{sentCount} / {queueGroups.length}</span>
            )}
          </div>

          {queueGroups.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-subtle">{t("campaigns.queueEmpty", "Select clients from the list to build the send queue.")}</p>
          ) : (
            <div className="flex-1 overflow-y-auto p-2 [scrollbar-width:thin]">
              <ul className="space-y-1.5">
                {queueGroups.map((g) => {
                  const isSent = sent.has(g.key);
                  const hasPhone = !!g.phone;
                  const petNames = g.pets.map((p) => p.name).join("، ");
                  return (
                    <li key={g.key} className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface-1 p-2.5">
                      <PetAvatar pet={g.pets[0]} size={34} photoFallback />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {g.ownerName || "—"}
                          {g.pets.length > 1 && <span className="ms-1.5 chip bg-brand-50 text-2xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 tabular-nums">{g.pets.length}</span>}
                        </p>
                        <p className="truncate text-xs text-ink-muted">{petNames}{hasPhone ? <span dir="ltr"> · {g.phone}</span> : ""}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => sendTo(g)}
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

          {queueGroups.length > 0 && sentCount === queueGroups.length && (
            <div className="flex items-center justify-center gap-1.5 border-t border-line px-4 py-3 text-sm font-semibold text-success-600">
              <CheckCircle2 size={16} /> {t("campaigns.allSent", "All messages sent 🎉")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
