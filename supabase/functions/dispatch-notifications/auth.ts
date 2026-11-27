// Only the scheduler may drain the outbox; the anon key ships inside the app. Two credentials are accepted: the service-role key
// (manual calls) and DISPATCH_TOKEN (the pg_cron job), so the service-role key never has to sit in Vault or in GitHub.
// Compared in constant time so the response time does not leak how much of a key matched.
function matches(authorization: string | null, key: string) {
  const expected = `Bearer ${key}`;
  if (!authorization || authorization.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= authorization.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function isServiceRequest(authorization: string | null, ...keys: Array<string | undefined>) {
  let ok = false;
  for (const key of keys) if (key && matches(authorization, key)) ok = true;
  return ok;
}

// A short or empty DISPATCH_TOKEN is a misconfiguration, not a credential.
export const dispatchToken = (value: string | undefined) => (value && value.length >= 32 ? value : undefined);
