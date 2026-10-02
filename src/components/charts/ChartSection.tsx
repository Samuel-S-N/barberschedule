import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { Card } from "../ui/Card";

type Props = { children: ReactNode; rows: Array<{ label: string; value: string }>; testID: string; title: string };

export function ChartSection({ children, rows, testID, title }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Card testID={testID}>
      <View className="gap-3">
        <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{title}</Text>
        {children}
        <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} testID={`${testID}-toggle`}>
          <Text className="text-sm font-sans-semibold text-primary-600">{open ? t("barber.reports.hideData") : t("barber.reports.showData")}</Text>
        </Pressable>
        {open ? (
          <View className="gap-1">
            {rows.map((row) => (
              <View className="flex-row justify-between" key={row.label}>
                <Text className="text-sm font-sans text-neutral-700">{row.label}</Text>
                <Text className="text-sm font-sans-medium text-ink" style={{ fontVariant: ["tabular-nums"] }}>{row.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
