import Image from "next/image";
import Link from "next/link";

export default function Header() {
  return (
    <header className="flex items-center justify-between border-b px-5 py-4">
      <Link href="/"><Image src="/Logo.svg" alt="CLLA StudioBook" width={100} height={28} /></Link>
      <Link href="/" className="text-sm underline">Meus salões</Link>
    </header>
  );
}
