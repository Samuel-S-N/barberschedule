import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { G, Line, Path, Text as SvgText } from "react-native-svg";

import { colors } from "../../lib/design/colors";
import { barPath, labelPlacement, niceMax, yTicks } from "./geometry";

export type ColumnDatum = { key: string; label: string; value: number };

type Props = {
  accessibilityLabel: string;
  color?: string;
  data: ColumnDatum[];
  formatTick?: (value: number) => string;
  formatValue: (value: number) => string;
  height?: number;
  mutedColor?: string;
  testID: string;
};

const LEFT = 34;
const RIGHT = 4;
const TOP = 18;
const BOTTOM = 22;

export function ColumnChart({ accessibilityLabel, color = colors.primary[400], data, formatTick = String, formatValue, height = 160, mutedColor, testID }: Props) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotWidth = Math.max(0, width - LEFT - RIGHT);
  const plotHeight = height - TOP - BOTTOM;
  const slot = data.length ? plotWidth / data.length : 0;
  const barWidth = Math.min(24, Math.max(2, slot - 2));
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);
  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  const y = (value: number) => TOP + plotHeight - (value / max) * plotHeight;

  return (
    <View accessibilityLabel={accessibilityLabel} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} testID={testID}>
      <Text className="h-5 text-sm font-sans-medium text-neutral-700" style={{ fontVariant: ["tabular-nums"] }}>
        {selected !== null && data[selected] ? `${data[selected].label}: ${formatValue(data[selected].value)}` : ""}
      </Text>
      {width > 0 ? (
        <View style={{ height, width }}>
        <Svg height={height} width={width}>
          {yTicks(max).map((tick) => (
            <G key={tick}>
              <Line stroke={colors.neutral[200]} strokeWidth={1} x1={LEFT} x2={width - RIGHT} y1={y(tick)} y2={y(tick)} />
              <SvgText fill={colors.neutral[500]} fontSize={10} textAnchor="end" x={LEFT - 6} y={y(tick) + 3}>
                {formatTick(tick)}
              </SvgText>
            </G>
          ))}
          {data.map((d, i) => {
            const barHeight = (d.value / max) * plotHeight;
            const x = LEFT + i * slot + (slot - barWidth) / 2;

            return (
              <G key={d.key}>
                <Path d={barPath(x, y(d.value), barWidth, barHeight, 4)} fill={i === peak ? color : (mutedColor ?? color)} />
                {i % labelStep === 0 ? (
                  <SvgText fill={colors.neutral[500]} fontSize={10} textAnchor="middle" x={LEFT + i * slot + slot / 2} y={height - 6}>
                    {d.label}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
          {data[peak] && data[peak].value > 0
            ? (() => {
                const text = formatValue(data[peak].value);
                const place = labelPlacement(LEFT + peak * slot + slot / 2, width, LEFT, RIGHT, text.length * 6);

                return (
                  <SvgText fill={colors.neutral[700]} fontSize={10} fontWeight="600" textAnchor={place.anchor} x={place.x} y={y(data[peak].value) - 4}>
                    {text}
                  </SvgText>
                );
              })()
            : null}
        </Svg>
        {/* Hit targets are RN views over the SVG (wider than the mark, so thin bars stay tappable); SVG-level onPress is ignored by the DOM on web. */}
        {data.map((d, i) => (
          <Pressable
            accessibilityLabel={`${d.label}: ${formatValue(d.value)}`}
            accessibilityRole="button"
            key={d.key}
            onPress={() => setSelected(selected === i ? null : i)}
            style={{ height: plotHeight, left: LEFT + i * slot, position: "absolute", top: TOP, width: slot }}
            testID={`${testID}-bar-${i}`}
          />
        ))}
        </View>
      ) : null}
    </View>
  );
}
