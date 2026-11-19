import type { ShopAddress } from "./address";

type Found = { city: string; cityIbge: string; district: string; state: string; street: string };
export type CepResult = { address: Found; status: "found" } | { status: "not-found" } | { status: "unavailable" };

// Free, keyless and CORS-enabled. Only the CEP (the business's public address) leaves the device.
const VIACEP = (cep: string) => `https://viacep.com.br/ws/${cep}/json/`;
const BRASILAPI = (cep: string) => `https://brasilapi.com.br/api/cep/v2/${cep}`;

export async function lookupCep(cep: string, fetchFn: typeof fetch = fetch): Promise<CepResult> {
  try {
    const response = await fetchFn(VIACEP(cep));

    if (response.ok) {
      const body = (await response.json()) as { bairro?: string; erro?: boolean | string; ibge?: string; localidade?: string; logradouro?: string; uf?: string };

      if (body.erro) return { status: "not-found" };

      return { address: { city: body.localidade ?? "", cityIbge: body.ibge ?? "", district: body.bairro ?? "", state: body.uf ?? "", street: body.logradouro ?? "" }, status: "found" };
    }
    if (response.status < 500) return { status: "not-found" };
  } catch {
    // network error: try the fallback below
  }

  try {
    const response = await fetchFn(BRASILAPI(cep));

    if (response.status === 404) return { status: "not-found" };
    if (!response.ok) return { status: "unavailable" };
    const body = (await response.json()) as { city?: string; neighborhood?: string; state?: string; street?: string };

    // BrasilAPI v2 has no IBGE code: the field stays empty after a fallback.
    return { address: { city: body.city ?? "", cityIbge: "", district: body.neighborhood ?? "", state: body.state ?? "", street: body.street ?? "" }, status: "found" };
  } catch {
    return { status: "unavailable" };
  }
}

export function mergeCepResult(current: ShopAddress, found: Found): ShopAddress {
  const pick = (next: string, previous: string) => next || previous;

  return {
    ...current,
    city: pick(found.city, current.city),
    // Replaced outright: a code the lookup does not know (BrasilAPI has none) must not stay next to a different city.
    cityIbge: found.cityIbge,
    district: pick(found.district, current.district),
    state: pick(found.state, current.state),
    street: pick(found.street, current.street),
  };
}
