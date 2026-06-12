import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { repo } from "@/lib/repo";
import type { Species, Sex } from "@/types";
import { Modal } from "./Modal";
import { PhoneInput } from "./PhoneInput";
import { SpeciesPicker, SexPicker, AgeInput, WeightInput, ColorPicker, BreedPicker } from "./PetFields";
import { useToast } from "@/components/ui";
import { playSuccess, playWarning } from "@/lib/sounds";
import { getOwner } from "@/lib/owners";

export function AddPetModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<"new" | "serial">("new");
  const [serial, setSerial] = useState("");
  const [claimMsg, setClaimMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<Species>("dog");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState<Sex>("unknown");
  const [dob, setDob] = useState("");
  const [weight, setWeight] = useState("");
  const [color, setColor] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(""); setSpecies("dog"); setBreed(""); setSex("unknown"); setDob(""); setWeight(""); setColor(""); setPhone(""); setEmail("");
    setSerial(""); setClaimMsg(null);
  };

  const claim = async () => {
    if (!user || !serial.trim() || saving) return;
    const acc = getOwner(user.id);
    setSaving(true);
    try {
      const pet = await repo.claimPet(serial, {
        owner_id: user.id,
        owner_name: user.full_name,
        owner_phone: acc?.phone,
        owner_email: acc?.email,
      });
      if (!pet) { playWarning(); setClaimMsg({ ok: false, text: t("claim.notFound") }); return; }
      playSuccess();
      setClaimMsg({ ok: true, text: t("claim.added", { name: pet.name }) });
      setSerial("");
      onCreated();
    } catch (e) {
      playWarning();
      setClaimMsg({ ok: false, text: e instanceof Error ? e.message : t("records.saveError", "Couldn't save. Please try again.") });
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!user || !name.trim() || saving) return;
    setSaving(true);
    try {
      await repo.createPet({
        owner_id: user.id,
        clinic_id: null, // owner-created pet — not owned by any clinic (stays portable)
        owner_name: user.full_name,
        owner_phone: phone || undefined,
        owner_email: email.trim() || undefined,
        name: name.trim(),
        species,
        breed: breed.trim() || undefined,
        sex,
        dob: dob || null,
        current_weight_kg: weight ? Number(weight) : null,
        color: color.trim() || undefined,
        allergies: [],
      });
      playSuccess();
      reset();
      onCreated();
    } catch (e) {
      toast.error(t("records.saveError", "Couldn't save. Please try again."), e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("dashboard.addPet")}>
      <div className="flex gap-1 mb-4 bg-surface-2 p-1 rounded-xl">
        <button className={`flex-1 py-2 rounded-lg text-sm font-semibold ${tab === "new" ? "bg-white text-brand-700 shadow-card" : "text-ink-muted"}`} onClick={() => { setTab("new"); setClaimMsg(null); }}>{t("claim.newPet")}</button>
        <button className={`flex-1 py-2 rounded-lg text-sm font-semibold ${tab === "serial" ? "bg-white text-brand-700 shadow-card" : "text-ink-muted"}`} onClick={() => { setTab("serial"); setClaimMsg(null); }}>{t("claim.bySerial")}</button>
      </div>

      {tab === "serial" ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">{t("claim.hint")}</p>
          <div>
            <label className="label">{t("claim.serialLabel")}</label>
            <input className="input font-mono tracking-widest" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="10001" autoFocus />
          </div>
          {claimMsg && <p className={`text-sm ${claimMsg.ok ? "text-brand-700" : "text-red-600"}`}>{claimMsg.text}</p>}
          <div className="flex gap-3 pt-1">
            <button className="btn-ghost flex-1" onClick={onClose}>{t("common.close")}</button>
            <button className="btn-primary flex-1" onClick={claim} disabled={!serial.trim() || saving}>{t("claim.add")}</button>
          </div>
        </div>
      ) : (
      <div className="space-y-4">
        <div>
          <label className="label">{t("pet.name")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div>
          <label className="label">{t("pet.speciesLabel")}</label>
          <SpeciesPicker value={species} onChange={setSpecies} />
        </div>

        <div>
          <label className="label">{t("pet.breed")}</label>
          <BreedPicker species={species} value={breed} onChange={setBreed} />
        </div>

        <div>
          <label className="label">{t("pet.sexLabel")}</label>
          <SexPicker value={sex} onChange={setSex} />
        </div>

        <div>
          <label className="label">{t("pet.ageLabel", "Age")}</label>
          <AgeInput dob={dob} onChange={setDob} />
        </div>

        <div>
          <WeightInput value={weight} onChange={setWeight} />
        </div>

        <div>
          <label className="label">{t("pet.color")}</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        <div>
          <label className="label">{t("phone.ownerPhone")}</label>
          <PhoneInput value={phone} onChange={setPhone} />
        </div>

        <div>
          <label className="label">{t("phone.ownerEmail")}</label>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@email.com" />
        </div>

        <div className="flex gap-3 pt-2">
          <button className="btn-ghost flex-1" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn-primary flex-1" onClick={submit} disabled={saving || !name.trim()}>{t("common.save")}</button>
        </div>
      </div>
      )}
    </Modal>
  );
}
