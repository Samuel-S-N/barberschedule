import { useTranslation } from "react-i18next";
import { Linking, Text, View } from "react-native";

import type { PublicShop } from "../../features/shops/api";
import { telUrl, whatsappUrl } from "../../features/shops/contact";
import { formatPeriods, groupWeek, weekdayLabel } from "../../features/shops/hours";
import type { ShopPeriod } from "../../features/shops/hours";
import { useLanguage } from "../../i18n/use-language";
import { Button } from "../ui/Button";

export function ShopContactButtons({ phone, whatsapp }: { phone: string | null; whatsapp: string | null }) {
  const { t } = useTranslation();
  const tel = phone ? telUrl(phone) : null;
  const wa = whatsapp ? whatsappUrl(whatsapp) : null;
  if (!tel && !wa) return null;

  return (
    <View className="flex-row gap-2">
      {tel ? <Button label={t("shop.call")} onPress={() => void Linking.openURL(tel)} size="sm" testID="shop-call" variant="outline" /> : null}
      {wa ? <Button label={t("shop.whatsapp")} onPress={() => void Linking.openURL(wa)} size="sm" testID="shop-whatsapp" variant="outline" /> : null}
    </View>
  );
}

export function ShopInfoCard({ hours, shop }: { hours: ShopPeriod[]; shop: PublicShop }) {
  const language = useLanguage();
  const groups = groupWeek(hours);
  if (!shop.address && !shop.phone && !shop.whatsapp && groups.length === 0) return null;

  return (
    <View className="gap-2 rounded-[20px] bg-neutral-50 p-4" testID="shop-info-card">
      <Text className="text-base font-sans-semibold text-ink">{shop.name}</Text>
      {shop.address ? <Text className="text-sm font-sans text-neutral-600">{shop.address}</Text> : null}
      {groups.map((group) => (
        <View className="flex-row justify-between" key={group.from}>
          <Text className="text-sm font-sans text-neutral-600">
            {group.from === group.to
              ? weekdayLabel(group.from, language)
              : `${weekdayLabel(group.from, language)}–${weekdayLabel(group.to, language)}`}
          </Text>
          <Text className="text-sm font-sans-semibold text-ink">{formatPeriods(group.periods)}</Text>
        </View>
      ))}
      <ShopContactButtons phone={shop.phone} whatsapp={shop.whatsapp} />
    </View>
  );
}
