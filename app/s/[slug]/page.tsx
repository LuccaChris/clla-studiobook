import { HeartPulse, Leaf, Scissors, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import Header from "@/components/header";
import ReservationForm from "@/components/reservation-form";
import { getSalon } from "@/data/barbershop";
import { getSalonBrand } from "@/lib/salon-brand";
import { salonCategories } from "@/lib/salon-directory";

const salonIcons = { salon: Sparkles, barbershop: Scissors, clinic: HeartPulse, nutrition: Leaf };

export default async function SalonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const salon = await getSalon(slug);
  const Icon = salonIcons[salon.layout] ?? Sparkles;
  const brand = getSalonBrand(slug);
  const cover = brand?.cover ?? salon.imageUrl;
  const hasCover = cover.startsWith("https://") ||
    (cover.startsWith("/") && !cover.startsWith("//"));

  return (
    <>
      <Header />
      <main className="salon-profile" data-layout={salon.layout} data-brand={brand ? slug : undefined}>
        <div className="salon-profile-inner">
          <Link className="salon-back" href="/">Voltar aos meus salões</Link>
          <header className="salon-identity">
            {hasCover && (
              <div className="salon-cover">
                <Image
                  src={cover}
                  alt=""
                  fill
                  preload={Boolean(brand)}
                  sizes="(max-width: 767px) 100vw, 50vw"
                  unoptimized
                />
              </div>
            )}
            <div className="salon-identity-text">
              {brand ? <span className="brand-monogram" aria-hidden>{brand.monogram}</span> : <Icon aria-hidden size={36} />}
              <p className="salon-category">{salonCategories[salon.layout]}</p>
              <h1>{salon.name}</h1>
              {brand && <p className="brand-tagline">{brand.tagline}</p>}
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
