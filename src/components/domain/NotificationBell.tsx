import { Bell } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { useUnreadCount } from "../../features/notifications/use-unread";
import { colors } from "../../lib/design/colors";

export function NotificationBell({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const unread = useUnreadCount().data ?? 0;

  return (
    <Pressable
      accessibilityLabel={t("notifications.bellLabel")}
      accessibilityRole="button"
      className="min-h-[44px] min-w-[44px] items-center justify-center"
      hitSlop={8}
      onPress={onPress}
      testID="notification-bell"
    >
      <Bell color={colors.ink} size={26} />
      {unread > 0 ? (
        <View className="absolute right-1 top-1 min-w-[18px] items-center rounded-full bg-danger-500 px-1" testID="notification-badge">
          <Text className="text-xs font-sans-medium text-white">{unread > 99 ? "99+" : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
