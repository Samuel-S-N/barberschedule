import assert from "node:assert/strict";
import test from "node:test";

import { assertEmailConfirmationsOn } from "./assert-hosted-auth.mjs";

test("passes when email signups need confirmation", () => {
  assertEmailConfirmationsOn({ external: { email: true }, mailer_autoconfirm: false });
});

test("fails when signups are auto-confirmed", () => {
  assert.throws(
    () => assertEmailConfirmationsOn({ external: { email: true }, mailer_autoconfirm: true }),
    /confirmations are OFF/,
  );
});

test("fails closed when the setting is missing", () => {
  assert.throws(() => assertEmailConfirmationsOn({}), /confirmations are OFF/);
});
