import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ClipboardList, Search, Phone, Mail, Stethoscope, BedDouble, Pill, CalendarDays,
  LogOut as DischargeIcon, Pencil, Plus, Check, Camera, PawPrint, ArrowRightLeft, LogIn, LogOut, Users, ChevronLeft,
  Copy, X, ArrowDownUp, IdCard, Clock, Download, ListChecks, Rows3, AlertTriangle,
} from "lucide-react";
import type { Pet, Admission, TreatmentEntry, Species, Sex } from "@/types";
import { repo } from "@/lib/repo";
import { PetAvatar } from "@/components/PetAvatar";
import { Modal } from "@/components/Modal";
import { PhoneInput } from "@/components/PhoneInput";
import { SpeciesPicker, SexPicker, AgeInput, WeightInput, ColorPicker, BreedPicker } from "@/components/PetFields";
import { Button, Badge, useToast, Skeleton } from "@/components/ui";
import { formatDate, cn } from "@/lib/utils";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { playTap, playSuccess } from "@/lib/sounds";
import { phoneMatches, nationalNumber } from "@/lib/phone";
import { getDialCode } from "@/lib/settings";
import { useAuth } from "@/contexts/AuthContext";

type Tab = "log" | "cases" | "boarding" | "movement";

function daysSince(iso: string): number {
  const d = new Date(iso);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000));
}

const KPI_TONE: Record<string, string> = {
  brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
  accent: "bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
  success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-200",
};

const SPECIES_EMOJI: Record<Species, string> = { dog: "🐶", cat: "🐱", horse: "🐴", cow: "🐄", bird: "🦜", rabbit: "🐰", other: "🐾" };

/** Counts up to a number on mount — a small dashboard delight. */
function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const dur = 650;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / dur);
      setN(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n}</>;
}

type PetStatus = "treatment" | "boarding" | "recent" | null;
function petStatusOf(petId: string, admByPet: Map<string, Admission[]>): PetStatus {
  const adms = admByPet.get(petId) ?? [];
  if (adms.some((a) => a.kind === "treatment" && a.status === "active")) return "treatment";
  if (adms.some((a) => a.kind === "boarding" && a.status === "active")) return "boarding";
  const last = adms.reduce((m, a) => Math.max(m, new Date(a.admitted_on).getTime()), 0);
  if (last && Date.now() - last < 30 * 86400000) return "recent";
  return null;
}

