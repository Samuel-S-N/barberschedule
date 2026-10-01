import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("review screen customer feedback", () => {
  const review = read("app/(customer)/(tabs)/book/review.tsx");

  it("explains a failed customer lookup and offers a retry", () => {
    expect(review).toContain('t("book.customerError")');
    expect(review).toContain("customers.refetch()");
    expect(review).toContain('t("common.tryAgain")');
  });

  it("explains a missing active customer", () => {
    expect(review).toContain('t("book.customerMissing")');
  });

  it.each(["en", "pt", "es"])("%s locale has both keys", (locale) => {
    const source = read(`src/i18n/locales/${locale}.ts`);
    expect(source).toMatch(/customerError:/);
    expect(source).toMatch(/customerMissing:/);
  });
});
