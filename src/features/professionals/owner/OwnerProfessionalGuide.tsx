import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "../../../components/ui/Button";
import { useOwnerProfessionalSetup } from "./use-owner-professional-setup";

// Under the "Serve as a professional" switch: what still keeps the owner's professional out of the booking list, with a way to fix it.
export function OwnerProfessionalGuide({ professionalId }: { professionalId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { hasHours, hasServices } = useOwnerProfessionalSetup(professionalId);
  const row = (testID: string, message: string, action: string, actionTestID: string, onPress: () => void) => (
    <View className="gap-3 rounded-[20px] border border-neutral-200 bg-surface p-4" key={testID} testID={testID}>
      <Text className="text-sm font-sans-medium text-ink">{message}</Text>
      <Button label={action} onPress={onPress} size="sm" testID={actionTestID} variant="outline" />
    </View>
  );

  if (hasHours && hasServices) return null;

  return (
    <View className="gap-3">
      {hasHours ? null : row("owner-guide-hours", t("owner.profile.guideHours"), t("owner.profile.guideHoursAction"), "guide-hours-action", () => router.push({ params: { professional: professionalId }, pathname: "/schedule" }))}
      {hasServices ? null : row("owner-guide-services", t("owner.profile.guideServices"), t("owner.profile.guideServicesAction"), "guide-services-action", () => router.push({ params: { id: professionalId }, pathname: "/professional-profile" }))}
    </View>
  );
}