export function ClinicRecords() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("log");
  const [pets, setPets] = useState<Pet[]>([]);
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [treatments, setTreatments] = useState<TreatmentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [allPets, a] = await Promise.all([repo.listAllPets(), repo.listAdmissions()]);
    const p = allPets.filter((pet) => pet.shared_with_clinic !== false);
    setPets(p);
    setAdmissions(a);
    const tx = (await Promise.all(p.map((pet) => repo.listTreatments(pet.id)))).flat();
    setTreatments(tx);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const activeCases = admissions.filter((a) => a.kind === "treatment" && a.status === "active").length;
  const activeBoarding = admissions.filter((a) => a.kind === "boarding" && a.status === "active").length;
  const movements = admissions.reduce((n, a) => n + 1 + (a.discharged_on ? 1 : 0), 0);

  const TABS: { id: Tab; icon: typeof ClipboardList; count: number }[] = [
    { id: "log", icon: ClipboardList, count: pets.length },
    { id: "cases", icon: Stethoscope, count: activeCases },
    { id: "boarding", icon: BedDouble, count: activeBoarding },
    { id: "movement", icon: ArrowRightLeft, count: movements },
  ];

  const kpis = [
    { icon: Users, label: t("records.kpiPatients", "Patients"), value: pets.length, tone: "brand" },
    { icon: Stethoscope, label: t("records.kpiActive", "Active cases"), value: activeCases, tone: "accent" },
    { icon: BedDouble, label: t("records.kpiBoarding", "Boarding"), value: activeBoarding, tone: "sky" },
    { icon: ArrowRightLeft, label: t("records.kpiVisits", "Total visits"), value: admissions.length, tone: "success" },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex items-center gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><ClipboardList size={20} /></span>
        <h1 className="font-display text-xl font-extrabold tracking-tighter2 text-ink">{t("records.title")}</h1>
        <Button className="ms-auto" size="sm" leftIcon={<Plus size={16} />} onClick={() => { playTap(); navigate("/new-case"); }}>
          {t("newCase.newCaseBtn")}
        </Button>
      </div>

      {/* KPI strip */}
      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[68px] rounded-2xl" />)
          : kpis.map((k) => {
              const Icon = k.icon;
              return (
                <motion.div key={k.label} variants={staggerItem} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-1 p-3 shadow-card">
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", KPI_TONE[k.tone])}><Icon size={18} /></span>
                  <div className="min-w-0">
                    <p className="font-display text-xl font-extrabold leading-none text-ink"><CountUp value={k.value} /></p>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">{k.label}</p>
                  </div>
                </motion.div>
              );
            })}
      </motion.div>

      {/* Tabs */}
      <div className="mb-5 flex max-w-2xl gap-1 overflow-x-auto rounded-2xl bg-surface-2 p-1">
        {TABS.map(({ id, icon: Icon, count }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => { playTap(); setTab(id); }}
              className={cn(
                "relative flex min-w-fit flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                active ? "text-brand-700 dark:text-brand-300" : "text-ink-muted hover:text-ink",
              )}
            >
              {active && <motion.span layoutId="records-tab" className="absolute inset-0 rounded-xl bg-surface-1 shadow-card" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon size={16} /> {t(`records.tabs.${id}`)}
                {count > 0 && <span className={cn("rounded-full px-1.5 text-2xs font-bold", active ? "bg-brand-100 text-brand-700 dark:bg-brand-500/25 dark:text-brand-200" : "bg-surface-3 text-ink-subtle")}>{count}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
          {tab === "log" && <PatientLog pets={pets} admissions={admissions} onChanged={load} loading={loading} />}
          {tab === "cases" && <CurrentCases pets={pets} admissions={admissions} treatments={treatments} onChanged={load} />}
          {tab === "boarding" && <Boarding pets={pets} admissions={admissions} onChanged={load} />}
          {tab === "movement" && <MovementLog pets={pets} admissions={admissions} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Patient log / registry ---------------- */
function PatientLog({ pets, admissions, onChanged, loading }: { pets: Pet[]; admissions: Admission[]; onChanged: () => void; loading: boolean }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [month, setMonth] = useState("all");
  const [species, setSpecies] = useState<"all" | Species>("all");
  const [sort, setSort] = useState<"recent" | "name" | "visits">("recent");
  const [segment, setSegment] = useState<"all" | "treatment" | "boarding" | "allergy">("all");
  const [dense, setDense] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(20);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; phone: string; email: string; petIds: string[] } | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  // Reassign / "move pet to a specific owner" flow.
  const [reassign, setReassign] = useState<Pet | null>(null);
  const [rq, setRq] = useState("");
  const [rNew, setRNew] = useState({ name: "", phone: "", email: "" });

  // Press "/" anywhere to jump to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (e.key === "/" && tag !== "input" && tag !== "textarea") { e.preventDefault(); searchRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const copyPhone = async (phone: string) => {
    if (!phone) return;
    try { await navigator.clipboard.writeText(phone); toast.success(t("records.copied", "Phone number copied")); playTap(); } catch { /* ignore */ }
  };

  const [addOwner, setAddOwner] = useState<{ id: string; name: string; phone: string; email: string } | null>(null);
  const [an, setAn] = useState({ name: "", species: "dog" as Species, breed: "", sex: "unknown" as Sex, dob: "", weight: "", color: "", allergies: "", photo: null as string | null });

  const resetAnimal = () => setAn({ name: "", species: "dog", breed: "", sex: "unknown", dob: "", weight: "", color: "", allergies: "", photo: null });
  const setA = (patch: Partial<typeof an>) => setAn((s) => ({ ...s, ...patch }));

  const saveAnimal = async () => {
    if (!addOwner || !an.name.trim()) return;
    try {
      await repo.createPet({
        // The owner card is identified by phone, not by this id — stamp the signed-in
        // staff member's id so the row satisfies the database's ownership rule.
        owner_id: user?.id ?? addOwner.id,
        owner_name: addOwner.name === "—" ? undefined : addOwner.name,
        owner_phone: addOwner.phone || undefined,
        owner_email: addOwner.email || undefined,
        name: an.name.trim(),
        species: an.species,
        breed: an.breed.trim() || undefined,
        sex: an.sex,
        dob: an.dob || null,
        current_weight_kg: an.weight ? Number(an.weight) : null,
        color: an.color.trim() || undefined,
        photo_url: an.photo,
        allergies: an.allergies.split(",").map((s) => s.trim()).filter(Boolean),
      });
    } catch (e) {
      toast.error(t("records.saveError", "Couldn't save the animal. Please try again."), e instanceof Error ? e.message : undefined);
      return;
    }
    playSuccess();
    setAddOwner(null);
    resetAnimal();
    onChanged();
  };

  const admByPet = useMemo(() => {
    const m = new Map<string, Admission[]>();
    for (const a of admissions) m.set(a.pet_id, [...(m.get(a.pet_id) ?? []), a]);
    return m;
  }, [admissions]);

  const months = useMemo(() => {
    const set = new Set(admissions.map((a) => a.admitted_on.slice(0, 7)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [admissions]);

  const petActivity = (p: Pet) => {
    const adms = admByPet.get(p.id) ?? [];
    const latestAdm = adms.reduce((m, a) => Math.max(m, new Date(a.admitted_on).getTime()), 0);
    return Math.max(latestAdm, new Date(p.created_at).getTime());
  };

  const owners = useMemo(() => {
    const dialCode = getDialCode();
    const map = new Map<string, { id: string; name: string; phone: string; email: string; pets: Pet[] }>();
    for (const p of pets) {
      // Owner identity = phone number. The same number always lands on the same owner
      // card; a matching name alone never merges two owners. A pet with no number stands
      // on its own card until it is assigned to an owner.
      const nat = nationalNumber(p.owner_phone ?? "", dialCode);
      const key = nat ? `ph:${nat}` : `solo:${p.id}`;
      const g = map.get(key) ?? { id: key, name: "—", phone: "", email: "", pets: [] };
      g.pets.push(p);
      map.set(key, g);
    }
    const list = Array.from(map.values());
    for (const o of list) {
      o.pets.sort((a, b) => petActivity(b) - petActivity(a));
      // Representative contact = the most recently active pet that actually carries each field.
      o.name = o.pets.find((p) => p.owner_name?.trim())?.owner_name?.trim() || "—";
      o.phone = o.pets.find((p) => p.owner_phone?.trim())?.owner_phone?.trim() || "";
      o.email = o.pets.find((p) => p.owner_email?.trim())?.owner_email?.trim() || "";
    }
    list.sort((a, b) => Math.max(...b.pets.map(petActivity)) - Math.max(...a.pets.map(petActivity)));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pets, admByPet]);

  const openEdit = (o: { id: string; name: string; phone: string; email: string; pets: Pet[] }) => {
    setEditing({ id: o.id, name: o.name, phone: o.phone, email: o.email, petIds: o.pets.map((p) => p.id) });
    setEditName(o.name === "—" ? "" : o.name);
    setEditPhone(o.phone);
    setEditEmail(o.email);
  };
  const saveEdit = async () => {
    if (!editing) return;
    const patch = { owner_name: editName.trim(), owner_phone: editPhone, owner_email: editEmail.trim() };
    // An owner card is derived from its pets, so write the contact change to every pet in it.
    await Promise.all(editing.petIds.map((id) => repo.updatePet(id, patch)));
    playSuccess();
    setEditing(null);
    onChanged();
  };

  // Move a single animal onto a specific owner's record (existing or brand-new).
  const moveToOwner = async (target: { name?: string; phone?: string; email?: string }) => {
    if (!reassign) return;
    const patch = {
      owner_name: (target.name ?? "").trim() || undefined,
      owner_phone: (target.phone ?? "").trim() || undefined,
      owner_email: (target.email ?? "").trim() || undefined,
    };
    try {
      await repo.updatePet(reassign.id, patch);
    } catch (e) {
      toast.error(t("records.moveError", "Couldn't move the animal. Please try again."), e instanceof Error ? e.message : undefined);
      return;
    }
    playSuccess();
    const movedName = reassign.name;
    setReassign(null);
    setRq("");
    setRNew({ name: "", phone: "", email: "" });
    toast.success(t("records.moved", { pet: movedName, owner: patch.owner_name ?? t("records.thisOwner", "this owner"), defaultValue: "{{pet}} moved to {{owner}}" }));
    onChanged();
  };

  const ql = q.trim().toLowerCase();
  const dial = getDialCode();
  const speciesPresent = useMemo(() => Array.from(new Set(pets.map((p) => p.species))), [pets]);
  const visitCount = (o: { pets: Pet[] }) => o.pets.reduce((n, p) => n + (admByPet.get(p.id)?.length ?? 0), 0);
  const filtered = owners
    .map((o) => ({
      ...o,
      pets: o.pets.filter((p) => {
        const matchesQ = !ql || p.name.toLowerCase().includes(ql) || o.name.toLowerCase().includes(ql) || o.email.toLowerCase().includes(ql) || phoneMatches(o.phone, q, dial);
        const matchesMonth = month === "all" || (admByPet.get(p.id) ?? []).some((a) => a.admitted_on.slice(0, 7) === month);
        const matchesSpecies = species === "all" || p.species === species;
        const st = petStatusOf(p.id, admByPet);
        const matchesSegment = segment === "all" || (segment === "allergy" ? (p.allergies?.length ?? 0) > 0 : st === segment);
        return matchesQ && matchesMonth && matchesSpecies && matchesSegment;
      }),
    }))
    .filter((o) => o.pets.length > 0);
  const sorted = [...filtered];
  if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "visits") sorted.sort((a, b) => visitCount(b) - visitCount(a));

  const total = sorted.reduce((n, o) => n + o.pets.length, 0);
  const ownerInitials = (name: string) => name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const lastSeenDays = (o: { pets: Pet[] }) => {
    const last = Math.max(...o.pets.map((p) => {
      const adms = admByPet.get(p.id) ?? [];
      return adms.reduce((m, a) => Math.max(m, new Date(a.admitted_on).getTime()), new Date(p.created_at).getTime());
    }));
    return Math.floor((Date.now() - last) / 86400000);
  };

  // Saved-view segments + their counts.
  const segCount = (seg: typeof segment) =>
    seg === "all" ? pets.length : pets.filter((p) => (seg === "allergy" ? (p.allergies?.length ?? 0) > 0 : petStatusOf(p.id, admByPet) === seg)).length;
  const SEGMENTS: { id: typeof segment; label: string; icon: typeof Stethoscope }[] = [
    { id: "all", label: t("media.all", "All"), icon: Users },
    { id: "treatment", label: t("records.stTreatment", "In treatment"), icon: Stethoscope },
    { id: "boarding", label: t("records.stBoarding", "Boarding"), icon: BedDouble },
    { id: "allergy", label: t("records.allergies", "Allergies"), icon: AlertTriangle },
  ];

  // Lazy windowing for large lists.
  const visibleOwners = sorted.slice(0, visibleCount);
  const hasMore = sorted.length > visibleCount;
  const visiblePetIds = visibleOwners.flatMap((o) => o.pets.map((p) => p.id));
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allVisibleSelected = visiblePetIds.length > 0 && visiblePetIds.every((id) => selected.has(id));
  const toggleSelectAll = () => setSelected((s) => { const n = new Set(s); if (allVisibleSelected) visiblePetIds.forEach((id) => n.delete(id)); else visiblePetIds.forEach((id) => n.add(id)); return n; });
  const exitSelect = () => { setSelecting(false); setSelected(new Set()); };
  const petById = useMemo(() => new Map(pets.map((p) => [p.id, p])), [pets]);
  const selectedPets = Array.from(selected).map((id) => petById.get(id)).filter(Boolean) as Pet[];

  const bulkCopyPhones = async () => {
    const phones = Array.from(new Set(selectedPets.map((p) => p.owner_phone).filter(Boolean)));
    try { await navigator.clipboard.writeText(phones.join("\n")); toast.success(t("records.copiedN", { n: phones.length, defaultValue: "{{n}} phone numbers copied" })); playTap(); } catch { /* ignore */ }
  };
  const bulkExport = () => {
    const head = ["Name", "Species", "Breed", "Owner", "Phone", "Email"];
    const rows = selectedPets.map((p) => [p.name, p.species, p.breed ?? "", p.owner_name ?? "", p.owner_phone ?? "", p.owner_email ?? ""]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "patients.csv"; a.click(); URL.revokeObjectURL(url);
    toast.success(t("records.exported", "Patient list exported"));
  };

  useEffect(() => { setVisibleCount(20); }, [q, segment, species, month, sort]);
  useEffect(() => {
    const el = sentinelRef.current; if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) setVisibleCount((c) => c + 20); });
    io.observe(el);
    return () => io.disconnect();
  }, [sorted.length]);

  return (
    <div>
      {/* Smart toolbar */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-ink-subtle" />
          <input ref={searchRef} className="input ps-9 pe-16" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("records.search")} />
          {q ? (
            <button onClick={() => { setQ(""); searchRef.current?.focus(); }} aria-label={t("common.clear", "Clear")} className="absolute end-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-ink"><X size={14} /></button>
          ) : (
            <kbd className="absolute end-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-surface-2 px-1.5 text-2xs font-semibold text-ink-subtle sm:block">/</kbd>
          )}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:flex-none">
            <ArrowDownUp size={14} className="pointer-events-none absolute top-1/2 start-2.5 -translate-y-1/2 text-ink-subtle" />
            <select className="input w-full ps-8 sm:w-auto" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="recent">{t("records.sortRecent", "Recent")}</option>
              <option value="name">{t("records.sortName", "Name A–Z")}</option>
              <option value="visits">{t("records.sortVisits", "Most visits")}</option>
            </select>
          </div>
          <select className="input hidden sm:block sm:w-40" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">{t("records.allMonths")}</option>
            {months.map((m) => (
              <option key={m} value={m}>{new Date(`${m}-01`).toLocaleDateString(i18n.language === "ar" ? "ar-EG" : "en-US", { month: "long", year: "numeric" })}</option>
            ))}
          </select>
          <button onClick={() => { playTap(); setDense((d) => !d); }} title={t("records.density", "Density")} aria-label={t("records.density", "Density")} className={cn("grid h-[46px] w-11 shrink-0 place-items-center rounded-2xl border transition", dense ? "border-brand-400 bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" : "border-line bg-surface-1 text-ink-muted hover:text-ink")}>
            <Rows3 size={18} />
          </button>
          <button onClick={() => { playTap(); selecting ? exitSelect() : setSelecting(true); }} title={t("records.select", "Select")} aria-label={t("records.select", "Select")} className={cn("grid h-[46px] w-11 shrink-0 place-items-center rounded-2xl border transition", selecting ? "border-brand-400 bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" : "border-line bg-surface-1 text-ink-muted hover:text-ink")}>
            <ListChecks size={18} />
          </button>
        </div>
      </div>

      {/* Saved-view segments */}
      <div className="mb-3 flex flex-wrap gap-2">
        {SEGMENTS.map((s) => {
          const Icon = s.icon;
          const n = segCount(s.id);
          if (s.id !== "all" && n === 0) return null;
          const active = segment === s.id;
          return (
            <button key={s.id} onClick={() => { playTap(); setSegment(s.id); }} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition", active ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
              <Icon size={13} /> {s.label}
              <span className={cn("rounded-full px-1.5 text-2xs font-bold", active ? "bg-white/25" : "bg-surface-3 text-ink-subtle")}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Species filter chips */}
      {speciesPresent.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button onClick={() => { playTap(); setSpecies("all"); }} className={cn("chip text-xs transition", species === "all" ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:text-ink")}>{t("media.all", "All")}</button>
          {speciesPresent.map((sp) => (
            <button key={sp} onClick={() => { playTap(); setSpecies(sp); }} className={cn("chip gap-1 text-xs transition", species === sp ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:text-ink")}>
              <span>{SPECIES_EMOJI[sp]}</span> {t(`pet.species.${sp}`)}
            </button>
          ))}
        </div>
      )}

      <p className="mb-4 text-sm text-ink-subtle">{total} {t("records.patients")}</p>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}</div>
      ) : sorted.length === 0 ? (
        <div className="card flex flex-col items-center p-10 text-center">
          <span className="mb-3 grid h-14 w-14 place-items-center rounded-3xl bg-surface-2 text-ink-subtle"><Search size={26} /></span>
          <p className="font-semibold text-ink">{t("records.noResults")}</p>
        </div>
      ) : (
        <>
          {selecting && (
            <div className="mb-2 flex items-center justify-between rounded-2xl border border-line bg-surface-2 px-3 py-2 text-sm">
              <button onClick={toggleSelectAll} className="flex items-center gap-2 font-medium text-ink">
                <span className={cn("grid h-5 w-5 place-items-center rounded-md border-2 transition", allVisibleSelected ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong text-transparent")}><Check size={12} strokeWidth={3} /></span>
                {t("records.selectAll", "Select all")}
              </button>
              <span className="text-ink-subtle">{selected.size} {t("records.selectedCount", "selected")}</span>
            </div>
          )}
          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3">
            {visibleOwners.map((o) => {
              const days = lastSeenDays(o);
              return (
                <motion.div key={o.id} variants={staggerItem} className={cn("card", dense ? "p-3" : "p-4")}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-grad font-display text-sm font-bold text-white shadow-soft">{ownerInitials(o.name)}</span>
                      <div className="min-w-0">
                        <p className="truncate font-display font-bold text-ink">{o.name}</p>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                          {o.phone ? (
                            <button onClick={() => copyPhone(o.phone)} title={t("records.copyPhone", "Copy number")} className="group/p flex items-center gap-1 text-xs text-ink-muted transition hover:text-brand-600">
                              <Phone size={11} /> {o.phone} <Copy size={10} className="opacity-0 transition group-hover/p:opacity-100" />
                            </button>
                          ) : <span className="text-xs text-ink-subtle">—</span>}
                          <button onClick={() => openEdit(o)} title={t("records.editContact", "Edit contact")} className="text-ink-subtle transition hover:text-brand-600"><Pencil size={11} /></button>
                          {o.email && <span className="flex items-center gap-1 text-xs text-ink-subtle"><Mail size={11} /> {o.email}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <div className="flex items-center gap-2">
                        <Badge tone="neutral">{o.pets.length} {t("records.pets")}</Badge>
                        <Button size="sm" variant="secondary" leftIcon={<Plus size={14} />} onClick={() => { playTap(); resetAnimal(); setAddOwner(o); }}>
                          <span className="hidden sm:inline">{t("records.addAnimal")}</span>
                        </Button>
                      </div>
                      <span className="flex items-center gap-1 text-[11px] text-ink-subtle">
                        <Clock size={10} /> {days <= 0 ? t("records.today", "today") : t("records.daysAgo", { n: days, defaultValue: "{{n}}d ago" })}
                      </span>
                    </div>
                  </div>
                  <div className={dense ? "space-y-1.5" : "space-y-2"}>
                    {o.pets.map((p) => {
                      const hasAllergy = p.allergies && p.allergies.length > 0;
                      const st = petStatusOf(p.id, admByPet);
                      const sel = selected.has(p.id);
                      return (
                        <div key={p.id} className={cn("flex items-center gap-2 rounded-2xl border transition", dense ? "p-1.5" : "p-2.5", sel ? "border-brand-400 bg-brand-50 dark:border-brand-500/50 dark:bg-brand-500/10" : "border-line bg-surface-1 hover:border-brand-200 hover:bg-surface-2 dark:hover:border-brand-500/40")}>
                          {selecting && (
                            <button onClick={() => toggleSel(p.id)} aria-label="select" className={cn("grid shrink-0 place-items-center rounded-md border-2 transition", dense ? "h-5 w-5" : "h-6 w-6", sel ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong text-transparent hover:border-brand-400")}><Check size={13} strokeWidth={3} /></button>
                          )}
                          <button className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => { playTap(); selecting ? toggleSel(p.id) : navigate(`/pet/${p.id}?tab=history`); }}>
                            <PetAvatar pet={p} size={dense ? 32 : 40} photoFallback />
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                                {p.name}
                                {hasAllergy && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger-500" title={p.allergies?.join(", ")} />}
                              </p>
                              {!dense && <p className="truncate text-xs text-ink-muted">{t(`pet.species.${p.species}`)}{p.breed ? ` · ${p.breed}` : ""}</p>}
                            </div>
                          </button>
                          {st === "treatment" && <Badge tone="accent" dot>{t("records.stTreatment", "In treatment")}</Badge>}
                          {st === "boarding" && <Badge tone="sky" icon={<BedDouble size={11} />}>{t("records.stBoarding", "Boarding")}</Badge>}
                          {st === "recent" && !dense && <Badge tone="success" dot className="hidden sm:inline-flex">{t("records.stRecent", "Seen")}</Badge>}
                          {!selecting && (
                            <div className="flex shrink-0 items-center gap-0.5">
                              <button title={t("records.moveOwner", "Move to owner")} onClick={() => { playTap(); setReassign(p); setRq(""); setRNew({ name: "", phone: "", email: "" }); }} className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/15"><ArrowRightLeft size={15} /></button>
                              <button title={t("treatment.title")} onClick={() => { playTap(); navigate(`/pet/${p.id}?tab=treatment`); }} className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/15"><Pill size={15} /></button>
                              <button title={t("passport.tabs.qr")} onClick={() => { playTap(); navigate(`/pet/${p.id}?tab=qr`); }} className="hidden h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/15 sm:grid"><IdCard size={15} /></button>
                              <ChevronLeft size={16} className="text-ink-subtle ltr:rotate-180" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
          <div ref={sentinelRef} className="h-1" />
          {hasMore && (
            <div className="mt-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setVisibleCount((c) => c + 20)}>{t("records.loadMore", "Load more")} · {sorted.length - visibleCount}</Button>
            </div>
          )}
        </>
      )}

      {/* Bulk action bar */}
      <AnimatePresence>
        {selecting && selected.size > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="sticky bottom-4 z-10 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-1/95 px-4 py-3 shadow-raised backdrop-blur no-print">
            <span className="text-sm font-medium text-ink">{selected.size} {t("records.selectedCount", "selected")}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" leftIcon={<Copy size={15} />} onClick={bulkCopyPhones}>{t("records.copyPhones", "Copy phones")}</Button>
              <Button size="sm" variant="secondary" leftIcon={<Download size={15} />} onClick={bulkExport}>{t("records.export", "Export")}</Button>
              <Button size="sm" variant="ghost" onClick={exitSelect}>{t("common.cancel")}</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={t("records.editPhoneTitle", { owner: editing?.name ?? "" })}>
        <label className="label">{t("records.ownerName", "Owner name")}</label>
        <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t("records.ownerName", "Owner name")} />
        <label className="label mt-4">{t("phone.number")}</label>
        <PhoneInput value={editPhone} onChange={setEditPhone} />
        <label className="label mt-4">{t("phone.email")}</label>
        <input type="email" className="input" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="owner@email.com" />
        {editing && editing.petIds.length > 1 && (
          <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-muted">{t("records.editAllPets", { n: editing.petIds.length, defaultValue: "Applies to all {{n}} animals on this owner." })}</p>
        )}
        <Button className="mt-4 w-full" onClick={saveEdit}>{t("common.save")}</Button>
      </Modal>

      {/* Move / reassign a single animal onto a specific owner. */}
      <Modal open={!!reassign} onClose={() => setReassign(null)} title={t("records.moveTitle", { pet: reassign?.name ?? "", defaultValue: "Move {{pet}} to an owner" })}>
        {reassign && (() => {
          const cur = reassign;
          if (!cur) return null;
          const rql = rq.trim().toLowerCase();
          const curNat = nationalNumber(cur.owner_phone ?? "", dial);
          const matches = owners
            .filter((o) => {
              const oNat = nationalNumber(o.phone, dial);
              if (!oNat) return false;                      // only numbered owners are reliable merge targets
              if (curNat && oNat === curNat) return false;  // already this pet's owner
              if (!rql) return true;
              return o.name.toLowerCase().includes(rql) || phoneMatches(o.phone, rq, dial);
            })
            .slice(0, 8);
          const canCreate = Boolean(rNew.name.trim() || rNew.phone.trim());
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3">
                <PetAvatar pet={cur} size={38} photoFallback />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{cur.name}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {cur.owner_name ? t("records.currentlyWith", { owner: cur.owner_name, defaultValue: "Currently: {{owner}}" }) : t("records.noOwnerYet", "No owner assigned yet")}
                  </p>
                </div>
              </div>

              <div>
                <label className="label">{t("records.pickOwner", "Assign to an existing owner")}</label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
                  <input className="input ltr:pl-9 rtl:pr-9" value={rq} onChange={(e) => setRq(e.target.value)} placeholder={t("records.searchOwners", "Search by name or number")} autoFocus />
                </div>
                <div className="mt-2 max-h-56 space-y-1.5 overflow-auto">
                  {matches.length === 0 ? (
                    <p className="px-1 py-3 text-center text-sm text-ink-subtle">{t("records.noOwnerMatch", "No matching owner — add a new one below.")}</p>
                  ) : matches.map((o) => (
                    <button key={o.id} onClick={() => moveToOwner({ name: o.name, phone: o.phone, email: o.email })} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-1 p-2.5 text-start transition hover:border-brand-300 hover:bg-brand-50 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-grad text-2xs font-bold text-white">{ownerInitials(o.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{o.name}</span>
                        <span className="block truncate text-xs text-ink-muted">{o.phone || t("records.noPhone", "no number")} · {o.pets.length} {t("records.pets")}</span>
                      </span>
                      <ArrowRightLeft size={15} className="shrink-0 text-ink-subtle" />
                    </button>
                  ))}
                </div>
              </div>

              <details className="rounded-2xl border border-line bg-surface-1 p-3">
                <summary className="cursor-pointer select-none text-sm font-semibold text-ink">{t("records.newOwner", "Or enter a new owner")}</summary>
                <div className="mt-3 space-y-3">
                  <input className="input" value={rNew.name} onChange={(e) => setRNew((s) => ({ ...s, name: e.target.value }))} placeholder={t("records.ownerName", "Owner name")} />
                  <PhoneInput value={rNew.phone} onChange={(v) => setRNew((s) => ({ ...s, phone: v }))} />
                  <input type="email" className="input" value={rNew.email} onChange={(e) => setRNew((s) => ({ ...s, email: e.target.value }))} placeholder="owner@email.com" />
                  <Button className="w-full" disabled={!canCreate} onClick={() => moveToOwner(rNew)}>{t("records.createAssign", "Save & assign")}</Button>
                </div>
              </details>
            </div>
          );
        })()}
      </Modal>

      <Modal open={!!addOwner} onClose={() => setAddOwner(null)} title={t("records.addAnimalTitle", { owner: addOwner?.name ?? "" })}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="shrink-0 cursor-pointer">
              {an.photo ? (
                <img src={an.photo} alt="" className="h-16 w-16 rounded-2xl object-cover" />
              ) : (
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15"><Camera size={22} /></span>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setA({ photo: r.result as string }); r.readAsDataURL(f); }} />
            </label>
            <div className="flex-1">
              <label className="label">{t("pet.name")}</label>
              <input className="input" value={an.name} onChange={(e) => setA({ name: e.target.value })} autoFocus />
            </div>
          </div>
          <div>
            <label className="label">{t("pet.speciesLabel")}</label>
            <SpeciesPicker value={an.species} onChange={(species) => setA({ species })} />
          </div>
          <div>
            <label className="label">{t("pet.breed")}</label>
            <BreedPicker species={an.species} value={an.breed} onChange={(breed) => setA({ breed })} />
          </div>
          <div>
            <label className="label">{t("pet.sexLabel")}</label>
            <SexPicker value={an.sex} onChange={(sex) => setA({ sex })} />
          </div>
          <div>
            <label className="label">{t("pet.ageLabel", "Age")}</label>
            <AgeInput dob={an.dob} onChange={(dob) => setA({ dob })} />
          </div>
          <WeightInput value={an.weight} onChange={(weight) => setA({ weight })} />
          <div>
            <label className="label">{t("pet.color")}</label>
            <ColorPicker value={an.color} onChange={(color) => setA({ color })} />
          </div>
          <div>
            <label className="label">{t("newCase.allergies")}</label>
            <input className="input" value={an.allergies} onChange={(e) => setA({ allergies: e.target.value })} placeholder="Penicillin, …" />
          </div>
          <Button className="w-full" disabled={!an.name.trim()} leftIcon={<PawPrint size={16} />} onClick={saveAnimal}>
            {t("records.addAnimal")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------- Current treatment cases ---------------- */
function CurrentCases({ pets, admissions, treatments, onChanged }: { pets: Pet[]; admissions: Admission[]; treatments: TreatmentEntry[]; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const active = admissions.filter((a) => a.kind === "treatment" && a.status === "active");

  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((n) => n + 1), 60000); return () => clearInterval(id); }, []);

  const petOf = (id: string) => pets.find((p) => p.id === id);
  const medsToday = (petId: string) => treatments.filter((tx) => tx.pet_id === petId && tx.day === today).length;

  const completion = (a: Admission) => {
    const cycle = a.cycle_hours ?? 24;
    if (!a.last_completed_at) return { done: false, remainingH: 0 };
    const elapsed = Date.now() - new Date(a.last_completed_at).getTime();
    const windowMs = cycle * 3600 * 1000;
    if (elapsed >= windowMs) return { done: false, remainingH: 0 };
    return { done: true, remainingH: Math.max(1, Math.ceil((windowMs - elapsed) / 3600000)) };
  };

  const discharge = async (id: string) => { await repo.updateAdmission(id, { status: "discharged", discharged_on: today }); onChanged(); };
  const setCycle = async (id: string, cycle_hours: number) => { await repo.updateAdmission(id, { cycle_hours }); onChanged(); };
  const markDone = async (id: string) => { await repo.updateAdmission(id, { last_completed_at: new Date().toISOString() }); playSuccess(); onChanged(); };
  const undo = async (id: string) => { await repo.updateAdmission(id, { last_completed_at: null }); onChanged(); };

  const due = active.filter((a) => !completion(a).done);
  const completed = active.filter((a) => completion(a).done);

  const renderCard = (a: Admission) => {
    const p = petOf(a.pet_id);
    if (!p) return null;
    const { done, remainingH } = completion(a);
    const cycle = a.cycle_hours ?? 24;
    return (
      <motion.div key={a.id} layout variants={staggerItem} className={cn("card p-4", done && "ring-1 ring-success-200 dark:ring-success-500/30")}>
        <div className="flex items-center gap-3">
          <PetAvatar pet={p} size={48} photoFallback />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display font-bold text-ink">{p.name}</p>
            <p className="truncate text-xs text-ink-muted">{p.owner_name}</p>
          </div>
          <Badge tone="brand" icon={<Pill size={12} />}>{t("records.todayMeds", { n: medsToday(p.id) })}</Badge>
        </div>
        {a.reason && <p className="mt-2 text-sm text-ink-muted">{a.reason}</p>}
        <p className="mt-2 flex items-center gap-1 text-xs text-ink-subtle">
          <CalendarDays size={12} /> {t("records.admitted")} {formatDate(a.admitted_on, i18n.language)} · {t("snapshot.day", "Day")} {daysSince(a.admitted_on) + 1}
        </p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-ink-subtle">{t("records.cycle")}</span>
            <div className="inline-flex rounded-full bg-surface-2 p-0.5 text-[11px] font-medium">
              <button className={cn("rounded-full px-2.5 py-1 transition", cycle === 24 ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted")} onClick={() => setCycle(a.id, 24)}>{t("records.daily")}</button>
              <button className={cn("rounded-full px-2.5 py-1 transition", cycle === 12 ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted")} onClick={() => setCycle(a.id, 12)}>{t("records.every12")}</button>
            </div>
          </div>
          {done ? (
            <button className="chip bg-success-50 text-[11px] text-success-700 dark:bg-success-500/15 dark:text-success-200" onClick={() => undo(a.id)}>
              <Check size={12} /> {t("records.resetsIn", { h: remainingH })}
            </button>
          ) : (
            <span className="chip bg-warn-50 text-[11px] text-warn-700 dark:bg-warn-500/15 dark:text-warn-200">{t("records.treatmentDue")}</span>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          {!done && <Button size="sm" leftIcon={<Check size={15} />} onClick={() => markDone(a.id)}>{t("records.markDone")}</Button>}
          <Button size="sm" variant="secondary" className="flex-1" leftIcon={<Pill size={15} />} onClick={() => { playTap(); navigate(`/pet/${p.id}?tab=treatment`); }}>{t("records.openSheet")}</Button>
          <Button size="sm" variant="ghost" onClick={() => discharge(a.id)} aria-label={t("records.discharge")}><DischargeIcon size={15} /></Button>
        </div>
      </motion.div>
    );
  };

  const columns = [
    { id: "due", title: t("records.kanbanDue", "Due now"), icon: Clock, tone: "warn", items: due },
    { id: "done", title: t("records.kanbanDone", "Up to date"), icon: Check, tone: "success", items: completed },
  ] as const;
  const colTone: Record<string, string> = {
    warn: "bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300",
    success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-200",
  };

  return (
    <div>
      <p className="mb-3 text-xs text-ink-subtle">{t("records.casesHint")}</p>
      {active.length === 0 ? (
        <div className="card p-8 text-center text-ink-subtle">{t("records.casesEmpty")}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {columns.map((col) => {
            const Icon = col.icon;
            return (
              <div key={col.id}>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className={cn("grid h-6 w-6 place-items-center rounded-lg", colTone[col.tone])}><Icon size={14} /></span>
                  <h3 className="font-display text-sm font-bold tracking-tighter2 text-ink">{col.title}</h3>
                  <span className="rounded-full bg-surface-2 px-2 text-2xs font-bold text-ink-subtle">{col.items.length}</span>
                </div>
                <motion.div layout variants={staggerContainer} initial="initial" animate="animate" className="space-y-3">
                  {col.items.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-line p-6 text-center text-xs text-ink-subtle">{t("records.colEmpty", "Nothing here")}</div>
                  ) : col.items.map(renderCard)}
                </motion.div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Boarding ---------------- */
function Boarding({ pets, admissions, onChanged }: { pets: Pet[]; admissions: Admission[]; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const active = admissions.filter((a) => a.kind === "boarding" && a.status === "active");
  const petOf = (id: string) => pets.find((p) => p.id === id);

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSel = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exitSelect = () => { setSelecting(false); setSelected(new Set()); };

  const discharge = async (id: string) => { await repo.updateAdmission(id, { status: "discharged", discharged_on: today }); onChanged(); };
  const bulkDischarge = async () => {
    const ids = [...selected];
    await Promise.all(ids.map((id) => repo.updateAdmission(id, { status: "discharged", discharged_on: today })));
    toast.success(t("records.dischargedN", { n: ids.length, defaultValue: "{{n}} patients discharged" }));
    exitSelect();
    onChanged();
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-ink-subtle">{t("records.boardingHint")}</p>
        {active.length > 1 && (
          <button
            onClick={() => (selecting ? exitSelect() : setSelecting(true))}
            aria-label={t("records.select")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selecting ? "border-brand-400 bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" : "border-line text-ink-muted hover:bg-surface-2"}`}
          >
            {selecting ? <X size={14} /> : <ListChecks size={14} />} {selecting ? t("common.cancel", "Cancel") : t("records.select")}
          </button>
        )}
      </div>
      {active.length === 0 ? (
        <div className="card p-8 text-center text-ink-subtle">{t("records.boardingEmpty")}</div>
      ) : (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid gap-3 sm:grid-cols-2">
          {active.map((a) => {
            const p = petOf(a.pet_id);
            if (!p) return null;
            const isSel = selected.has(a.id);
            return (
              <motion.div
                key={a.id}
                variants={staggerItem}
                onClick={selecting ? () => toggleSel(a.id) : undefined}
                className={`card p-4 transition ${selecting ? "cursor-pointer" : ""} ${isSel ? "ring-2 ring-brand-500" : ""}`}
              >
                <div className="flex items-center gap-3">
                  {selecting && (
                    <span className={`grid h-5 w-5 flex-none place-items-center rounded-md border-2 ${isSel ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong"}`}>
                      {isSel && <Check size={13} />}
                    </span>
                  )}
                  <PetAvatar pet={p} size={48} photoFallback />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display font-bold text-ink">{p.name}</p>
                    <p className="truncate text-xs text-ink-muted">{p.owner_name}</p>
                  </div>
                  {a.cage && <Badge tone="sky" icon={<BedDouble size={12} />}>{t("records.cage")} {a.cage}</Badge>}
                </div>
                {a.reason && <p className="mt-2 text-sm text-ink-muted">{a.reason}</p>}
                <p className="mt-2 flex items-center gap-1 text-xs text-ink-subtle">
                  <CalendarDays size={12} /> {t("records.admitted")} {formatDate(a.admitted_on, i18n.language)} · {daysSince(a.admitted_on)} {t("records.days")}
                </p>
                {!selecting && (
                  <Button size="sm" variant="ghost" className="mt-3 w-full" leftIcon={<DischargeIcon size={15} />} onClick={() => discharge(a.id)}>{t("records.discharge")}</Button>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}
      <AnimatePresence>
        {selecting && selected.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="sticky bottom-4 z-20 mx-auto mt-4 flex w-fit items-center gap-2 rounded-full border border-line bg-surface-1/95 px-3 py-2 shadow-raised backdrop-blur no-print"
          >
            <span className="ps-1 text-sm font-semibold text-ink">{selected.size} {t("records.selectedCount", "selected")}</span>
            <Button size="sm" leftIcon={<DischargeIcon size={15} />} onClick={bulkDischarge}>{t("records.discharge")}</Button>
            <Button size="sm" variant="ghost" onClick={exitSelect}>{t("common.cancel", "Cancel")}</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Movement log (day-grouped entries / exits) ---------------- */
function MovementLog({ pets, admissions }: { pets: Pet[]; admissions: Admission[] }) {
  const { t, i18n } = useTranslation();
  const petOf = (id: string) => pets.find((p) => p.id === id);

  interface MoveEvent { key: string; date: string; dir: "in" | "out"; pet: Pet; kind: Admission["kind"]; }
  const events: MoveEvent[] = [];
  for (const a of admissions) {
    const pet = petOf(a.pet_id);
    if (!pet) continue;
    events.push({ key: `${a.id}:in`, date: a.admitted_on, dir: "in", pet, kind: a.kind });
    if (a.discharged_on) events.push({ key: `${a.id}:out`, date: a.discharged_on, dir: "out", pet, kind: a.kind });
  }
  events.sort((x, y) => y.date.localeCompare(x.date) || (x.dir === y.dir ? 0 : x.dir === "out" ? -1 : 1));

  // Group by day.
  const groups: { day: string; items: MoveEvent[] }[] = [];
  for (const e of events) {
    const last = groups[groups.length - 1];
    if (last && last.day === e.date) last.items.push(e);
    else groups.push({ day: e.date, items: [e] });
  }

  return (
    <div>
      <p className="mb-3 text-xs text-ink-subtle">{t("records.movementHint")}</p>
      {events.length === 0 ? (
        <div className="card p-8 text-center text-ink-subtle">{t("records.movementEmpty")}</div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.day}>
              <p className="mb-2 ps-1 text-xs font-bold uppercase tracking-wide text-ink-subtle">{formatDate(g.day, i18n.language)}</p>
              <div className="card divide-y divide-line">
                {g.items.map((e) => {
                  const isIn = e.dir === "in";
                  return (
                    <div key={e.key} className="flex items-center gap-3 p-3">
                      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", isIn ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300" : "bg-surface-2 text-ink-muted")}>
                        {isIn ? <LogIn size={16} /> : <LogOut size={16} />}
                      </span>
                      <PetAvatar pet={e.pet} size={36} photoFallback />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{e.pet.name}</p>
                        <p className="truncate text-xs text-ink-muted">{e.pet.owner_name}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="chip bg-surface-2 text-[10px] text-ink-muted">{e.kind === "boarding" ? <BedDouble size={10} /> : <Stethoscope size={10} />}</span>
                        <Badge tone={isIn ? "success" : "neutral"}>{isIn ? t("records.entered") : t("records.left")}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
