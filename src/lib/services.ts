// Clinic-managed catalogue of billable non-barcode SERVICES (CBC, X-Ray, consults,
// grooming…), grouped into custom categories. Persisted to Supabase (table
// clinic_services + clinic_service_categories, isolated by clinic_id =
// auth_clinic()), with an in-memory cache so the synchronous getters below keep
// working and a localStorage mirror for demo/offline. The sale itself still flows
// through the normal invoice pipeline (a service is a line item, no product_id).
import { getActiveClinicId } from "./clinics";
import { uuid } from "./utils";
import { sb, cloudWrite, registerHydrator, registerReset } from "./clinicSync";
import type { ServiceCategory, Service, ServiceCatalog } from "@/types";

const keyName = () => `vp_services_${getActiveClinicId()}`;

let cache: ServiceCatalog | null = null;

/** Starter catalogue so a new clinic (and the demo) has services out of the box. */
function seedCatalog(): ServiceCatalog {
  const lab = uuid(), img = uuid(), con = uuid(), grm = uuid();
  return {
    categories: [
      { id: lab, name: "المختبر" },
      { id: img, name: "الأشعة" },
      { id: con, name: "الاستشاريات" },
      { id: grm, name: "حلاقة وعناية" },
    ],
    services: [
      { id: uuid(), category_id: lab, name: "تحليل دم شامل (CBC)", price: 25000 },
      { id: uuid(), category_id: lab, name: "تحاليل كيمياء الدم", price: 35000 },
      { id: uuid(), category_id: lab, name: "تحليل بول", price: 15000 },
      { id: uuid(), category_id: lab, name: "فحص براز", price: 10000 },
      { id: uuid(), category_id: img, name: "أشعة — لقطة واحدة", price: 30000 },
      { id: uuid(), category_id: img, name: "أشعة — لقطتان", price: 50000 },
      { id: uuid(), category_id: img, name: "سونار — بطني", price: 60000 },
      { id: uuid(), category_id: con, name: "فحص عام", price: 15000 },
      { id: uuid(), category_id: con, name: "مراجعة", price: 10000 },
      { id: uuid(), category_id: con, name: "استشارة طارئة", price: 40000 },
      { id: uuid(), category_id: grm, name: "حلاقة كاملة", price: 25000 },
      { id: uuid(), category_id: grm, name: "قص أظافر", price: 5000 },
    ],
  };
}

function readLocal(): ServiceCatalog {
  try {
    const raw = localStorage.getItem(keyName());
    if (raw) {
      const parsed = JSON.parse(raw) as ServiceCatalog;
      if (parsed && Array.isArray(parsed.categories) && Array.isArray(parsed.services)) return parsed;
    }
  } catch { /* ignore */ }
  const fresh = seedCatalog();
  saveLocal(fresh);
  return fresh;
}

function saveLocal(c: ServiceCatalog) {
  try { localStorage.setItem(keyName(), JSON.stringify(c)); } catch { /* ignore */ }
}

/** Push a whole catalogue to Supabase (used for first-time migration / seeding). */
async function pushCatalog(c: ServiceCatalog) {
  const client = sb();
  if (!client) return;
  if (c.categories.length) await client.from("clinic_service_categories").insert(c.categories.map((x) => ({ id: x.id, name: x.name })));
  if (c.services.length) await client.from("clinic_services").insert(c.services.map((s) => ({ id: s.id, category_id: s.category_id, name: s.name, price: s.price })));
}

export async function hydrateServices(): Promise<void> {
  const client = sb();
  if (!client) { cache = readLocal(); return; }
  try {
    const [cats, svcs] = await Promise.all([
      client.from("clinic_service_categories").select("id,name").order("created_at"),
      client.from("clinic_services").select("id,category_id,name,price").order("created_at"),
    ]);
    if (cats.error) throw cats.error;
    if (svcs.error) throw svcs.error;
    let next: ServiceCatalog = {
      categories: (cats.data ?? []).map((c) => ({ id: c.id as string, name: c.name as string })),
      services: (svcs.data ?? []).map((s) => ({ id: s.id as string, category_id: s.category_id as string, name: s.name as string, price: Number(s.price) })),
    };
    // First run on a live backend → migrate existing local data (or seed) up.
    if (next.categories.length === 0 && next.services.length === 0) {
      next = readLocal();
      await pushCatalog(next);
    }
    cache = next;
    saveLocal(next);
  } catch {
    cache = readLocal(); // backend unreachable → behave exactly as offline
  }
}
registerHydrator(hydrateServices);
registerReset(() => { cache = null; });

export function getServiceCatalog(): ServiceCatalog {
  return cache ?? readLocal();
}

function commit(c: ServiceCatalog) { cache = c; saveLocal(c); }

export function addServiceCategory(name: string): ServiceCategory | null {
  const clean = name.trim();
  if (!clean) return null;
  const c = getServiceCatalog();
  if (c.categories.some((x) => x.name.toLowerCase() === clean.toLowerCase())) return null;
  const cat: ServiceCategory = { id: uuid(), name: clean };
  commit({ ...c, categories: [...c.categories, cat] });
  cloudWrite(() => sb()!.from("clinic_service_categories").insert({ id: cat.id, name: cat.name }), "service-category-add");
  return cat;
}

export function removeServiceCategory(id: string) {
  const c = getServiceCatalog();
  commit({ categories: c.categories.filter((x) => x.id !== id), services: c.services.filter((s) => s.category_id !== id) });
  // FK on_delete cascade removes the category's services in the DB too.
  cloudWrite(() => sb()!.from("clinic_service_categories").delete().eq("id", id), "service-category-del");
}

export function addService(categoryId: string, name: string, price: number): Service | null {
  const clean = name.trim();
  if (!clean) return null;
  const c = getServiceCatalog();
  const svc: Service = { id: uuid(), category_id: categoryId, name: clean, price: Math.max(0, Math.round(price * 100) / 100) || 0 };
  commit({ ...c, services: [...c.services, svc] });
  cloudWrite(() => sb()!.from("clinic_services").insert({ id: svc.id, category_id: svc.category_id, name: svc.name, price: svc.price }), "service-add");
  return svc;
}

export function updateService(id: string, patch: Partial<Pick<Service, "name" | "price" | "category_id">>) {
  const c = getServiceCatalog();
  const s = c.services.find((x) => x.id === id);
  if (!s) return;
  const next: Service = {
    ...s,
    name: patch.name !== undefined ? (patch.name.trim() || s.name) : s.name,
    price: patch.price !== undefined ? (Math.max(0, Math.round(patch.price * 100) / 100) || 0) : s.price,
    category_id: patch.category_id ?? s.category_id,
  };
  commit({ ...c, services: c.services.map((x) => (x.id === id ? next : x)) });
  cloudWrite(() => sb()!.from("clinic_services").update({ name: next.name, price: next.price, category_id: next.category_id }).eq("id", id), "service-update");
}

export function removeService(id: string) {
  const c = getServiceCatalog();
  commit({ ...c, services: c.services.filter((x) => x.id !== id) });
  cloudWrite(() => sb()!.from("clinic_services").delete().eq("id", id), "service-del");
}
