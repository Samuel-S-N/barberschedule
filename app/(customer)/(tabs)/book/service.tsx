import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { EmptyState } from "../../../../src/components/domain/EmptyState";
import { ServiceCard } from "../../../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../../../src/components/domain/SkeletonLoader";
import { useBarberServices } from "../../../../src/features/services/use-barber-services";
import { Screen } from "../../../../src/components/ui/Screen";

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookServiceScreen() {
  const { barberId: rawBarberId, shopId: rawShopId } = useLocalSearchParams<{ barberId?: string; shopId?: string }>();
  const barberId = param(rawBarberId);
  const shopId = param(rawShopId);
  const router = useRouter();
  const { t } = useTranslation();
  const services = useBarberServices(barberId);

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <View className="flex-1 items-center gap-4 p-5">
        <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">
          {t("book.serviceTitle")}
        </Text>
        <View className="w-full max-w-[420px] gap-3">
          {services.isLoading ? (
            <>
              <SkeletonBlock height={76} width={320} />
              <SkeletonBlock height={76} width={320} />
            </>
          ) : null}
          {services.error ? (
            <Text className="text-sm font-sans text-danger-500">{t("book.servicesError")}</Text>
          ) : null}
          {!services.isLoading && !services.error && services.data?.length === 0 ? (
            <EmptyState title={t("book.noServices")} />
          ) : null}
          {services.data?.map((service) => (
            <ServiceCard
              durationMinutes={service.durationMinutes}
              key={service.barberServiceId}
              name={service.name ?? t("book.fallbackService")}
              onPress={() => router.push(
                `/book/date?shopId=${encodeURIComponent(shopId)}&barberId=${encodeURIComponent(barberId)}&barberServiceId=${encodeURIComponent(service.barberServiceId)}`,
              )}
              priceCents={service.priceCents}
              testID={`service-card-${service.barberServiceId}`}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}
