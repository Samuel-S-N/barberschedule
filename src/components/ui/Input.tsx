import { useState } from "react";
import { Text, TextInput, View } from "react-native";

export type InputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  testID?: string;
};

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry,
  multiline = false,
  testID,
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(error);
  const borderClassName = hasError
    ? "border-[1.5px] border-danger-500"
    : focused
      ? "border-[1.5px] border-primary-400"
      : "border border-neutral-200";
  const heightClassName = multiline ? "min-h-input-height py-3" : "h-input-height";

  return (
    <View className="gap-1">
      <Text className="text-sm font-sans-medium text-neutral-700">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        className={`${heightClassName} rounded-xl px-4 font-sans text-base text-ink bg-surface ${borderClassName}`}
        multiline={multiline}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor="#9C8E7B"
        secureTextEntry={secureTextEntry}
        testID={testID}
        value={value}
      />
      {error ? <Text className="text-sm font-sans text-danger-500">{error}</Text> : null}
    </View>
  );
}
