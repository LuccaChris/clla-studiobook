export const salonCategories = {
  salon: "Salão",
  barbershop: "Barbearia",
  clinic: "Clínica de estética",
  nutrition: "Nutrição",
} as const;
export type SalonLayout = keyof typeof salonCategories;
export type DirectorySalon = { slug: string; name: string; address: string; layout: SalonLayout };
