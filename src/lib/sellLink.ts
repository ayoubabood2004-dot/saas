/* جسرُ «بيع» لصاحب الحيوان: الزبونُ وهاتفُه والحيوانُ بمعرّفه — ما يُباع من الأدوية يُكتب بسجلّه، وجرعاتُ الطبلة المعلَّقة
 * تنزل بالسلّة (0269). واحدٌ لسجلّ الحيوان ولطبلة الزيارة: شاشةُ البيع تقرأ هذه المعاملاتِ نفسَها. */
import type { Pet } from "@/types";

export function petSellUrl(pet: Pet): string {
  const q = new URLSearchParams();
  if (pet.owner_name) q.set("customer", pet.owner_name);
  if (pet.owner_phone) q.set("phone", pet.owner_phone);
  if (pet.name) q.set("pet", pet.name);
  q.set("petId", pet.id);
  if (pet.species) q.set("species", pet.species);
  return `/retail?${q.toString()}`;
}
