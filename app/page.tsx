import BarbershopItem from "@/components/barbershop-item";
import Header from "@/components/header";
import { getBarbershops } from "@/data/barbershop";

export default async function Home() {
  const salons = await getBarbershops();
  return <><Header /><main className="mx-auto max-w-5xl space-y-5 p-5">
    <h1 className="text-2xl font-bold">Escolha seu salão</h1>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {salons.map(salon => <BarbershopItem key={salon.slug} barbershop={salon} />)}
    </div>
    {!salons.length && <p>Nenhum salão cadastrado.</p>}
  </main></>;
}
