import type { ShopAddress } from "./address";

type Found = { city: string; cityIbge: string; district: string; state: string; street: string };
export type CepResult = { address: Found; status: "found" } | { status: "not-found" } | { status: "unavailable" };

// Free, keyless and CORS-enabled. Only the CEP (the business's public address) leaves the device.
const VIACEP = (cep: string) => `https://viacep.com.br/ws/${cep}/json/`;
const BRASILAPI = (cep: string) => `https://brasilapi.com.br/api/cep/v2/${cep}`;

// Each request gets its own limit: a service that never answers must not hold the lookup (nor skip the fallback). The abort covers
// the headers and the body read; the race also covers a fetch that ignores the signal; the timer never outlives the request.
export const CEP_TIMEOUT_MS = 3000;

function withLimit<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("CEP_TIMEOUT"));
    }, CEP_TIMEOUT_MS);
  });

  return Promise.race([run(controller.signal), limit]).finally(() => clearTimeout(timer));
}

type ViaCepBody = { bairro?: string; erro?: boolean | string; ibge?: string; localidade?: string; logradouro?: string; uf?: string };
type BrasilApiBody = { city?: string; neighborhood?: string; state?: string; street?: string };

async function getJson<T>(fetchFn: typeof fetch, url: string) {
  return withLimit(async (signal) => {
    const response = await fetchFn(url, { signal });

    return { body: response.ok ? ((await response.json()) as T) : null, ok: response.ok, status: response.status };
  });
}

export async function lookupCep(cep: string, fetchFn: typeof fetch = fetch): Promise<CepResult> {
  try {
    const { body, ok, status } = await getJson<ViaCepBody>(fetchFn, VIACEP(cep));

    if (ok && body) {
      if (body.erro) return { status: "not-found" };

      return { address: { city: body.localidade ?? "", cityIbge: body.ibge ?? "", district: body.bairro ?? "", state: body.uf ?? "", street: body.logradouro ?? "" }, status: "found" };
    }
    if (status < 500) return { status: "not-found" };
  } catch {
    // network error or time limit: try the fallback below
  }

  try {
    const { body, ok, status } = await getJson<BrasilApiBody>(fetchFn, BRASILAPI(cep));

    if (status === 404) return { status: "not-found" };
    if (!ok || !body) return { status: "unavailable" };

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
