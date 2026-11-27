import ClientDirectory from "@/components/client-directory";
import Header from "@/components/header";

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl space-y-6 px-5 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Meus salões</h1>
        <ClientDirectory />
      </main>
    </>
  );
}
