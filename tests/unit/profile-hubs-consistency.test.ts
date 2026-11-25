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

  it.each(HUBS)("%s uses the same Settings, Privacy, About order and the Lock icon for Privacy", (file) => {
    const source = read(file);
    const at = (key: string) => source.indexOf(`key: "${key}"`);

    expect(at("settings")).toBeGreaterThan(-1);
    expect(at("settings")).toBeLessThan(at("privacy"));
    expect(at("privacy")).toBeLessThan(at("about"));
    expect(source).toContain('icon: Lock, key: "privacy"');
    expect(source).not.toContain("UserCog");
  });

  it.each(HUBS)("%s shows the install card before the avatar", (file) => {
    const source = read(file);

    expect(source.indexOf("<InstallPrompt />")).toBeGreaterThan(-1);
    expect(source.indexOf("<InstallPrompt />")).toBeLessThan(source.indexOf("<Avatar"));
  });
});
