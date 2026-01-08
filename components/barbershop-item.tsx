import Image from "next/image";
import { BarberShop } from "@/generated/prisma/client";

interface BarbershopItemProps {
    barbershop: BarberShop;
}

export const BarbershopItem = ({ barbershop }: BarbershopItemProps) => {
    return (
        <div className="relative min-h-[200px] min-w-[290px] overflow-hidden rounded-xl">
            <div className="absolute top-0 left-0 z-10 h-full w-full rounded-lg bg-linear-to-t from-black to-transparent" />
            <Image
                src={barbershop.imageUrl}
                alt={barbershop.nome}
                fill
                className="object-cover"
            />

            {/* Overlay */}
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/70 to-transparent" />

            {/* Conteúdo */}
            <div className="absolute bottom-0 left-0 right-0 z-20 p-4">
                <h3 className="text-background text-lg font-bold">
                    {barbershop.nome}
                </h3>
                <p className="text-background text-xs">
                    {barbershop.address}
                </p>
            </div>
        </div>
    );
};

export default BarbershopItem;