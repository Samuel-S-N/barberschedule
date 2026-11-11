import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { formatPriceBRL } from "../../../src/components/domain/ServiceCard";
import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { Card } from "../../../src/components/ui/Card";
import { Screen } from "../../../src/components/ui/Screen";
import { getMyProfessionalProfile } from "../../../src/features/professionals/api";
import { errorMessage } from "../../../src/i18n/errors";
import { useBack } from "../../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../../src/providers/AppProviders";
import { pullToRefresh, useRefreshAll } from "../../../src/lib/use-refresh";

export default function ProfessionalCompensationScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const back = useBack();
  const { profile, supabase } = useSupabaseSession();
  const professional = useQuery({ queryFn: () => getMyProfessionalProfile(supabase), queryKey: ["my-professional-profile", profile?.userId] });
  const compensation = professional.data?.compensation;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView refreshControl={pullToRefresh(pull)} className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("professional.hub.menu.compensation")} />
            {professional.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {professional.error ? (
              <Text className="text-sm font-sans text-danger-500">{errorMessage(professional.error, t, t("professional.profile.loadError"))}</Text>
            ) : null}
            {compensation ? (
              <Card variant="outlined">
                <View className="gap-2">
                  <Text className="text-base font-sans text-ink" testID="professional-compensation">
                    {compensation.type === "commission"
                      ? t("professional.profile.commission", { percent: compensation.commissionPercent })
                      : t("professional.profile.chairRental", {
                          amount: formatPriceBRL(compensation.amountCents),
                          frequency: t(`professional.frequency.${compensation.frequency}`),
                        })}
                  </Text>
                  <Text className="text-sm font-sans text-neutral-600">{t("professional.compensation.ownerHint")}</Text>
                </View>
              </Card>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
