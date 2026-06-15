// Clinic-managed catalogue of billable non-barcode SERVICES (CBC, X-Ray, consults,
// grooming…), grouped into custom categories. Clinic-scoped + persisted in
// localStorage — same pattern as the clinic medication/vaccine catalogues. The sale
// itself still flows through the normal invoice pipeline (a service is just a line
// item with no product_id and zero cost).
import { getActiveClinicId } from "./clinics";
import { uid } from "./utils";
import type { ServiceCategory, Service, ServiceCatalog } from "@/types";

const keyName = () => `vp_services_${getActiveClinicId()}`;

/** Starter catalogue so a new clinic (and the demo) has services out of the box. */
function seedCatalog(): ServiceCatalog {
  const lab = "scat_lab", img = "scat_img", con = "scat_con", grm = "scat_grm";
  return {
    categories: [
      { id: lab, name: "Laboratory" },
      { id: img, name: "Imaging" },
      { id: con, name: "Consultation" },
      { id: grm, name: "Grooming" },
    ],
    services: [
      { id: uid("svc"), category_id: lab, name: "CBC (Complete Blood Count)", price: 50 },
      { id: uid("svc"), category_id: lab, name: "Biochemistry panel", price: 65 },
      { id: uid("svc"), category_id: lab, name: "Urinalysis", price: 25 },
      { id: uid("svc"), category_id: lab, name: "Fecal exam", price: 20 },
      { id: uid("svc"), category_id: img, name: "X-Ray — single view", price: 40 },
      { id: uid("svc"), category_id: img, name: "X-Ray — two views", price: 70 },
      { id: uid("svc"), category_id: img, name: "Ultrasound — abdominal", price: 80 },
      { id: uid("svc"), category_id: con, name: "General consultation", price: 30 },
      { id: uid("svc"), category_id: con, name: "Follow-up visit", price: 20 },
      { id: uid("svc"), category_id: con, name: "Emergency consultation", price: 60 },
      { id: uid("svc"), category_id: grm, name: "Full grooming", price: 35 },
      { id: uid("svc"), category_id: grm, name: "Nail trim", price: 10 },
    ],
  };
}

export function getServiceCatalog(): ServiceCatalog {
  try {
    const raw = localStorage.getItem(keyName());
    if (raw) {
      const parsed = JSON.parse(raw) as ServiceCatalog;
      if (parsed && Array.isArray(parsed.categories) && Array.isArray(parsed.services)) return parsed;
    }
  } catch {
    /* ignore */
  }
  const fresh = seedCatalog();
  saveCatalog(fresh);
  return fresh;
}

function saveCatalog(c: ServiceCatalog) {
  try { localStorage.setItem(keyName(), JSON.stringify(c)); } catch { /* ignore */ }
}

/** Add a category. Returns the new category, or null if blank / a duplicate name. */
export function addServiceCategory(name: string): ServiceCategory | null {
  const clean = name.trim();
  if (!clean) return null;
  const c = getServiceCatalog();
  if (c.categories.some((x) => x.name.toLowerCase() === clean.toLowerCase())) return null;
  const cat: ServiceCategory = { id: uid("scat"), name: clean };
  c.categories.push(cat);
  saveCatalog(c);
  return cat;
}

/** Remove a category and all of its services. */
export function removeServiceCategory(id: string) {
  const c = getServiceCatalog();
  c.categories = c.categories.filter((x) => x.id !== id);
  c.services = c.services.filter((s) => s.category_id !== id);
  saveCatalog(c);
}

/** Add a service under a category. Returns the new service, or null if blank. */
export function addService(categoryId: string, name: string, price: number): Service | null {
  const clean = name.trim();
  if (!clean) return null;
  const c = getServiceCatalog();
  const svc: Service = { id: uid("svc"), category_id: categoryId, name: clean, price: Math.max(0, Math.round(price * 100) / 100) || 0 };
  c.services.push(svc);
  saveCatalog(c);
  return svc;
}

export function updateService(id: string, patch: Partial<Pick<Service, "name" | "price" | "category_id">>) {
  const c = getServiceCatalog();
  const s = c.services.find((x) => x.id === id);
  if (!s) return;
  if (patch.name !== undefined) s.name = patch.name.trim() || s.name;
  if (patch.price !== undefined) s.price = Math.max(0, Math.round(patch.price * 100) / 100) || 0;
  if (patch.category_id !== undefined) s.category_id = patch.category_id;
  saveCatalog(c);
}

export function removeService(id: string) {
  const c = getServiceCatalog();
  c.services = c.services.filter((x) => x.id !== id);
  saveCatalog(c);
}
