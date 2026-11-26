import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { ScreenHeader } from "../../components/domain/ScreenHeader";
import { Screen } from "../../components/ui/Screen";
import { useBack } from "../../lib/navigation/use-back";
import { LEGAL_DOCUMENTS } from "./index";
import type { LegalKind } from "./types";

// The three documents are Portuguese data. Other app languages show the same text with a short note in their own language.
export function LegalDocumentScreen({ kind }: { kind: LegalKind }) {
  const { i18n, t } = useTranslation();
  const back = useBack();
  const doc = LEGAL_DOCUMENTS[kind];

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[560px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={doc.title} />
            <Text className="text-sm font-sans text-neutral-500">{t("legal.version", { version: doc.version })}</Text>
            {i18n.language.startsWith("pt") ? null : <Text className="text-sm font-sans text-neutral-600" testID="legal-pt-note">{t("legal.ptOnlyNote")}</Text>}
            {doc.sections.map((section) => (
              <View className="gap-2" key={section.id} testID="legal-section">
                <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{section.title}</Text>
                {section.paragraphs.map((paragraph, index) => (
                  <Text className="text-base font-sans text-neutral-700" key={index}>{paragraph}</Text>
                ))}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
