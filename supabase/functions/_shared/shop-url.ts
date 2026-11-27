// The public link of a shop, from a template such as "https://{slug}.zencpro.app" (production) or
// "http://{slug}.localhost:8081" (development), or "https://<dev worker>/?shop={slug}" (hosted dev). Used for invite e-mail redirects.
export const DEFAULT_SHOP_URL_TEMPLATE = "https://{slug}.zencpro.app";

export function buildShopUrl(template: string, slug: string, path = "/"): string {
  if (!template.includes("{slug}")) throw new Error("SHOP_URL_TEMPLATE must contain {slug}");

  // A template may end in a query string (the hosted dev address: https://<worker>/?shop={slug}); the path goes before it.
  const filled = template.replace("{slug}", slug);
  const queryAt = filled.indexOf("?");
  const base = queryAt === -1 ? filled : filled.slice(0, queryAt);
  const query = queryAt === -1 ? "" : filled.slice(queryAt);

  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}${query}`;
}
