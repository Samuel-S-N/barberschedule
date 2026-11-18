// The public link of a shop, from a template such as "https://{slug}.zencpro.app" (production) or
// "http://{slug}.localhost:8081" (development). Used for invite e-mail redirects.
export const DEFAULT_SHOP_URL_TEMPLATE = "https://{slug}.zencpro.app";

export function buildShopUrl(template: string, slug: string, path = "/"): string {
  if (!template.includes("{slug}")) throw new Error("SHOP_URL_TEMPLATE must contain {slug}");

  return `${template.replace("{slug}", slug).replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
