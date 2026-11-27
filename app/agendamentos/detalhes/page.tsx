import type { Metadata } from "next";

import BookingDetails from "@/components/booking-details";
import Header from "@/components/header";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function AppointmentDetails() {
  return <>
    <Header />
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Detalhes do agendamento</h1>
      <BookingDetails />
    </main>
  </>;
}
