import { useEffect } from "react";
import { Text, View } from "react-native";

import { shadows } from "../../lib/design/shadows";

export type ToastVariant = "success" | "error" | "info";

export type ToastProps = {
  variant: ToastVariant;
  message: string;
  visible: boolean;
  onDismiss: () => void;
  testID?: string;
};

const VARIANT_CLASSNAME: Record<ToastVariant, string> = {
  success: "bg-success-500",
  error: "bg-danger-500",
  info: "bg-ink",
};

const AUTO_DISMISS_MS = 3000;

export function Toast({ variant, message, visible, onDismiss, testID }: ToastProps) {
  useEffect(() => {
    if (!visible) {
      return;
    }

    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [visible, onDismiss]);

  if (!visible) {
    return null;
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      className={`rounded-2xl p-4 ${VARIANT_CLASSNAME[variant]}`}
      style={shadows.level2}
      testID={testID}
    >
      <Text className="text-sm font-sans-medium text-white">{message}</Text>
    </View>
  );
}
