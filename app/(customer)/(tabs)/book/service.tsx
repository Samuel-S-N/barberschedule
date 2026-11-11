import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { EmptyState } from "../../../../src/components/domain/EmptyState";
import { ServiceCard } from "../../../../src/components/domain/ServiceCard";
import { ScreenHeader } from "../../../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../../../src/components/domain/SkeletonLoader";
import { StepIndicator } from "../../../../src/components/domain/StepIndicator";
import { useProfessionalServices } from "../../../../src/features/services/use-professional-services";
import { Screen } from "../../../../src/components/ui/Screen";
import { useBack } from "../../../../src/lib/navigation/use-back";

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookServiceScreen() {
  const { professionalId: rawProfessionalId, shopId: rawShopId } = useLocalSearchParams<{ professionalId?: string; shopId?: string }>();
  const professionalId = param(rawProfessionalId);
  const shopId = param(rawShopId);
  const router = useRouter();
  const { t } = useTranslation();
  const back = useBack();
  const services = useProfessionalServices(professionalId);

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <View className="flex-1 items-center gap-4 p-5">
        <View className="w-full max-w-[420px]">
          <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("book.serviceTitle")} />
        </View>
        <StepIndicator current="service" ids={{ professionalId, shopId }} />
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
              key={service.professionalServiceId}
              name={service.name ?? t("book.fallbackService")}
              onPress={() => router.push(
                `/book/date?shopId=${encodeURIComponent(shopId)}&professionalId=${encodeURIComponent(professionalId)}&professionalServiceId=${encodeURIComponent(service.professionalServiceId)}`,
              )}
              priceCents={service.priceCents}
              testID={`service-card-${service.professionalServiceId}`}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}
