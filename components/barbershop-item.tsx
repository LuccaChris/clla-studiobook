import Image from "next/image";
import Link from "next/link";

import type { Salon } from "@/data/barbershop";

export default function BarbershopItem({ barbershop }: { barbershop: Salon }) {
  return (
    <Link href={"/s/" + barbershop.slug} className="relative block min-h-52 overflow-hidden rounded-xl">
      <Image src={barbershop.imageUrl} alt="" fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        <h2 className="text-lg font-bold">{barbershop.name}</h2>
        <p>{barbershop.address}</p>
      </div>
    </Link>
  );
}
