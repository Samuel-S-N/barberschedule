import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { RadioBlock } from "../../../src/components/domain/RadioBlock";
import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Screen } from "../../../src/components/ui/Screen";
import { buildExportFile, exportMyData } from "../../../src/features/account/api";
import { saveExportFile } from "../../../src/features/account/export-file";
import { errorMessage } from "../../../src/i18n/errors";
import { useLanguagePreference } from "../../../src/i18n/use-language";
import { useBack } from "../../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

const LANGUAGE_OPTIONS = ["device", "pt", "es", "en"] as const;

export default function SettingsScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const { supabase } = useSupabaseSession();
  const [language, chooseLanguage] = useLanguagePreference();
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const exportData = useMutation({
    mutationFn: async () => saveExportFile(buildExportFile(await exportMyData(supabase))),
    onError: (caught) => setFeedback({ message: errorMessage(caught, t as never, t("profile.exportError")), variant: "error" }),
    onSuccess: () => setFeedback({ message: t("profile.exportReady"), variant: "success" }),
  });

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.settings.title")} />
            <Text className="text-sm font-sans-medium text-neutral-600">{t("profile.settings.language")}</Text>
            <RadioBlock
              items={LANGUAGE_OPTIONS.map((key) => ({
                key,
                label: key === "device" ? t("profile.settings.languageDevice") : t(`profile.settings.languageNames.${key}`),
                onPress: () => void chooseLanguage(key),
                selected: language === key,
              }))}
              testID="language-options"
            />
            <Button disabled={exportData.isPending} label={t("profile.download")} onPress={() => exportData.mutate()} testID="profile-export" variant="outline" />
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
