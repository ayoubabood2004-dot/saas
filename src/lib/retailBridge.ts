/**
 * «الجسر»: سجلُّ حيوانٍ أو نتيجةُ مختبرٍ تفتح شاشةَ البيع برابطٍ يحمل الزبونَ والمريض.
 *
 * **يُقرأ الرابطُ عند أوّل رسم، لا بعده.** كان يُقرأ بأثرٍ (`useEffect`) — أي بعد أن
 * تُرسم شاشةُ البيع مرّةً بلا جسر. وحين تكون الأصنافُ محفوظةً بالذاكرة (أيُّ زيارةٍ سابقة
 * للمبيعات) لا شاشةَ تحميلٍ تؤخّرها، فتقرأ الشاشةُ **مسودّةَ الزبون السابق** ثم يهبط الجسرُ
 * فوقها: الاسمُ والحيوانُ يتبدّلان والسلّةُ تبقى — لقاحُ حيوانٍ يُفوتَر على زبونٍ آخر.
 * وبلا الذاكرة كان الجسرُ يسبق فتبدأ البيعةُ نظيفةً كما قُصد: السلوكُ كان يتبع حالةَ
 * الذاكرة لا قرارَ الطبيب. فهنا دالّةٌ واحدة يقرأ بها الأبُ الرابطَ بأوّل رسمٍ وبكلّ تغيّر.
 */
import type { Species } from "@/types";

/** ما يُملأ به البيعُ من الجسر — نفسُ بنية `RetailPrefill` بشاشة البيع. */
export interface BridgePrefill {
  name: string;
  phone: string;
  pet: string;
  petId?: string;
  species?: Species;
  service?: string;
  labId?: string;
}

const SPECIES = new Set<string>(["dog", "cat", "horse", "cow", "bird", "rabbit", "other"]);

/** بأيّ مسودّةٍ تبدأ شاشةُ البيع؟
 *  - بلا جسرٍ جديد (بيعٌ عابر، أو جسرٌ نزل سلفاً ثم أُعيد تركيبُ الشاشة): المحفوظةُ كما هي.
 *  - جسرٌ جديد: بيعةٌ نظيفة لمريضه — لا تهبط على سلّة زبونٍ آخر.
 *  - **إلا فوق دفعةٍ معلَّقة** (مسودّةٌ تحمل مرجعَ محاولةٍ لم تتأكّد): رميُها يرمي مرجعَها،
 *    فإعادةُ الدفع بعدها تسجّل مرّةً ثانيةً ما قد يكون انسجل (0135). فتبقى، والجسرُ لا يهبط. */
export function draftOnMount<T extends { clientRef?: string | null }>(saved: T | null, freshBridge: boolean): T | null {
  if (freshBridge && !saved?.clientRef) return null;
  return saved;
}

/** الجسرُ من الرابط، أو `null` إن لم يحمل الرابطُ زبوناً ولا مريضاً ولا خدمة.
 *  والنوعُ يُطابَق بالقائمة المعروفة — رابطٌ قديمٌ أو معبوثٌ به لا يُصبّ بلا فحص. */
export function bridgeFromParams(params: URLSearchParams): { prefill: BridgePrefill; returnPet: { id: string; name: string } | null } | null {
  const customer = params.get("customer") ?? "";
  const phone = params.get("phone") ?? "";
  const pet = params.get("pet") ?? "";
  const petId = params.get("petId") ?? "";
  const rawSpecies = params.get("species");
  const species = rawSpecies && SPECIES.has(rawSpecies) ? (rawSpecies as Species) : undefined;
  const service = params.get("service") ?? "";
  const labId = params.get("labId") ?? "";
  if (!customer && !phone && !pet && !service) return null;
  return {
    prefill: { name: customer, phone, pet, petId: petId || undefined, species, service: service || undefined, labId: labId || undefined },
    returnPet: petId ? { id: petId, name: pet || customer } : null,
  };
}
