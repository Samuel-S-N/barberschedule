-- Each business lives at <slug>.zencpro.app (decision 015). The slug is set once by create_shop (multi-shop part 2) and
-- printed on QR codes, so shop owners get no update grant on it. The default keeps every existing insert (tests, seed,
-- dev scripts) valid: 'shop-' + 8 hex characters matches the format and is not reserved.
alter table public.shops
  add column slug text not null default ('shop-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

-- Databases that were not reset: give the seed shop its readable slug.
update public.shops set slug = 'seed-shop' where id = 'a1000000-0000-0000-0000-000000000001';

alter table public.shops
  add constraint shops_slug_key unique (slug),
  add constraint shops_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'),
  add constraint shops_slug_not_reserved check (slug <> all (array[
    'www', 'app', 'api', 'admin', 'zenc', 'mail', 'email', 'smtp', 'static', 'assets', 'cdn',
    'docs', 'help', 'support', 'status', 'blog', 'dev', 'staging', 'test', 'login', 'auth'
  ]));

grant select (slug) on table public.shops to anon, authenticated;
