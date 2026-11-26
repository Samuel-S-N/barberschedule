import { shopUrl } from "./resolve-slug";

type Location = { hostname: string; port: string; protocol: string };

// The general link of a business: what customers type, scan or receive. The QR carries `url`, the screen prints `display`.
export function shopLink(slug: string, baseDomain: string, location?: Location): { display: string; url: string } {
  const url = location ? shopUrl(slug, baseDomain, location) : `https://${slug}.${baseDomain}/`;

  return { display: url.replace(/^https?:\/\//, "").replace(/\/$/, ""), url };
}
