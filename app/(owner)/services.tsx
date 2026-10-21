import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { formatPriceBRL } from "../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { FabAdd } from "../../src/components/ui/FabAdd";
import { Screen } from "../../src/components/ui/Screen";
import type { Service } from "../../src/features/services/types";
import { useOwnerServiceCatalog } from "../../src/features/services/use-owner-catalog";
import { errorMessage } from "../../src/i18n/errors";
import { useBack } from "../../src/lib/navigation/use-back";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";

export default function OwnerServicesScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const router = useRouter();
  const back = useBack("/manage");
  const { catalog, shop } = useOwnerServiceCatalog();
  const loading = shop.isLoading || catalog.isLoading;
  const loadError = shop.error ?? catalog.error;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView refreshControl={pullToRefresh(pull)} className="flex-1" contentContainerStyle={{ paddingBottom: 96 }}>
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.services.title")} />
            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {loadError ? <Text className="text-sm font-sans text-danger-500">{errorMessage(loadError, t, t("owner.services.loadError"))}</Text> : null}
            {shop.data === null ? <EmptyState title={t("common.noShop")} /> : null}

            {(catalog.data?.services ?? []).map((service: Service) => (
              <Card key={service.id} testID={`owner-service-${service.id}`} variant="outlined">
                <View className="gap-3">
                  <View className="gap-1">
                    <Text className="text-base font-sans-semibold text-ink">
                      {service.name}{service.active ? "" : ` ${t("common.archived")}`}{service.isStandard ? ` · ${t("owner.services.standardBadge")}` : ""}
                    </Text>
                    <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>{service.durationMinutes} min · {formatPriceBRL(service.priceCents)}</Text>
                    {service.description ? <Text className="text-sm font-sans text-neutral-500">{service.description}</Text> : null}
                  </View>
                  <View className="flex-row">
                    <Button label={t("common.edit")} onPress={() => router.push({ params: { id: service.id }, pathname: "/service-form" })} size="sm" testID={`service-edit-${service.id}`} variant="outline" />
                  </View>
                </View>
              </Card>
            ))}
          </View>
        </View>
      </ScrollView>
      <FabAdd label={t("owner.services.add")} onPress={() => router.push("/service-form")} />
    </Screen>
  );
}
