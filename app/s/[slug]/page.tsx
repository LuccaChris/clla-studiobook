import Link from "next/link";

import Header from "@/components/header";
import ReservationForm from "@/components/reservation-form";
import { getSalon } from "@/data/barbershop";

export default async function SalonPage({ params }: {params: Promise<{slug: string}>}) {
  const {slug} = await params;
  const salon = await getSalon(slug);
  return <><Header /><main className="mx-auto max-w-xl space-y-5 p-5">
    <h1 className="text-3xl font-bold">{salon.name}</h1>
    <p>{salon.address}</p><p>{salon.description}</p>
    <ReservationForm slug={slug} services={salon.services} />
    <Link className="inline-block text-sm underline" href={"/s/" + slug + "/admin"}>Área administrativa</Link>
  </main></>;
}
