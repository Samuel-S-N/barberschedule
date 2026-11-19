import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const HUBS = ["app/(customer)/(tabs)/profile.tsx", "app/(owner)/settings.tsx", "app/(professional)/my-profile/index.tsx"];

// The first-sign-in pop-up and the Settings switch replaced part 4's notification card on the three profile hubs.
describe("profile hubs", () => {
  it.each(HUBS)("%s no longer shows the old notification card", (file) => {
    expect(readFileSync(join(root, file), "utf8")).not.toContain("NotificationPrompt");
  });

  it("the old card component is gone", () => {
    expect(existsSync(join(root, "src/features/notifications/NotificationPrompt.tsx"))).toBe(false);
  });
});
