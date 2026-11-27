import Image from "next/image";
import Link from "next/link";

export default function Header() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-5 border-b px-5 py-2">
      <Link href="/" className="inline-flex min-h-11 items-center">
        <Image src="/Logo.svg" alt="CLLA StudioBook" width={100} height={28} />
      </Link>
      <nav aria-label="Menu do cliente" className="flex flex-wrap items-center gap-x-4 text-sm sm:gap-x-6">
        <Link href="/" className="inline-flex min-h-11 items-center underline underline-offset-4">Meus locais</Link>
        <Link href="/agendamentos" className="inline-flex min-h-11 items-center underline underline-offset-4">Meus agendamentos</Link>
      </nav>
    </header>
  );
}
