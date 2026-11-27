type SalonBrand = {
  cover: string;
  monogram: string;
  tagline: string;
};

const brands: Readonly<Partial<Record<string, SalonBrand>>> = {
  "studio-amaral": {
    cover: "/estabelecimentos/studio-amaral.webp",
    monogram: "SA",
    tagline: "Estilo que é seu",
  },
  "barbearia-lopes": {
    cover: "/estabelecimentos/barbearia-lopes.webp",
    monogram: "BL",
    tagline: "Corte, barba e tradição",
  },
  "clinica-estetica-lucca": {
    cover: "/estabelecimentos/clinica-estetica-lucca.webp",
    monogram: "CL",
    tagline: "Um tempo para cuidar de você",
  },
  "nutricao-marina-costa": {
    cover: "/estabelecimentos/nutricao-marina-costa.webp",
    monogram: "MC",
    tagline: "Sua rotina, seu ritmo",
  },
};

export function getSalonBrand(slug: string): SalonBrand | undefined {
  return Object.hasOwn(brands, slug) ? brands[slug] : undefined;
}
