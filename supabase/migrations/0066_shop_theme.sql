-- Per-shop colours (white-label theme). Null means the Zenc default; a null accent follows the primary.
-- Readable by everyone (the booking pages and sign-in will need it); writable only by the shop owner through the
-- existing shops_update_owner policy.
alter table public.shops
  add column theme_primary text,
  add column theme_accent text,
  add column theme_base text,
  add constraint shops_theme_primary_hex check (theme_primary is null or theme_primary ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint shops_theme_accent_hex check (theme_accent is null or theme_accent ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint shops_theme_base_hex check (theme_base is null or theme_base ~ '^#[0-9A-Fa-f]{6}$');

grant select (theme_primary, theme_accent, theme_base) on table public.shops to anon, authenticated;
grant update (theme_primary, theme_accent, theme_base) on table public.shops to authenticated;
