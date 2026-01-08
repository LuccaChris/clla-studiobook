import { prisma } from "@/lib/prisma";

export const getBarbershops = async () => {
  const barbershops = await prisma.barberShop.findMany();
  return barbershops;
};
