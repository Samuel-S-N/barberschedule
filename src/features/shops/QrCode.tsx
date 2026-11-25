import Svg, { Path, Rect } from "react-native-svg";

const QUIET_ZONE = 4;

// A whole number of pixels per module (quiet zone included) keeps the edges sharp: the largest such size that fits in `max`.
export function qrSize(modules: number, max: number): number {
  const side = modules + QUIET_ZONE * 2;

  return side * Math.max(1, Math.floor(max / side));
}

export function qrPath(matrix: boolean[][]): string {
  return matrix
    .flatMap((row, r) => row.flatMap((dark, c) => (dark ? [`M${c + QUIET_ZONE},${r + QUIET_ZONE}h1v1h-1z`] : [])))
    .join("");
}

// Black on white whatever the theme: a QR must keep its contrast to be scanned.
export function QrCode({ accessibilityLabel, matrix, size }: { accessibilityLabel: string; matrix: boolean[][]; size: number }) {
  const side = matrix.length + QUIET_ZONE * 2;

  return (
    <Svg accessibilityLabel={accessibilityLabel} accessibilityRole="image" height={size} testID="shop-link-qr" viewBox={`0 0 ${side} ${side}`} width={size}>
      <Rect fill="#FFFFFF" height={side} width={side} x={0} y={0} />
      <Path d={qrPath(matrix)} fill="#000000" />
    </Svg>
  );
}
