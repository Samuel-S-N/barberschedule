export const RESERVED_SLUGS = [
  "www", "app", "api", "admin", "zenc", "mail", "email", "smtp", "static", "assets", "cdn",
  "docs", "help", "support", "status", "blog", "dev", "staging", "test", "login", "auth",
] as const;

// Same rule as the database check `shops_slug_format`.
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

// "barbeariadojoao.zencpro.app" -> "barbeariadojoao"; the bare domain, reserved names, nested subdomains and other hosts -> null.
export function resolveShopSlug(host: string, baseDomain: string): string | null {
  const hostname = host.trim().toLowerCase().replace(/:\d+$/, "");
  const base = baseDomain.trim().toLowerCase();
  if (!hostname || !base || !hostname.endsWith(`.${base}`)) return null;

  const label = hostname.slice(0, -(base.length + 1));
  if (label.includes(".") || !SLUG_PATTERN.test(label)) return null;

  return (RESERVED_SLUGS as readonly string[]).includes(label) ? null : label;
}

const bareHost = (host: string) => host.trim().toLowerCase().replace(/:\d+$/, "");

// A slug that follows the database rules (format and reserved names), or null. Trims and lower-cases.
export function validShopSlug(value: string | null | undefined): string | null {
  const slug = typeof value === "string" ? value.trim().toLowerCase() : "";

  return SLUG_PATTERN.test(slug) && !(RESERVED_SLUGS as readonly string[]).includes(slug) ? slug : null;
}

// Production (*.zencpro.app, the bare domain) and local development (*.localhost): the hosts where the shop is the subdomain.
export function isUnderBaseDomain(host: string, baseDomain: string): boolean {
  const hostname = bareHost(host);
  const base = baseDomain.trim().toLowerCase();

  return Boolean(base) && (hostname === base || hostname.endsWith(`.${base}`));
}

type CurrentSlugInput = { baseDomain: string; devSlug: string | undefined; host: string; remembered: string | null; search: string };

// Which shop a web page shows. Under the base domain only the host counts (the query string and the dev slug are ignored, so a crafted
// production link cannot pick a shop). On any other host (the hosted dev address, which has no per-shop subdomains) the shop is the
// `?shop=` query, else the one remembered for the tab, else EXPO_PUBLIC_DEV_SHOP_SLUG, else none.
export function resolveCurrentSlug({ baseDomain, devSlug, host, remembered, search }: CurrentSlugInput): string | null {
  if (isUnderBaseDomain(host, baseDomain)) return resolveShopSlug(host, baseDomain);

  return validShopSlug(new URLSearchParams(search).get("shop")) ?? validShopSlug(remembered) ?? validShopSlug(devSlug);
}

// Where a staff member lands after being sent to their own shop: the shop's subdomain on the same protocol and port, or, on a host that
// is not under the base domain, the same origin with `?shop=<slug>`.
export function shopUrl(slug: string, baseDomain: string, location: { hostname: string; port: string; protocol: string }) {
  const port = location.port ? `:${location.port}` : "";

  return isUnderBaseDomain(location.hostname, baseDomain)
    ? `${location.protocol}//${slug}.${baseDomain}${port}/`
    : `${location.protocol}//${location.hostname}${port}/?shop=${slug}`;
}
