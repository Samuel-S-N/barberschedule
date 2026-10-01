import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "../ui/Button";

export type ErrorRetryProps = { message: string; onRetry: () => void; testID?: string };

export function ErrorRetry({ message, onRetry, testID }: ErrorRetryProps) {
  const { t } = useTranslation();

  return (
    <View className="gap-2" testID={testID}>
      <Text className="text-sm font-sans text-danger-500">{message}</Text>
      <Button label={t("common.tryAgain")} onPress={onRetry} size="sm" variant="outline" />
    </View>
  );
}
