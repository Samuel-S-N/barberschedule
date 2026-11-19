import { existsSync, readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..", "..", "public");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as {
  background_color: string; display: string; icons: Array<{ purpose: string; sizes: string; src: string; type: string }>;
  lang: string; name: string; orientation: string; scope: string; short_name: string; start_url: string; theme_color: string;
};

// A PNG starts with an 8-byte signature, then the IHDR chunk: width and height are the two 32-bit numbers at bytes 16 and 20.
function pngSize(file: string) {
  const bytes = readFileSync(file);

  return { height: bytes.readUInt32BE(20), width: bytes.readUInt32BE(16) };
}

describe("public/manifest.json", () => {
  it("names the app Zenc and opens it standalone at the root", () => {
    expect(manifest).toMatchObject({
      background_color: "#171412", display: "standalone", lang: "pt-BR", name: "Zenc", orientation: "portrait",
      scope: "/", short_name: "Zenc", start_url: "/", theme_color: "#171412",
    });
  });

  it("declares 192 and 512 icons, each as any and as maskable", () => {
    const declared = manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`).sort();

    expect(declared).toEqual(["192x192:any", "192x192:maskable", "512x512:any", "512x512:maskable"]);
  });

  it.each(manifest.icons)("$src exists and has the declared size", (icon) => {
    const file = join(root, icon.src.replace(/^\//, ""));
    const [width, height] = icon.sizes.split("x").map(Number);

    expect(existsSync(file)).toBe(true);
    expect(icon.type).toBe("image/png");
    expect(pngSize(file)).toEqual({ height, width });
  });

  it("ships the 180px Apple touch icon", () => {
    expect(pngSize(join(root, "icons", "apple-touch-icon.png"))).toEqual({ height: 180, width: 180 });
  });
});
