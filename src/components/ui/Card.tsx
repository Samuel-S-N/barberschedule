import type { PropsWithChildren } from "react";
import { View } from "react-native";

import { shadows } from "../../lib/design/shadows";

export type CardVariant = "elevated" | "outlined" | "flat";

export type CardProps = PropsWithChildren<{
  variant?: CardVariant;
  testID?: string;
}>;

const VARIANT_CLASSNAME: Record<CardVariant, string> = {
  elevated: "bg-surface",
  outlined: "bg-surface border border-neutral-200",
  flat: "bg-neutral-50",
};

export function Card({ children, variant = "elevated", testID }: CardProps) {
  const style = variant === "elevated" ? shadows.level1 : undefined;

  return (
    <View
      className={`p-4 rounded-[20px] ${VARIANT_CLASSNAME[variant]}`}
      style={style}
      testID={testID}
    >
      {children}
    </View>
  );
}
