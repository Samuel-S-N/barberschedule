import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";

import { RadioBlock } from "../../../src/components/domain/RadioBlock";
import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { Button } from "../../../src/components/ui/Button";
import { Screen } from "../../../src/components/ui/Screen";
import type { LanguagePreference } from "../../../src/i18n/language";
import { useLanguagePreference } from "../../../src/i18n/use-language";
import { useBack } from "../../../src/lib/navigation/use-back";

const LANGUAGE_OPTIONS = ["device", "pt", "es", "en"] as const;

export default function LanguageScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const [saved, save] = useLanguagePreference();
  // Picking only marks the choice; the app language changes on Confirm.
  const [draft, setDraft] = useState<LanguagePreference>(saved);
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    setSaving(true);
    await save(draft);
    back();
  };

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.settings.language")} />
            <RadioBlock
              items={LANGUAGE_OPTIONS.map((key) => ({
                key,
                label: key === "device" ? t("profile.settings.languageDevice") : t(`profile.settings.languageNames.${key}`),
                onPress: () => setDraft(key),
                selected: draft === key,
              }))}
              testID="language-options"
            />
            <Button
              disabled={draft === saved || saving}
              label={t("profile.settings.languageConfirm")}
              onPress={() => void confirm()}
              testID="language-confirm"
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
