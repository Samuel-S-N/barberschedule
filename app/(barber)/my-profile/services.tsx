import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Switch, Text, View } from "react-native";

import { EmptyState } from "../../../src/components/domain/EmptyState";
import { formatPriceBRL } from "../../../src/components/domain/ServiceCard";
import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { Toast } from "../../../src/components/domain/Toast";
import { Card } from "../../../src/components/ui/Card";
import { Screen } from "../../../src/components/ui/Screen";
import { listMyServiceOptions, setMyServiceEnabled } from "../../../src/features/barbers/api";
import { errorMessage } from "../../../src/i18n/errors";
import { colors } from "../../../src/lib/design/colors";
import { useBack } from "../../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

export default function BarberServicesScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const [error, setError] = useState<string | null>(null);
  const options = useQuery({ queryFn: () => listMyServiceOptions(supabase), queryKey: ["my-service-options"] });

  const toggle = useMutation({
    mutationFn: (input: { enabled: boolean; id: string }) => setMyServiceEnabled(supabase, input.id, input.enabled),
    onError: (caught) => setError(errorMessage(caught, t, t("barber.myServices.toggleError"))),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-service-options"] });
      // The agenda's free times and the booking sheet depend on which services are on.
      void queryClient.invalidateQueries({ queryKey: ["barber-slots"] });
      void queryClient.invalidateQueries({ queryKey: ["my-barber-services"] });
    },
  });

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-3">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("barber.myServices.title")} />
            {options.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {options.error ? (
              <Text className="text-sm font-sans text-danger-500">{errorMessage(options.error, t, t("barber.myServices.loadError"))}</Text>
            ) : null}
            {options.data?.length === 0 ? <EmptyState title={t("barber.myServices.empty")} /> : null}
            {(options.data ?? []).map((service) => (
              <Card key={service.serviceId} variant="outlined">
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1 gap-1">
                    <Text className="text-base font-sans-semibold text-ink">{service.serviceName}</Text>
                    <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>
                      {t("barber.profile.serviceLine", { duration: service.durationMinutes, price: formatPriceBRL(service.priceCents) })}
                    </Text>
                    <Text className="text-xs font-sans text-neutral-600">
                      {service.isStandard ? t("barber.myServices.standardHint") : t("barber.myServices.optionalHint")}
                    </Text>
                  </View>
                  {service.isStandard ? (
                    <Text className="text-xs font-sans-semibold uppercase text-primary-600" testID={`service-standard-${service.serviceId}`}>
                      {t("barber.myServices.standard")}
                    </Text>
                  ) : (
                    <Switch
                      accessibilityLabel={service.serviceName}
                      disabled={toggle.isPending}
                      onValueChange={(enabled) => toggle.mutate({ enabled, id: service.serviceId })}
                      testID={`service-switch-${service.serviceId}`}
                      trackColor={{ false: colors.neutral[200], true: colors.primary[400] }}
                      value={service.enabled}
                    />
                  )}
                </View>
              </Card>
            ))}
            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
