import { toDomainError } from "../../src/lib/errors/domain-errors";

it("maps P0044 and P0045", () => {
  expect(toDomainError({ code: "P0044" }).code).toBe("SHOP_NOT_READY");
  expect(toDomainError({ code: "P0045" }).code).toBe("SHOP_SETUP_INCOMPLETE");
});
