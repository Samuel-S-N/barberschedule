import { CEP_TIMEOUT_MS, lookupCep, mergeCepResult } from "../../src/features/shops/cep";
import { EMPTY_ADDRESS } from "../../src/features/shops/address";
import { formatCepInput } from "../../src/lib/input-masks";

const viaCep = { bairro: "Bela Vista", cep: "01310-100", complemento: "", ibge: "3550308", localidade: "São Paulo", logradouro: "Avenida Paulista", uf: "SP" };
const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status });

describe("formatCepInput", () => {
  it.each([["0131", "0131"], ["01310100", "01310-100"], ["01310-100", "01310-100"], ["0131010099", "01310-100"], ["ab12", "12"], ["", ""]])("%j -> %j", (input, expected) => {
    expect(formatCepInput(input)).toBe(expected);
  });
});

describe("lookupCep", () => {
  it("returns the ViaCEP address", async () => {
    const fetchFn = jest.fn().mockResolvedValue(respond(200, viaCep));

    await expect(lookupCep("01310100", fetchFn)).resolves.toEqual({
      address: { city: "São Paulo", cityIbge: "3550308", district: "Bela Vista", state: "SP", street: "Avenida Paulista" },
      status: "found",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith("https://viacep.com.br/ws/01310100/json/", { signal: expect.any(AbortSignal) });
  });

  it("reports not-found without trying the fallback when ViaCEP says erro", async () => {
    const fetchFn = jest.fn().mockResolvedValue(respond(200, { erro: true }));

    await expect(lookupCep("99999999", fetchFn)).resolves.toEqual({ status: "not-found" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("falls back to BrasilAPI on a network error (no IBGE code there)", async () => {
    const fetchFn = jest.fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(respond(200, { city: "São Paulo", cep: "01310100", neighborhood: "Bela Vista", state: "SP", street: "Avenida Paulista" }));

    await expect(lookupCep("01310100", fetchFn)).resolves.toEqual({
      address: { city: "São Paulo", cityIbge: "", district: "Bela Vista", state: "SP", street: "Avenida Paulista" },
      status: "found",
    });
    expect(fetchFn).toHaveBeenLastCalledWith("https://brasilapi.com.br/api/cep/v2/01310100", { signal: expect.any(AbortSignal) });
  });

  it("falls back on a 5xx and treats a BrasilAPI 404 as not-found", async () => {
    const fetchFn = jest.fn().mockResolvedValueOnce(respond(503, {})).mockResolvedValueOnce(respond(404, { message: "CEP não encontrado" }));

    await expect(lookupCep("99999999", fetchFn)).resolves.toEqual({ status: "not-found" });
  });

  it("is unavailable when both services are down", async () => {
    const fetchFn = jest.fn().mockRejectedValue(new TypeError("network"));

    await expect(lookupCep("01310100", fetchFn)).resolves.toEqual({ status: "unavailable" });
  });
});

describe("lookupCep time limit", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  // A request that only ends when it is aborted, like a hung connection.
  const hang = (_url: string, init?: RequestInit) =>
    new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  const brasil = { city: "São Paulo", neighborhood: "Bela Vista", state: "SP", street: "Avenida Paulista" };

  it("gives up on a hung ViaCEP after the limit and returns the BrasilAPI address", async () => {
    const fetchFn = jest.fn((url: string, init?: RequestInit) => (url.includes("viacep") ? hang(url, init) : Promise.resolve(respond(200, brasil))));
    const result = lookupCep("01310100", fetchFn as never);

    await jest.advanceTimersByTimeAsync(CEP_TIMEOUT_MS);

    await expect(result).resolves.toEqual({ address: { city: "São Paulo", cityIbge: "", district: "Bela Vista", state: "SP", street: "Avenida Paulista" }, status: "found" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("is unavailable when both services hang (one limit each)", async () => {
    const fetchFn = jest.fn(hang);
    const result = lookupCep("01310100", fetchFn as never);

    await jest.advanceTimersByTimeAsync(CEP_TIMEOUT_MS * 2);

    await expect(result).resolves.toEqual({ status: "unavailable" });
  });

  it("also limits a fetch that ignores the abort signal", async () => {
    const fetchFn = jest.fn(() => new Promise<Response>(() => undefined));
    const result = lookupCep("01310100", fetchFn as never);

    await jest.advanceTimersByTimeAsync(CEP_TIMEOUT_MS * 2);

    await expect(result).resolves.toEqual({ status: "unavailable" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("leaves no timer behind after a fast answer", async () => {
    const fetchFn = jest.fn().mockResolvedValue(respond(200, viaCep));

    await lookupCep("01310100", fetchFn);

    expect(jest.getTimerCount()).toBe(0);
  });

  it("a ViaCEP erro does not go to the fallback", async () => {
    const fetchFn = jest.fn().mockResolvedValue(respond(200, { erro: true }));

    await expect(lookupCep("99999999", fetchFn)).resolves.toEqual({ status: "not-found" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("mergeCepResult", () => {
  const found = { city: "São Paulo", cityIbge: "3550308", district: "Bela Vista", state: "SP", street: "Avenida Paulista" };

  it("fills the lookup fields and never touches number or complement", () => {
    expect(mergeCepResult({ ...EMPTY_ADDRESS, cep: "01310-100", complement: "Sala 2", number: "1000" }, found)).toEqual({
      cep: "01310-100", city: "São Paulo", cityIbge: "3550308", complement: "Sala 2", district: "Bela Vista", number: "1000", state: "SP", street: "Avenida Paulista",
    });
  });

  it("replaces the IBGE code outright: a lookup that does not know it (BrasilAPI) must not leave another city's code behind", () => {
    const merged = mergeCepResult({ ...EMPTY_ADDRESS, city: "Recife", cityIbge: "2611606" }, { ...found, cityIbge: "" });

    expect(merged.city).toBe("São Paulo");
    expect(merged.cityIbge).toBe("");
  });

  it("keeps what the owner typed where the CEP has no value (a city-wide CEP has no street)", () => {
    const merged = mergeCepResult({ ...EMPTY_ADDRESS, street: "Rua que digitei" }, { ...found, district: "", street: "" });

    expect(merged.street).toBe("Rua que digitei");
    expect(merged.city).toBe("São Paulo");
  });
});
