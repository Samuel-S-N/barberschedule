import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { ColorWheelPopup } from "./ColorWheelPopup";

// A code format, not a sentence: the same in every language.
const HEX_FORMAT = "#RRGGBB";

export type ColorFieldProps = {
  error?: string;
  hint?: string;
  inputLabel?: string;
  label: string;
  onChange: (value: string) => void;
  presets: readonly string[];
  testID: string;
  value: string;
};

// Swatches plus a hex field. The swatch colours are data (the choices on offer), so they are the one place a literal
// colour goes into a style.
export function ColorField({ error, hint, inputLabel, label, onChange, presets, testID, value }: ColorFieldProps) {
  const { t } = useTranslation();
  const [wheelOpen, setWheelOpen] = useState(false);
  const typed = value.trim().replace(/^#?/, "#").toUpperCase();
  const wheelStart = /^#[0-9A-F]{6}$/.test(typed) ? typed : presets[0];

  return (
    <View className="gap-2" testID={testID}>
      <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink">{label}</Text>
      {hint ? <Text className="text-sm text-neutral-600">{hint}</Text> : null}
      <View className="flex-row flex-wrap gap-2">
        {presets.map((hex) => {
          const selected = typed === hex;

          return (
            <Pressable
              accessibilityLabel={hex}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`h-11 w-11 rounded-full border-2 ${selected ? "border-ink" : "border-neutral-200"}`}
              key={hex}
              onPress={() => onChange(hex)}
              style={{ backgroundColor: hex }}
              testID={`${testID}-swatch-${hex}`}
            />
          );
        })}
        <Button label={t("owner.appearance.otherColor")} onPress={() => setWheelOpen(true)} size="sm" testID={`${testID}-other`} variant="outline" />
      </View>
      <Input
        autoCapitalize="characters"
        autoCorrect={false}
        error={error}
        label={inputLabel ?? label}
        maxLength={7}
        onChangeText={onChange}
        placeholder={HEX_FORMAT}
        testID={`${testID}-input`}
        value={value}
      />
      <ColorWheelPopup onChange={onChange} onClose={() => setWheelOpen(false)} title={label} value={wheelStart} visible={wheelOpen} />
    </View>
  );
}
