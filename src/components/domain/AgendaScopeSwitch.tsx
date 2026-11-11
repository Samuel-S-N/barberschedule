import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { useOwnerAsProfessional } from "../../features/professionals/owner/use-owner-as-professional";

// Loja | Minha agenda: only for an owner who also serves as a professional.
export function AgendaScopeSwitch({ scope }: { scope: "mine" | "store" }) {
  const { t } = useTranslation();
  const router = useRouter();
  const asProfessional = useOwnerAsProfessional();

  if (!asProfessional.active) return null;

  const pill = (key: "mine" | "store", label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: scope === key }}
      className={`min-h-[44px] flex-1 items-center justify-center rounded-full border ${scope === key ? "border-ink bg-ink" : "border-neutral-300"}`}
      onPress={() => scope !== key && router.navigate((key === "mine" ? "/my-professional-agenda" : "/agenda") as never)}
      testID={`agenda-scope-${key}`}
    >
      <Text className={`text-base font-sans-semibold ${scope === key ? "text-surface" : "text-ink"}`}>{label}</Text>
    </Pressable>
  );

  return (
    <View className="w-full flex-row gap-2" testID="agenda-scope">
      {pill("store", t("owner.agenda.scopeStore"))}
      {pill("mine", t("owner.agenda.scopeMine"))}
    </View>
  );
}
