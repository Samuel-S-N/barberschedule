import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const HUBS = ["app/(customer)/(tabs)/profile.tsx", "app/(owner)/settings.tsx", "app/(professional)/my-profile/index.tsx"];
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("profile hubs", () => {
  it.each(HUBS)("%s has no sign-out button (it lives in Settings)", (file) => {
    const source = read(file);

    expect(source).not.toContain("profile-signout");
    expect(source).not.toContain("signOut(");
  });
});
