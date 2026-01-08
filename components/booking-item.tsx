import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Avatar,
    AvatarImage,
    AvatarFallback,
} from "@/components/ui/avatar";

const BookingItem = () => {
    return (
        <Card className="flex w-full cursor-pointer flex-row items-center justify-between p-0">
            {/* Esquerda */}
            <div className="flex flex-1 flex-col gap-4 p-4">
                <Badge>Confirmado</Badge>

                <div className="flex flex-col gap-2">
                    <p className="font-bold">Corte de Cabelo</p>

                    <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                            <AvatarImage src="https://utfs.io/f/2f9278ba-3975-4026-af46-64af78864494-16u.png" />
                            <AvatarFallback>BA</AvatarFallback>
                        </Avatar>

                        <p className="text-sm font-medium">Barbearia Amaral</p>
                    </div>
                </div>
            </div>

            {/* Direita */}
            <div className="flex h-full flex-col items-center justify-center border-l px-4 w-[106px]">
                <p className="text-xs captalize">Fevereiro</p>
                <p className="text-2xl ">13</p>
                <p className="text-xs ">9:45</p>
                {/* futuro: data / hora / ícone */}
            </div>
        </Card>
    );
};

export default BookingItem;