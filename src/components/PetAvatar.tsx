import { useState } from "react";
import { Dog, Cat, Bird, Rabbit, PawPrint } from "lucide-react";
import type { Pet, Species } from "@/types";
import { cn } from "@/lib/utils";
import { speciesPhoto } from "@/lib/petPhotos";

const ICONS: Record<Species, typeof PawPrint> = {
  dog: Dog,
  cat: Cat,
  bird: Bird,
  rabbit: Rabbit,
  horse: PawPrint,
  cow: PawPrint,
  other: PawPrint,
};

export function PetAvatar({
  pet,
  size = 56,
  className,
  photoFallback = false,
}: {
  pet: Pick<Pet, "species" | "photo_url" | "name">;
  size?: number;
  className?: string;
  /** When no uploaded photo exists, show a curated species photo instead of the icon. */
  photoFallback?: boolean;
}) {
  const Icon = ICONS[pet.species] ?? PawPrint;
  const [imgError, setImgError] = useState(false);

  // Real uploaded photo always wins.
  const src = pet.photo_url || (photoFallback && !imgError ? speciesPhoto(pet.species, Math.round(size * 2)) : null);

  if (src) {
    return (
      <img
        src={src}
        alt={pet.name}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setImgError(true)}
        className={cn("rounded-2xl object-cover bg-brand-50", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={cn("flex items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-sky-100 text-brand-700", className)}
      style={{ width: size, height: size }}
    >
      <Icon size={size * 0.5} strokeWidth={1.75} />
    </div>
  );
}
