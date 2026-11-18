import { addressFromColumns, addressToColumns, formatShopAddress } from "../../src/features/shops/address";

const full = {
  address_cep: "01310100", address_city: "São Paulo", address_city_ibge: "3550308", address_complement: "Sala 2",
  address_district: "Centro", address_number: "123", address_state: "SP", address_street: "Rua X",
};

describe("formatShopAddress", () => {
  it("builds the single line", () => {
    expect(formatShopAddress(full)).toBe("Rua X, 123 - Sala 2 · Centro, São Paulo - SP");
  });

  it.each([
    ["no complement", { ...full, address_complement: null }, "Rua X, 123 · Centro, São Paulo - SP"],
    ["no number", { ...full, address_number: null, address_complement: null }, "Rua X · Centro, São Paulo - SP"],
    ["no district", { ...full, address_district: null }, "Rua X, 123 - Sala 2 · São Paulo - SP"],
    ["no street (a city-wide CEP)", { ...full, address_street: null, address_number: null, address_complement: null }, "Centro, São Paulo - SP"],
    ["only city and state", { address_city: "Recife", address_state: "PE" }, "Recife - PE"],
    ["blanks are ignored", { ...full, address_street: "  ", address_complement: "" }, "123 · Centro, São Paulo - SP"],
    ["nothing at all", {}, ""],
  ])("%s", (_name, shop, expected) => {
    expect(formatShopAddress(shop)).toBe(expected);
  });
});

describe("address column mapping", () => {
  it("turns blank form fields into nulls, keeps digits of the CEP and upper-cases the UF", () => {
    expect(addressToColumns({ cep: "01310-100", city: " São Paulo ", cityIbge: "", complement: "", district: "Centro", number: "123", state: "sp", street: "Rua X" })).toEqual({
      address_cep: "01310100", address_city: "São Paulo", address_city_ibge: null, address_complement: null,
      address_district: "Centro", address_number: "123", address_state: "SP", address_street: "Rua X",
    });
  });

  it("formats the stored CEP back as 00000-000 for the form", () => {
    expect(addressFromColumns(full)).toEqual({ cep: "01310-100", city: "São Paulo", cityIbge: "3550308", complement: "Sala 2", district: "Centro", number: "123", state: "SP", street: "Rua X" });
    expect(addressFromColumns({}).cep).toBe("");
  });
});
