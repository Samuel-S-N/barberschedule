import { useRouter } from "expo-router";
import { SafeAreaView, ScrollView, Text, View } from "react-native";

import { Button } from "../src/components/ui/Button";
import { LEGAL_SECTIONS, TERMS_VERSION } from "../src/features/account/legal";

export default function LegalScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">Terms and privacy</Text>
            <Text className="text-sm font-sans text-neutral-500">Version {TERMS_VERSION}</Text>
            {LEGAL_SECTIONS.map((section) => (
              <View className="gap-1" key={section.title}>
                <Text className="text-lg font-display-semibold text-ink">{section.title}</Text>
                <Text className="text-base font-sans text-neutral-700">{section.body}</Text>
              </View>
            ))}
            <Button label="Back" onPress={() => router.back()} variant="outline" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
