import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

// Text between `<handler>:` and the next sibling handler/closing of the mutation options.
function handler(source: string, name: "onError" | "onSuccess") {
  const start = source.indexOf(`${name}:`);
  expect(start).toBeGreaterThan(-1);
  const next = source.slice(start + 1).search(/\n {4}on(Error|Success):|\n {2}\}\);/);
  return source.slice(start, start + 1 + (next === -1 ? source.length : next));
}

const invalidates = /invalidateQueries\(\{ queryKey: \["available-slots"\] \}\)/;

describe("stale slot recovery", () => {
  const book = read("app/(customer)/(tabs)/book/review.tsx");
  const reschedule = read("app/(customer)/reschedule.tsx");

  it.each([
    ["book", book],
    ["reschedule", reschedule],
  ])("%s clears the selection and refetches slots on error", (_name, source) => {
    const onError = handler(source, "onError");
    expect(onError).toContain("setStartsAt(null)");
    expect(onError).toMatch(invalidates);
  });

  it("reschedule refetches slots on success", () => {
    expect(handler(reschedule, "onSuccess")).toMatch(invalidates);
  });
});
