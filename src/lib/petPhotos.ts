import type { Species } from "@/types";

/**
 * Curated royalty-free pet photography (Unsplash CDN) used as a *visual fallback*
 * only when a real patient photo hasn't been uploaded yet. Zero repo weight.
 * An uploaded `pet.photo_url` always takes precedence.
 */
const PHOTO_ID: Record<Species, string> = {
  dog: "1543466835-00a7907e9de1",
  cat: "1514888286974-6c03e2ca1dba",
  bird: "1552728089-57bdde30beb3",
  rabbit: "1585110396000-c9ffd4e4b308",
  horse: "1534773728080-33d31da27ae5",
  cow: "1546445317-29f4545e9d53",
  other: "1450778869180-41d0601e046e",
};

export function speciesPhoto(species: Species, w = 400): string {
  const id = PHOTO_ID[species] ?? PHOTO_ID.other;
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;
}

/** Warm hero image for the login marketing panel. */
export const HERO_PHOTO =
  "https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=1000&q=75";
