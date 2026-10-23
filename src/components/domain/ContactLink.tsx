import type { LucideIcon } from "lucide-react-native";
import { Linking, Platform, Pressable, Text, View } from "react-native";

import { colors } from "../../lib/design/colors";

// `fill` (default) shares the row equally with its siblings; `fill={false}` keeps the link's own width so a wrapping row drops it to the next line.
export function ContactLink({ children, fill = true, icon: Icon, testID, url }: { children: string; fill?: boolean; icon: LucideIcon; testID: string; url: string | null }) {
  const grow = fill ? "flex-1" : "shrink-0";
  const body = (
    <View className={`min-h-[44px] ${fill ? "flex-1 " : ""}flex-row items-center justify-center gap-2 rounded-full border border-neutral-200 bg-surface px-4 ${url ? "" : "opacity-50"}`}>
      <Icon color={colors.primary[600]} size={18} />
      <Text className="text-sm font-sans-semibold text-ink">{children}</Text>
    </View>
  );

  if (!url) return <View className={grow} testID={testID}>{body}</View>;

  // On the web a real anchor keeps the link openable in a new tab; on native Linking hands it to WhatsApp or the dialer.
  const linkProps = Platform.OS === "web"
    ? ({ href: url, hrefAttrs: { rel: "noopener noreferrer", target: "_blank" } } as object)
    : { onPress: () => void Linking.openURL(url) };

  return (
    <Pressable accessibilityRole="link" className={grow} testID={testID} {...linkProps}>
      {body}
    </Pressable>
  );
}
