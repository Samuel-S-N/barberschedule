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

// Where a staff member lands after being sent to their own shop: the shop's origin on the same protocol and port.
export function shopUrl(slug: string, baseDomain: string, location: { port: string; protocol: string }) {
  return `${location.protocol}//${slug}.${baseDomain}${location.port ? `:${location.port}` : ""}/`;
}
