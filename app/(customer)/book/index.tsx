import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { EmptyState } from "../../../src/components/domain/EmptyState";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { Button } from "../../../src/components/ui/Button";
import { listPublicShops } from "../../../src/features/shops/api";
import { useSupabaseSession } from "../../../src/providers/AppProviders";
import { Screen } from "../../../src/components/ui/Screen";

export default function BookIndexScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { supabase } = useSupabaseSession();
  const shops = useQuery({
    queryFn: () => listPublicShops(supabase),
    queryKey: ["public-shops"],
  });

  if (shops.data?.length === 1) {
    return <Redirect href={`/book/barber?shopId=${encodeURIComponent(shops.data[0].id)}`} />;
  }

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <View className="flex-1 items-center gap-4 p-5">
        <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">
          {t("book.shopTitle")}
        </Text>
        <View className="w-full max-w-[420px] gap-3">
          {shops.isLoading ? (
            <>
              <SkeletonBlock height={60} width={320} />
              <SkeletonBlock height={60} width={320} />
              <SkeletonBlock height={60} width={320} />
            </>
          ) : null}
          {shops.error ? (
            <Text className="text-sm font-sans text-danger-500">{t("book.shopsError")}</Text>
          ) : null}
          {!shops.isLoading && !shops.error && shops.data?.length === 0 ? (
            <EmptyState title={t("book.noShops")} />
          ) : null}
          {shops.data?.map((shop) => (
            <Button
              key={shop.id}
              label={t("book.startAt", { shop: shop.name })}
              onPress={() => router.push(`/book/barber?shopId=${encodeURIComponent(shop.id)}`)}
              size="lg"
              variant="primary"
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}
