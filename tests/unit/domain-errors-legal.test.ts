import { toDomainError } from "../../src/lib/errors/domain-errors";

it("maps P0046 to LEGAL_CONSENT_INVALID", () => {
  expect(toDomainError({ code: "P0046" }).code).toBe("LEGAL_CONSENT_INVALID");
});
