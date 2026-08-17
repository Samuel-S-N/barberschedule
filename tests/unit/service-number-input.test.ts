import { parseIntegerInput } from "../../src/features/services/validation";

describe("service number input parsing", () => {
  it("accepts a complete integer string", () => {
    expect(parseIntegerInput("30", "Duration")).toBe(30);
  });

  it("rejects malformed numeric strings", () => {
    expect(() => parseIntegerInput("1.9", "Duration")).toThrow(
      "Duration must be a whole number.",
    );
    expect(() => parseIntegerInput("30abc", "Price")).toThrow(
      "Price must be a whole number.",
    );
  });
});
