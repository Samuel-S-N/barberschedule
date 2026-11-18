export type ShopAddressColumns = {
  address_cep: string | null;
  address_city: string | null;
  address_city_ibge: string | null;
  address_complement: string | null;
  address_district: string | null;
  address_number: string | null;
  address_state: string | null;
  address_street: string | null;
};

// The form's shape: strings, "" when a part is missing.
export type ShopAddress = { cep: string; city: string; cityIbge: string; complement: string; district: string; number: string; state: string; street: string };

export const EMPTY_ADDRESS: ShopAddress = { cep: "", city: "", cityIbge: "", complement: "", district: "", number: "", state: "", street: "" };

const text = (value: string | null | undefined) => value?.trim() ?? "";
const join = (parts: string[], separator: string) => parts.filter(Boolean).join(separator);
const maskCep = (digits: string) => (digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5, 8)}` : digits);

// "Rua X, 123 - Sala 2 · Centro, São Paulo - SP", skipping whatever is missing.
export function formatShopAddress(shop: Partial<ShopAddressColumns>): string {
  const street = join([join([text(shop.address_street), text(shop.address_number)], ", "), text(shop.address_complement)], " - ");
  const locality = join([text(shop.address_district), join([text(shop.address_city), text(shop.address_state)], " - ")], ", ");

  return join([street, locality], " · ");
}

export function addressFromColumns(shop: Partial<ShopAddressColumns>): ShopAddress {
  return {
    cep: maskCep(text(shop.address_cep)),
    city: text(shop.address_city),
    cityIbge: text(shop.address_city_ibge),
    complement: text(shop.address_complement),
    district: text(shop.address_district),
    number: text(shop.address_number),
    state: text(shop.address_state),
    street: text(shop.address_street),
  };
}

export function addressToColumns(address: ShopAddress): ShopAddressColumns {
  const clean = (value: string) => value.trim() || null;

  return {
    address_cep: address.cep.replace(/\D/g, "") || null,
    address_city: clean(address.city),
    address_city_ibge: address.cityIbge.replace(/\D/g, "") || null,
    address_complement: clean(address.complement),
    address_district: clean(address.district),
    address_number: clean(address.number),
    address_state: clean(address.state)?.toUpperCase() ?? null,
    address_street: clean(address.street),
  };
}
