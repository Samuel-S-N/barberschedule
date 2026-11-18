import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const app = JSON.parse(readFileSync(join(root, "app.json"), "utf8")).expo as {
  android: { adaptiveIcon: { backgroundColor: string; backgroundImage: string; foregroundImage: string; monochromeImage: string } };
  icon: string;
  web: { favicon: string };
};

// PNG header: width and height at bytes 16-24, colour type at byte 25 (2 = RGB, 6 = RGBA).
function png(path: string) {
  const header = readFileSync(join(root, path)).subarray(0, 26);

  return { colorType: header[25], height: header.readUInt32BE(20), width: header.readUInt32BE(16) };
}

describe("app icons (Zenc identity)", () => {
  it("uses a 1024 px iOS icon without an alpha channel", () => {
    expect(png(app.icon)).toEqual({ colorType: 2, height: 1024, width: 1024 });
  });

  it("uses 1024 px Android adaptive layers, with transparency on the foreground and monochrome ones", () => {
    const { adaptiveIcon } = app.android;

    expect(png(adaptiveIcon.foregroundImage)).toEqual({ colorType: 6, height: 1024, width: 1024 });
    expect(png(adaptiveIcon.monochromeImage)).toEqual({ colorType: 6, height: 1024, width: 1024 });
    expect(png(adaptiveIcon.backgroundImage)).toMatchObject({ height: 1024, width: 1024 });
  });

  it("paints the adaptive icon background with the Zenc ink, not the Expo template blue", () => {
    expect(app.android.adaptiveIcon.backgroundColor).toBe("#171412");
  });

  it("uses a 48 px favicon", () => {
    expect(png(app.web.favicon)).toMatchObject({ height: 48, width: 48 });
  });
});
