import { View } from "react-native";
import { Star } from "lucide-react-native";

import { colors } from "../../lib/design/colors";

export type RatingStarsProps = {
  rating: number;
  size?: number;
  testID?: string;
};

export function RatingStars({ rating, size = 16, testID }: RatingStarsProps) {
  const filledCount = Math.max(0, Math.min(5, Math.round(rating)));

  return (
    <View
      accessibilityLabel={`${filledCount} out of 5 stars`}
      className="flex-row gap-0.5"
      testID={testID}
    >
      {Array.from({ length: 5 }, (_, index) => {
        const filled = index < filledCount;

        return (
          <Star
            color={filled ? colors.warning[400] : colors.neutral[300]}
            fill={filled ? colors.warning[400] : "none"}
            key={index}
            size={size}
          />
        );
      })}
    </View>
  );
}
