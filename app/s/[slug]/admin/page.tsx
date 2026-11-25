import AdminPanel from "@/components/admin-panel";
import Header from "@/components/header";
import { getSalon } from "@/data/barbershop";

export default async function AdminPage({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params;
  const salon = await getSalon(slug);
  return <><Header /><main className="mx-auto max-w-xl space-y-5 p-5">
    <h1 className="text-2xl font-bold">Administração · {salon.name}</h1>
    <AdminPanel key={slug} slug={slug} />
  </main></>;
}
