import { X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { colors } from "../../lib/design/colors";
import { Input } from "./Input";
import type { InputProps } from "./Input";

type SearchInputProps = Pick<InputProps, "label" | "value" | "onChangeText" | "testID" | "placeholder">;

// A text field with an X on the right (shown once there is text) that clears it.
export function SearchInput({ label, value, onChangeText, testID, placeholder }: SearchInputProps) {
  const { t } = useTranslation();

  return (
    <View>
      <Input autoCapitalize="none" autoCorrect={false} label={label} onChangeText={onChangeText} placeholder={placeholder} returnKeyType="search" testID={testID} value={value} />
      {value !== "" ? (
        <Pressable
          accessibilityLabel={t("common.clear")}
          accessibilityRole="button"
          className="absolute bottom-0 right-0 h-input-height w-11 items-center justify-center"
          hitSlop={4}
          onPress={() => onChangeText("")}
          testID={testID ? `${testID}-clear` : undefined}
        >
          <X color={colors.neutral[500]} size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}
