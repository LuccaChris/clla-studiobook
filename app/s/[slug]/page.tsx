import { HeartPulse, Leaf, Scissors, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import Header from "@/components/header";
import ReservationForm from "@/components/reservation-form";
import { getSalon } from "@/data/barbershop";
import { salonCategories } from "@/lib/salon-directory";

const salonIcons = { salon: Sparkles, barbershop: Scissors, clinic: HeartPulse, nutrition: Leaf };

export default async function SalonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const salon = await getSalon(slug);
  const Icon = salonIcons[salon.layout] ?? Sparkles;
  const hasCover = salon.imageUrl.startsWith("https://") ||
    (salon.imageUrl.startsWith("/") && !salon.imageUrl.startsWith("//"));

  return (
    <>
      <Header />
      <main className="salon-profile" data-layout={salon.layout}>
        <div className="salon-profile-inner">
          <Link className="salon-back" href="/">Voltar aos meus salões</Link>
          <header className="salon-identity">
            {hasCover && (
              <div className="salon-cover">
                <Image src={salon.imageUrl} alt="" fill unoptimized />
              </div>
            )}
            <div className="salon-identity-text">
              <Icon aria-hidden size={36} />
              <p className="salon-category">{salonCategories[salon.layout]}</p>
              <h1>{salon.name}</h1>
              <p>{salon.description}</p>
              <p className="salon-address">{salon.address}</p>
            </div>
          </header>
          <section className="salon-reservation" aria-label="Agendamento">
            <ReservationForm slug={slug} services={salon.services} />
          </section>
          <Link className="salon-admin-link" href={"/s/" + encodeURIComponent(slug) + "/admin"}>
            Área administrativa
          </Link>
        </div>
      </main>
    </>
  );
}
