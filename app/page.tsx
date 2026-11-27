import ClientBookings from "@/components/client-bookings";
import ClientDirectory from "@/components/client-directory";
import Header from "@/components/header";

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl space-y-6 px-5 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Meus locais</h1>
        <ClientBookings compact />
        <ClientDirectory />
      </main>
    </>
  );
}
