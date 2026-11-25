import { resolveAuthRedirect } from "../../src/features/auth/session";

it.each(["privacidade", "termos", "contrato"])("lets a signed-out visitor read /%s", (segment) => {
  expect(resolveAuthRedirect({ profileRole: null, segments: [segment], session: null })).toBeNull();
});
