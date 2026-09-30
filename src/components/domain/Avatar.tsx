import { Camera } from "lucide-react-native";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { avatarInitial } from "../../features/account/avatar";
import { colors } from "../../lib/design/colors";

export type AvatarProps = {
  name?: string | null;
  uri?: string | null;
  size?: number;
  onPress?: () => void;
  busy?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

export function Avatar({ name, uri, size = 96, onPress, busy = false, accessibilityLabel, testID }: AvatarProps) {
  const circle = { borderRadius: size / 2, height: size, width: size };
  const body = (
    <View className="items-center justify-center overflow-hidden bg-primary-100" style={circle}>
      {uri ? (
        <Image accessibilityIgnoresInvertColors source={{ uri }} style={circle} testID={testID ? `${testID}-image` : undefined} />
      ) : (
        <Text className="font-display-bold text-primary-700" style={{ fontSize: size * 0.42 }}>{avatarInitial(name)}</Text>
      )}
      {busy ? (
        <View className="items-center justify-center" style={StyleSheet.absoluteFill}>
          <View className="bg-ink opacity-40" style={StyleSheet.absoluteFill} />
          <ActivityIndicator color={colors.white} />
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return <View testID={testID}>{body}</View>;

  return (
    <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" disabled={busy} onPress={onPress} testID={testID}>
      {body}
      <View className="absolute bottom-0 right-0 h-9 w-9 items-center justify-center rounded-full border-2 border-canvas bg-primary-400">
        <Camera color={colors.ink} size={18} />
      </View>
    </Pressable>
  );
}
