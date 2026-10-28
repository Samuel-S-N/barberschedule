// Only the scheduler, holding the service-role key, may drain the outbox; the anon key ships inside the app.
// Compared in constant time so the response time does not leak how much of the key matched.
export function isServiceRequest(authorization: string | null, serviceKey: string) {
  const expected = `Bearer ${serviceKey}`;
  if (!authorization || authorization.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= authorization.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
