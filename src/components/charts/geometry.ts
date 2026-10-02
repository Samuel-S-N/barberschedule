// Dataviz reference categorical slots 1-5 (adjacent pairs incl. the donut wrap: normal-vision Delta E >= 19.6; weakest CVD pair yellow/magenta under tritan, 6.0,
// covered by the legend labels, percentages and the "Show data" list). The "other" slice uses neutral[500] (>= 20 from every neighbour).
export const SERVICE_SLICE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];

export function niceMax(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const fraction = value / magnitude;

  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
}

export function yTicks(max: number) {
  return [0, max / 2, max];
}

// Rounded top corners only; the bottom edge sits square on the baseline.
export function barPath(x: number, y: number, width: number, height: number, radius: number) {
  if (height <= 0 || width <= 0) return "";
  const r = Math.min(radius, width / 2, height);

  return `M ${x} ${y + height} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + width - r} ${y} Q ${x + width} ${y} ${x + width} ${y + r} L ${x + width} ${y + height} Z`;
}

type DonutOptions = { cx: number; cy: number; gapPx: number; inner: number; outer: number };

// Angles run clockwise from 12 o'clock. A 2px surface gap separates neighbouring slices.
export function donutArcs(values: number[], { cx, cy, gapPx, inner, outer }: DonutOptions) {
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return [];

  const point = (radius: number, angle: number) => `${cx + radius * Math.sin(angle)} ${cy - radius * Math.cos(angle)}`;
  const drawn = values.filter((v) => v > 0).length;
  const gap = drawn > 1 ? gapPx / outer : 0;
  let cursor = 0;

  return values.flatMap((value, index) => {
    if (value <= 0) return [];
    const sweep = (value / total) * Math.PI * 2;
    const start = cursor + gap / 2;
    const end = Math.min(cursor + sweep - gap / 2, start + Math.PI * 2 - 0.001);
    cursor += sweep;
    const large = end - start > Math.PI ? 1 : 0;

    return [{
      d: `M ${point(outer, start)} A ${outer} ${outer} 0 ${large} 1 ${point(outer, end)} L ${point(inner, end)} A ${inner} ${inner} 0 ${large} 0 ${point(inner, start)} Z`,
      index,
    }];
  });
}

// Keeps a value label inside the plot: centred when it fits, otherwise anchored to the nearer edge.
export function labelPlacement(center: number, width: number, left: number, right: number, labelWidth: number) {
  const half = labelWidth / 2;

  if (center + half > width - right) return { anchor: "end" as const, x: width - right };
  if (center - half < left) return { anchor: "start" as const, x: left };

  return { anchor: "middle" as const, x: center };
}

// Largest font (14-36) whose estimated text width stays within 90% of the donut hole.
export function centerFontSize(text: string, holeDiameter: number) {
  const fit = Math.floor((holeDiameter * 0.9) / (Math.max(text.length, 1) * 0.55));

  return Math.max(14, Math.min(36, fit));
}
