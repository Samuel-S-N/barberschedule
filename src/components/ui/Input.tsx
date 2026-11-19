import { createRef, useRef, useState } from "react";
import type { ComponentRef, Ref, RefObject } from "react";
import { Eye, EyeOff } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View } from "react-native";
import type { TextInputProps } from "react-native";

import { useColors } from "../../lib/design/theme/ThemeProvider";

type PassThroughProps = Pick<
  TextInputProps,
  "autoCapitalize" | "autoComplete" | "autoCorrect" | "keyboardType" | "maxLength" | "onSubmitEditing" | "returnKeyType" | "textContentType"
>;

// What a TextInput ref points to (the strict React Native types no longer let the component be used as its own instance type).
type TextInputRef = ComponentRef<typeof TextInput>;

export type InputProps = PassThroughProps & {
  inputRef?: Ref<TextInputRef>;
  next?: RefObject<TextInputRef | null>;
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
  inputRef,
  next,
  onSubmitEditing,
  returnKeyType,
  ...passThrough
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const { t } = useTranslation();
  const colors = useColors();
  const [revealed, setRevealed] = useState(false);
  const passwordField = Boolean(secureTextEntry);
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
      <View className="justify-center">
        <TextInput
          accessibilityLabel={label}
          className={`${heightClassName} rounded-xl px-4 font-sans text-base text-ink bg-surface ${borderClassName} ${passwordField ? "pr-12" : ""}`}
          {...passThrough}
          multiline={multiline}
          onSubmitEditing={next ? () => next.current?.focus() : onSubmitEditing}
          ref={inputRef}
          returnKeyType={next ? "next" : returnKeyType}
          submitBehavior={next ? "submit" : undefined}
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor="#9C8E7B"
          secureTextEntry={passwordField && !revealed}
          testID={testID}
          value={value}
        />
        {passwordField ? (
          <Pressable
            accessibilityLabel={revealed ? t("common.hidePassword") : t("common.showPassword")}
            accessibilityRole="button"
            className="absolute right-0 top-0 h-input-height w-12 items-center justify-center"
            hitSlop={4}
            onPress={() => setRevealed((current) => !current)}
            testID={testID ? `${testID}-toggle` : undefined}
          >
            {revealed ? <EyeOff color={colors.neutral[500]} size={20} /> : <Eye color={colors.neutral[500]} size={20} />}
          </Pressable>
        ) : null}
      </View>
      {error ? <Text className="text-sm font-sans text-danger-500">{error}</Text> : null}
    </View>
  );
}

// Chains single-line fields so the keyboard's next key walks down the form: spread field(i) on the i-th Input.
export function useFieldChain(count: number) {
  const refs = useRef<RefObject<TextInputRef | null>[]>([]);

  while (refs.current.length < count) refs.current.push(createRef<TextInputRef>());

  return (index: number) => ({ inputRef: refs.current[index], next: refs.current[index + 1] });
}
