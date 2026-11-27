"use client";

import { CalendarDays, MoreHorizontal, Plus, Search, Star, Store, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { getSalonBrand } from "@/lib/salon-brand";
import { type DirectorySalon, salonCategories } from "@/lib/salon-directory";

type SavedSalon = DirectorySalon & { favorite?: boolean };
type RemovedSalon = { salon: SavedSalon; index: number };

const storageKey = "studiobook.directory";
const changeEvent = "studiobook:directory";
const emptyDirectory = "[]";

function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) callback();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(changeEvent, callback);

  return () => {
    window.removeEventListener("storage", onStorage);
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

function writeDirectory(list: SavedSalon[]) {
  localStorage.setItem(storageKey, JSON.stringify(list));
  window.dispatchEvent(new Event(changeEvent));
}

function parseDirectory(value: string): SavedSalon[] {
  try {
    const salons: unknown = JSON.parse(value);
    if (!Array.isArray(salons)) return [];

    return salons.filter((item): item is SavedSalon =>
      item && typeof item.slug === "string" && typeof item.name === "string" &&
      typeof item.address === "string" && Object.hasOwn(salonCategories, item.layout),
    );
  } catch {
    return [];
  }
}

function parsePhone(value: string) {
  let phone = value.trim();
  if (phone.startsWith("https://")) {
    try {
      const link = new URL(phone);
      if (link.username || link.password || link.port) return null;
      if (link.hostname === "wa.me" && /^\/[0-9]+\/?$/.test(link.pathname)) {
        phone = link.pathname.replaceAll("/", "");
      } else if (
        (link.hostname === "api.whatsapp.com" || link.hostname === "web.whatsapp.com") &&
        /^\/send\/?$/.test(link.pathname)
      ) {
        phone = link.searchParams.get("phone") ?? "";
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }

  if (!/^\+?[0-9\s().-]+$/.test(phone)) return null;
  const digits = phone.replace(/[^0-9]/g, "");
  if (/^[1-9][0-9]{9,10}$/.test(digits)) return digits;
  return /^55[1-9][0-9]{9,10}$/.test(digits) ? digits : null;
}

function AddSalon({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<DirectorySalon>();
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState("");
  const phoneInput = useRef<HTMLInputElement>(null);
  const searchRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    phoneInput.current?.focus();
    return () => searchRequest.current?.abort();
  }, []);

  function editPhone(next: string) {
    setPhone(next);
    setResult(undefined);
    setMessage("");
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (waiting) return;
    setResult(undefined);
    setMessage("");

    const number = parsePhone(phone);
    if (!number) {
      setMessage("Informe um telefone brasileiro com DDD ou cole um link direto do WhatsApp.");
      return;
    }

    setWaiting(true);
    const controller = new AbortController();
    searchRequest.current = controller;

    try {
      const query = new URLSearchParams({ phone: number });
      const response = await fetch("/api/salons/directory/lookup?" + query, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.status === 404) {
        setMessage("Nenhum estabelecimento encontrado com esse telefone.");
      } else if (response.status === 400) {
        setMessage("Informe um telefone válido com DDD.");
      } else if (response.ok) {
        const salon: DirectorySalon = await response.json();
        setResult(salon);
        setMessage(`Encontramos ${salon.name}. Confira os dados antes de adicionar.`);
      } else {
        setMessage("Não foi possível buscar agora. Tente novamente.");
      }
    } catch {
      if (!controller.signal.aborted) setMessage("Não foi possível buscar agora. Tente novamente.");
    } finally {
      if (!controller.signal.aborted) setWaiting(false);
    }
  }

  function add(salon: DirectorySalon) {
    const saved = parseDirectory(readDirectory());
    if (saved.some((item) => item.slug === salon.slug)) {
      setMessage("Esse estabelecimento já está na sua lista.");
      return;
    }

    try {
      writeDirectory([...saved, salon]);
      onClose();
    } catch {
      setMessage("Não foi possível salvar a lista neste navegador.");
    }
  }

  return (
    <section id="adicionar-local" className="space-y-4 rounded-2xl border bg-card p-5" aria-label="Adicionar local">
      <form className="studio-form space-y-2" onSubmit={search}>
        <label htmlFor="directory-phone">
          Telefone do estabelecimento
          <input
            id="directory-phone"
            ref={phoneInput}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            aria-describedby="directory-phone-hint"
            placeholder="(11) 00000-0000"
            maxLength={512}
            value={phone}
            required
            readOnly={waiting}
            onChange={(event) => editPhone(event.target.value)}
            onPaste={(event) => {
              if (waiting) return;
              const number = parsePhone(event.clipboardData.getData("text/plain"));
              if (!number) return;
              event.preventDefault();
              editPhone(number);
            }}
          />
        </label>
        <p id="directory-phone-hint" className="text-sm text-muted-foreground">
          Use o DDD, por exemplo (11) 00000-0000. Você também pode colar o número ou o link direto do WhatsApp.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <button className="inline-flex items-center gap-2" disabled={waiting || !phone.trim()}>
            <Search size={17} aria-hidden />
            {waiting ? "Buscando…" : "Buscar"}
          </button>
          <button type="button" onClick={onClose}>Fechar</button>
        </div>
      </form>
      <p role="status" className="text-sm">{message}</p>
      {result && (
        <div className="space-y-2 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">{salonCategories[result.layout]}</p>
          <p className="text-lg font-semibold">{result.name}</p>
          <p>{result.address}</p>
          <button className="min-h-11 rounded-lg bg-primary px-4 py-2 text-primary-foreground" onClick={() => add(result)}>
            Adicionar à lista
          </button>
        </div>
      )}
    </section>
  );
}

export default function ClientDirectory() {
  const directory = useSyncExternalStore(subscribe, readDirectory, () => emptyDirectory);
  const storedSalons = parseDirectory(directory);
  const salons = [
    ...storedSalons.filter((salon) => salon.favorite === true),
    ...storedSalons.filter((salon) => salon.favorite !== true),
  ];
  const [isAdding, setIsAdding] = useState(false);
  const [removed, setRemoved] = useState<RemovedSalon>();
  const [message, setMessage] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);

  function closeAdd() {
    setIsAdding(false);
    addButton.current?.focus();
  }

  function changeFavorite(slug: string) {
    const saved = parseDirectory(readDirectory());
    const salon = saved.find((item) => item.slug === slug);
    if (!salon) return;
    const favorite = salon.favorite !== true;

    try {
      writeDirectory(saved.map((item) => item.slug === slug ? { ...item, favorite } : item));
      setMessage(favorite ? `${salon.name} está nos favoritos.` : `${salon.name} saiu dos favoritos.`);
    } catch {
      setMessage("Não foi possível atualizar os favoritos neste navegador.");
    }
  }

  function remove(salon: SavedSalon) {
    const saved = parseDirectory(readDirectory());
    const index = saved.findIndex((item) => item.slug === salon.slug);
    if (index < 0) return;

    try {
      writeDirectory(saved.filter((item) => item.slug !== salon.slug));
      setRemoved({ salon: saved[index], index });
      setMessage(`${salon.name} saiu da sua lista. Seus agendamentos não foram alterados.`);
      addButton.current?.focus();
    } catch {
      setMessage("Não foi possível remover o local da lista neste navegador.");
    }
  }

  function undoRemove() {
    if (!removed) return;
    const saved = parseDirectory(readDirectory());

    try {
      if (!saved.some((item) => item.slug === removed.salon.slug)) {
        saved.splice(removed.index, 0, removed.salon);
        writeDirectory(saved);
      }
      setMessage(`${removed.salon.name} voltou para a lista.`);
      setRemoved(undefined);
      addButton.current?.focus();
    } catch {
      setMessage("Não foi possível recuperar o local neste navegador.");
    }
  }

  return (
    <>
      <button
        ref={addButton}
        type="button"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground"
        aria-expanded={isAdding}
        aria-controls={isAdding ? "adicionar-local" : undefined}
        onClick={() => setIsAdding((open) => !open)}
      >
        <Plus size={19} aria-hidden />
        Adicionar local
      </button>
      {isAdding && <AddSalon onClose={closeAdd} />}
      <div className={message || removed ? "flex flex-wrap items-center gap-x-3 gap-y-2" : "sr-only"}>
        <p role="status" className="text-sm">{message}</p>
        {removed && (
          <button type="button" className="min-h-11 text-sm font-medium underline" onClick={undoRemove}>
            Desfazer remoção
          </button>
        )}
      </div>
      {salons.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed px-6 py-12 text-center">
          <Store size={30} className="mx-auto text-muted-foreground" aria-hidden />
          <h2 className="text-xl font-semibold">Nenhum local adicionado</h2>
          <p>Adicione um estabelecimento pelo telefone para acessar os serviços e fazer agendamentos.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label="Locais salvos">
          {salons.map((salon) => {
            const brand = getSalonBrand(salon.slug);
            const address = `/s/${encodeURIComponent(salon.slug)}`;
            return (
              <li key={salon.slug}>
                <article className="directory-card flex h-full flex-col rounded-xl border bg-card">
                  {brand && (
                    <div className="directory-cover overflow-hidden rounded-t-xl">
                      <Image src={brand.cover} alt="" fill sizes="(max-width: 639px) 100vw, 420px" unoptimized />
                      <span className="directory-monogram" aria-hidden>{brand.monogram}</span>
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm text-muted-foreground">{salonCategories[salon.layout]}</p>
                        <h2 className="break-words text-lg font-semibold">
                          <Link href={address} className="hover:underline">{salon.name}</Link>
                        </h2>
                        <p className="break-words">{salon.address}</p>
                      </div>
                      <details
                        className="relative shrink-0"
                        name="opcoes-locais"
                        onKeyDown={(event) => {
                          if (event.key === "Escape" && event.currentTarget.open) {
                            event.currentTarget.open = false;
                            event.currentTarget.querySelector("summary")?.focus();
                          }
                        }}
                      >
                        <summary
                          className="grid min-h-11 min-w-11 cursor-pointer list-none place-items-center rounded-lg border hover:bg-muted [&::-webkit-details-marker]:hidden"
                          aria-label={`Opções de ${salon.name}`}
                        >
                          <MoreHorizontal size={21} aria-hidden />
                        </summary>
                        <div className="absolute end-0 top-full z-10 mt-2 w-48 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg">
                          <button
                            type="button"
                            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-muted"
                            onClick={(event) => {
                              const details = event.currentTarget.closest("details");
                              if (details) {
                                details.open = false;
                                details.querySelector("summary")?.focus();
                              }
                              changeFavorite(salon.slug);
                            }}
                          >
                            <Star size={16} aria-hidden />
                            {salon.favorite === true ? "Tirar dos favoritos" : "Favoritar"}
                          </button>
                          <button
                            type="button"
                            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-muted"
                            onClick={() => remove(salon)}
                          >
                            <Trash2 size={16} aria-hidden />
                            Remover local
                          </button>
                        </div>
                      </details>
                    </div>
                    {salon.favorite === true && (
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Star size={14} aria-hidden /> Favorito
                      </p>
                    )}
                    <Link
                      href={address + "#agendamento"}
                      aria-label={`Agendar em ${salon.name}`}
                      className="mt-auto inline-flex min-h-11 w-fit items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                    >
                      <CalendarDays size={17} aria-hidden />
                      Agendar
                    </Link>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
