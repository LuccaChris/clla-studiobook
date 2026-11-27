import { notFound } from "next/navigation";

import type { DirectorySalon } from "@/lib/salon-directory";

export type Salon = { slug: string; name: string; address: string; imageUrl: string };
export type Service = { id: string; name: string; priceInCents: number; minutes: number; preparation?: string };
export type SalonDetail = Omit<DirectorySalon, "slug"> & {
  description: string;
  imageUrl: string;
  services: Service[];
};

async function read<T>(path: string): Promise<T> {
  const base = process.env.STUDIOBOOK_API_URL ?? "http://127.0.0.1:5080";
  const response = await fetch(base + "/api/salons" + path, { cache: "no-store" });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("Falha ao consultar os salões.");
  return response.json();
}

export const getBarbershops = () => read<Salon[]>("");
export const getSalon = (slug: string) => read<SalonDetail>("/" + encodeURIComponent(slug));
