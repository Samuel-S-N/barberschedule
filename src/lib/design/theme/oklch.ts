export type Triplet = [number, number, number];

export function hexToRgb(hex: string): Triplet {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Triplet;
}

export function rgbToHex(rgb: Triplet): string {
  const part = (channel: number) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0");

  return `#${rgb.map(part).join("").toUpperCase()}`;
}

const toLinear = (channel: number) => {
  const value = channel / 255;

  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (value: number) => 255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * Math.max(value, 0) ** (1 / 2.4) - 0.055);

export function rgbToOklch(rgb: Triplet): [number, number, number] {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  return [lightness, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360];
}

function oklchToLinear(L: number, C: number, h: number): Triplet {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const fitsSrgb = (linear: Triplet) => linear.every((value) => value >= -1e-6 && value <= 1 + 1e-6);

// Reduces chroma (bisection) until the colour is inside the sRGB gamut; lightness and hue are kept.
export function oklchToRgb(L: number, C: number, h: number): { rgb: Triplet; chroma: number } {
  let chroma = C;

  if (!fitsSrgb(oklchToLinear(L, C, h))) {
    let low = 0;
    let high = C;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (fitsSrgb(oklchToLinear(L, mid, h))) low = mid;
      else high = mid;
    }
    chroma = low;
  }

  return { chroma, rgb: oklchToLinear(L, chroma, h).map(fromLinear) as Triplet };
}

const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map(toLinear);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return (lighter + 0.05) / (darker + 0.05);
}
