"use client";

import { Plus, Search, Store } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useState, useSyncExternalStore } from "react";

import { getSalonBrand } from "@/lib/salon-brand";
import { type DirectorySalon, salonCategories } from "@/lib/salon-directory";

const storageKey = "studiobook.directory";
const changeEvent = "studiobook:directory";
const emptyDirectory = "[]";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changeEvent, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changeEvent, callback);
  };
}

function readDirectory() {
  try {
    return localStorage.getItem(storageKey) ?? emptyDirectory;
  } catch {
    return emptyDirectory;
  }
}

function parseDirectory(value: string): DirectorySalon[] {
  try {
    const salons: unknown = JSON.parse(value);
    if (!Array.isArray(salons)) return [];

    return salons.filter((item): item is DirectorySalon =>
      item && typeof item.slug === "string" && typeof item.name === "string" &&
      typeof item.address === "string" && Object.hasOwn(salonCategories, item.layout),
    );
  } catch {
    return [];
  }
}

function AddSalon({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<DirectorySalon>();
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState("");

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWaiting(true);
    setMessage("");
    setResult(undefined);

    try {
      const query = new URLSearchParams({ phone: phone.trim() });
      const response = await fetch("/api/salons/directory/lookup?" + query, { cache: "no-store" });

      if (response.status === 404) {
        setMessage("Nenhum estabelecimento encontrado com esse telefone.");
      } else if (response.status === 400) {
        setMessage("Informe um telefone válido com DDD.");
      } else if (response.ok) {
        setResult(await response.json());
      } else {
        setMessage("Não foi possível buscar agora. Tente novamente.");
      }
    } catch {
      setMessage("Não foi possível buscar agora. Tente novamente.");
    } finally {
      setWaiting(false);
    }
  }

  function add(salon: DirectorySalon) {
    const saved = parseDirectory(readDirectory());
    if (saved.some((item) => item.slug === salon.slug)) {
      setMessage("Esse estabelecimento já está na sua lista.");
      return;
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify([...saved, salon]));
      window.dispatchEvent(new Event(changeEvent));
      onClose();
    } catch {
      setMessage("Não foi possível salvar a lista neste navegador.");
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5" aria-label="Adicionar salão">
      <form className="studio-form space-y-2" onSubmit={search}>
        <label htmlFor="directory-phone">
          Telefone do estabelecimento
          <input
            id="directory-phone"
            type="tel"
            placeholder="(11) 00000-0000"
            maxLength={32}
            value={phone}
            required
            disabled={waiting}
            onChange={(event) => {
              setPhone(event.target.value);
              setResult(undefined);
              setMessage("");
            }}
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <button className="inline-flex items-center gap-2" disabled={waiting || !phone.trim()}>
            <Search size={17} aria-hidden />
            {waiting ? "Buscando…" : "Buscar"}
          </button>
          <button type="button" onClick={onClose}>Fechar</button>
        </div>
      </form>
      {result && (
        <div className="space-y-2 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">{salonCategories[result.layout]}</p>
          <p className="text-lg font-semibold">{result.name}</p>
          <p>{result.address}</p>
          <button className="rounded-lg bg-primary px-4 py-2 text-primary-foreground" onClick={() => add(result)}>
            Adicionar à lista
          </button>
        </div>
      )}
      <p role="status">{message}</p>
    </section>
  );
}

export default function ClientDirectory() {
  const directory = useSyncExternalStore(subscribe, readDirectory, () => emptyDirectory);
  const salons = parseDirectory(directory);
  const [isAdding, setIsAdding] = useState(false);

  return (
    <>
      {salons.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed px-6 py-12 text-center">
          <Store size={30} className="mx-auto text-muted-foreground" aria-hidden />
          <h2 className="text-xl font-semibold">Nenhum salão adicionado</h2>
          <p>Adicione um estabelecimento pelo telefone para acessar os serviços e fazer agendamentos.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {salons.map((salon) => {
            const brand = getSalonBrand(salon.slug);
            return (
              <li key={salon.slug}>
                <Link
                  href={"/s/" + encodeURIComponent(salon.slug)}
                  className="directory-card block h-full overflow-hidden rounded-xl border hover:border-foreground"
                >
                  {brand && (
                    <div className="directory-cover">
                      <Image src={brand.cover} alt="" fill sizes="(max-width: 639px) 100vw, 420px" unoptimized />
                      <span className="directory-monogram" aria-hidden>{brand.monogram}</span>
                    </div>
                  )}
                  <div className="space-y-1 p-4">
                    <p className="text-sm text-muted-foreground">{salonCategories[salon.layout]}</p>
                    <h2 className="text-lg font-semibold">{salon.name}</h2>
                    <p>{salon.address}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {isAdding ? (
        <AddSalon onClose={() => setIsAdding(false)} />
      ) : (
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground"
          onClick={() => setIsAdding(true)}
        >
          <Plus size={19} aria-hidden />
          Adicionar salão
        </button>
      )}
    </>
  );
}
