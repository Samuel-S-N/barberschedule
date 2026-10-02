import type { LucideIcon } from "lucide-react-native";
import { Text, View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";

import { colors } from "../../lib/design/colors";
import { donutArcs } from "./geometry";

export type DonutSlice = { color: string; icon?: LucideIcon; key: string; label: string; value: number };

type Props = { centerLabel: string; centerValue: string; size?: number; slices: DonutSlice[]; testID: string };

export function DonutChart({ centerLabel, centerValue, size = 180, slices, testID }: Props) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const outer = size / 2 - 2;
  const inner = outer * 0.62;
  const arcs = donutArcs(slices.map((s) => s.value), { cx: size / 2, cy: size / 2, gapPx: 2, inner, outer });

  return (
    <View className="items-center gap-4" testID={testID}>
      <View style={{ height: size, width: size }}>
        <Svg height={size} width={size}>
          {total === 0 ? (
            <Circle cx={size / 2} cy={size / 2} fill="none" r={(outer + inner) / 2} stroke={colors.neutral[200]} strokeWidth={outer - inner} />
          ) : (
            <G>{arcs.map((arc) => <Path d={arc.d} fill={slices[arc.index].color} key={slices[arc.index].key} testID={`${testID}-slice-${slices[arc.index].key}`} />)}</G>
          )}
        </Svg>
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <Text className="text-4xl font-display-bold text-ink">{centerValue}</Text>
          <Text className="text-xs font-sans text-neutral-600">{centerLabel}</Text>
        </View>
      </View>
      <View className="w-full gap-2">
        {slices.map((slice) => {
          const Icon = slice.icon;

          return (
            <View className="flex-row items-center gap-2" key={slice.key}>
              <View className="h-3 w-3 rounded-full" style={{ backgroundColor: slice.color }} />
              {Icon ? <Icon color={colors.neutral[600]} size={16} /> : null}
              <Text className="flex-1 text-sm font-sans text-ink">{slice.label}</Text>
              <Text className="text-sm font-sans-medium text-neutral-700" style={{ fontVariant: ["tabular-nums"] }}>
                {total > 0 ? `${slice.value} · ${Math.round((slice.value / total) * 100)}%` : String(slice.value)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
