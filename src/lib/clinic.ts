import type { Doctor, ServiceType } from "@/types";

export const DOCTORS: Doctor[] = [
  { id: "doc-sarah", name: "Dr. Sarah Mansour", specialty: "General & Surgery", services: ["consultation", "vaccination", "surgery", "telehealth"] },
  { id: "doc-omar", name: "Dr. Omar Haddad", specialty: "Internal Medicine", services: ["consultation", "vaccination", "telehealth", "home"] },
  { id: "doc-lina", name: "Dr. Lina Aziz", specialty: "Vaccination & Wellness", services: ["consultation", "vaccination", "home"] },
];

export const SERVICES: ServiceType[] = ["consultation", "vaccination", "surgery", "telehealth", "home"];

export const SLOT_MINUTES = 20;
export const CLINIC_OPEN_HOUR = 9;
export const CLINIC_CLOSE_HOUR = 17;

/** Color theme per service — used by the master calendar. */
export const SERVICE_COLOR: Record<ServiceType, { dot: string; bg: string; text: string; ring: string }> = {
  surgery: { dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700", ring: "ring-red-200" },
  consultation: { dot: "bg-brand-500", bg: "bg-brand-50", text: "text-brand-700", ring: "ring-brand-200" },
  vaccination: { dot: "bg-brand-500", bg: "bg-brand-50", text: "text-brand-700", ring: "ring-brand-200" },
  telehealth: { dot: "bg-sky-500", bg: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-200" },
  home: { dot: "bg-purple-500", bg: "bg-purple-50", text: "text-purple-700", ring: "ring-purple-200" },
};

export function doctorsForService(service: ServiceType): Doctor[] {
  return DOCTORS.filter((d) => d.services.includes(service));
}

export function doctorById(id: string): Doctor | undefined {
  return DOCTORS.find((d) => d.id === id);
}
