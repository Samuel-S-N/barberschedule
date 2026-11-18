-- The address becomes structured so a future location-based directory does not have to ask businesses again. The old
-- free-text value is kept in address_street.
alter table public.shops
  add column address_cep text,
  add column address_street text,
  add column address_number text,
  add column address_complement text,
  add column address_district text,
  add column address_city text,
  add column address_state text,
  add column address_city_ibge text,
  add constraint shops_address_cep_fmt check (address_cep is null or address_cep ~ '^[0-9]{8}$'),
  add constraint shops_address_state_fmt check (address_state is null or address_state ~ '^[A-Z]{2}$'),
  add constraint shops_address_ibge_fmt check (address_city_ibge is null or address_city_ibge ~ '^[0-9]{7}$'),
  add constraint shops_address_street_len check (address_street is null or char_length(address_street) <= 120),
  add constraint shops_address_number_len check (address_number is null or char_length(address_number) <= 20),
  add constraint shops_address_complement_len check (address_complement is null or char_length(address_complement) <= 60),
  add constraint shops_address_district_len check (address_district is null or char_length(address_district) <= 60),
  add constraint shops_address_city_len check (address_city is null or char_length(address_city) <= 60);

update public.shops set address_street = left(btrim(address), 120) where address is not null and btrim(address) <> '';

alter table public.shops drop column address;

grant select (address_cep, address_street, address_number, address_complement, address_district, address_city, address_state, address_city_ibge)
  on table public.shops to anon, authenticated;
grant update (address_cep, address_street, address_number, address_complement, address_district, address_city, address_state, address_city_ibge)
  on table public.shops to authenticated;
