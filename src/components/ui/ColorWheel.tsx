import { GestureHandlerRootView } from "react-native-gesture-handler";
import ColorPicker, { BrightnessSlider, Panel3 } from "reanimated-color-picker";

// A hue wheel (saturation towards the centre) plus a brightness slider. A RN Modal sits outside the app's root gesture view
// (web: portalled to <body>), so the wheel brings its own GestureHandlerRootView. onCompleteJS fires when the finger lifts.
export function ColorWheel({ onChange, value }: { onChange: (hex: string) => void; value: string }) {
  return (
    <GestureHandlerRootView style={{ gap: 16, width: "100%" }}>
      <ColorPicker onCompleteJS={({ hex }) => onChange(hex.slice(0, 7).toUpperCase())} style={{ gap: 16 }} value={value}>
        <Panel3 centerChannel="saturation" />
        <BrightnessSlider />
      </ColorPicker>
    </GestureHandlerRootView>
  );
}
