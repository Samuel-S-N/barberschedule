// Manual Jest mock for react-native-reanimated 4.x. The package's own
// `mock.js` re-exports from `./index`, which eagerly constructs the native
// Worklets module at import time and throws under Jest (no native bridge).
// This mock provides just enough surface for the design system components
// (useSharedValue/useAnimatedStyle/withTiming/withRepeat/Animated.View/
// Animated.Text/createAnimatedComponent) to render in tests; none of this
// project's component tests assert on computed animated style values.
const React = require("react");
const RN = require("react-native");

function useSharedValue(initialValue) {
  return { value: initialValue };
}

function useAnimatedStyle(factory) {
  try {
    return factory();
  } catch {
    return {};
  }
}

function withTiming(toValue, _config, callback) {
  if (callback) {
    callback(true);
  }

  return toValue;
}

function withRepeat(animation) {
  return animation;
}

function createAnimatedComponent(Component) {
  return React.forwardRef(function AnimatedMockComponent(props, ref) {
    return React.createElement(Component, { ...props, ref });
  });
}

const Animated = {
  View: RN.View,
  Text: RN.Text,
  Image: RN.Image,
  ScrollView: RN.ScrollView,
  createAnimatedComponent,
};

module.exports = {
  __esModule: true,
  default: Animated,
  createAnimatedComponent,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring: withTiming,
  withRepeat,
  Easing: {
    bezier: () => (t) => t,
    linear: (t) => t,
  },
};
