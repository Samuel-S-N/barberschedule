// Pure and dependency-free: imported by the app (Metro) and by the Edge Functions (Deno). Sentry gets errors, never personal data.
type Json = { [key: string]: unknown };

const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g;
const withoutQuery = (url: string) => url.replace(/[?#].*$/, "");

export const scrubText = (text: string) => text.replace(EMAIL, "[email]");

export function scrubBreadcrumb<T>(crumb: T): T {
  const copy = { ...(crumb as Json) };

  if (typeof copy.message === "string") copy.message = scrubText(copy.message);
  if (copy.data && typeof copy.data === "object") {
    const data = { ...(copy.data as Json) };

    if (typeof data.url === "string") data.url = withoutQuery(data.url);
    copy.data = data;
  }

  return copy as T;
}

export function scrubEvent<T>(event: T): T {
  const copy = { ...(event as Json) };
  const request = copy.request as Json | undefined;
  const exception = copy.exception as { values?: Json[] } | undefined;

  delete copy.user;
  if (request) copy.request = { ...(request.method ? { method: request.method } : {}), ...(typeof request.url === "string" ? { url: withoutQuery(request.url) } : {}) };
  if (typeof copy.message === "string") copy.message = scrubText(copy.message);
  if (exception?.values) copy.exception = { ...exception, values: exception.values.map((entry) => ({ ...entry, value: typeof entry.value === "string" ? scrubText(entry.value) : entry.value })) };
  if (Array.isArray(copy.breadcrumbs)) copy.breadcrumbs = copy.breadcrumbs.map((crumb) => scrubBreadcrumb(crumb));

  return copy as T;
}
