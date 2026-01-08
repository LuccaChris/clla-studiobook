import Image from "next/image";

import BookingItem from "@/components/booking-item";
import Header from "@/components/header";
import { getBarbershops } from "@/data/barbershop";
import banner from "@/public/banner.png";
import BarbershopItem from "@/components/barbershop-item";
import { PageContainer, PageSectionContent, PageSectionScroller, PageSectionTitle } from "@/components/ui/page";

export default async function Home() {
  const barbershops = await getBarbershops()

  return (
    <div>
      <Header />
      <PageContainer>
        <div className="px-4">
          <Image
            src={banner}
            alt="Agendo nos melhores"
            sizes="100vw"
            className="w-full h-auto"
            priority
          />
        </div>

        <PageSectionContent>
          <PageSectionTitle>Agendamentos</PageSectionTitle>
          <BookingItem />
        </PageSectionContent>

        <PageContainer>
          <PageSectionTitle>Barbearias</PageSectionTitle>
          <PageSectionScroller>
            {barbershops.map((barbershop) => (
              <BarbershopItem key={barbershop.id} barbershop={barbershop} />
            ))}
          </PageSectionScroller>
        </PageContainer>

      </PageContainer>
    </div>

  );
}