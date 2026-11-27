import ClientBookings from "@/components/client-bookings";
import Header from "@/components/header";

export default function Appointments() {
  return <>
    <Header />
    <main className="mx-auto max-w-4xl space-y-6 px-5 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Meus agendamentos</h1>
      <ClientBookings />
    </main>
  </>;
}
