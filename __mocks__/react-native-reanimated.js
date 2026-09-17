// Manual Jest mock for react-native-reanimated 4.x. The package's own
// `mock.js` re-exports from `./index`, which eagerly constructs the native
// Worklets module at import time and throws under Jest (no native bridge).
// This mock provides just enough surface for the design system components
// (useSharedValue/useAnimatedStyle/withTiming/withRepeat/Animated.View/
// Animated.Text/createAnimatedComponent) to render in tests.
const React = require("react");
const RN = require("react-native");

// useRef-backed so the returned object survives re-renders of the same
// component instance (matching real Reanimated's persistence semantics —
// a plain `{ value }` object recreated every render would silently hide
// any bug where a component forgets to update .value on a later render),
// and the `.value` setter schedules a React re-render. Real Reanimated
// re-evaluates useAnimatedStyle reactively outside React's render cycle
// entirely (worklets on the UI thread); this mock has no such mechanism,
// so without forcing a re-render here, a .value write from a useEffect
// would never be reflected in what useAnimatedStyle last returned.
function useSharedValue(initialValue) {
  const [, forceRender] = React.useState(0);
  const store = React.useRef(initialValue);
  const sharedValue = React.useRef();

  if (sharedValue.current === undefined) {
    sharedValue.current = {
      get value() {
        return store.current;
      },
      set value(next) {
        store.current = next;
        forceRender((tick) => tick + 1);
      },
    };
  }

  return sharedValue.current;
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
