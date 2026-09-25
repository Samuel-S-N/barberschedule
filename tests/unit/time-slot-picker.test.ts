import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { TimeSlotPicker } from "../../src/components/domain/TimeSlotPicker";

const slots = [
  { time: "09:00", status: "free" as const },
  { time: "09:30", status: "selected" as const },
  { time: "10:00", status: "occupied" as const },
];

describe("TimeSlotPicker", () => {
  it("renders every slot's time", async () => {
    const view = await render(React.createElement(TimeSlotPicker, { slots, onSelectSlot: jest.fn() }));

    expect(view.getByText("09:00")).toBeTruthy();
    expect(view.getByText("09:30")).toBeTruthy();
    expect(view.getByText("10:00")).toBeTruthy();
  });

  it("calls onSelectSlot when a free slot is pressed", async () => {
    const onSelectSlot = jest.fn();
    const view = await render(React.createElement(TimeSlotPicker, { slots, onSelectSlot }));

    await fireEvent.press(view.getByTestId("time-slot-09:00"));

    expect(onSelectSlot).toHaveBeenCalledWith("09:00");
  });

  it("does not call onSelectSlot when an occupied slot is pressed", async () => {
    const onSelectSlot = jest.fn();
    const view = await render(React.createElement(TimeSlotPicker, { slots, onSelectSlot }));

    await fireEvent.press(view.getByTestId("time-slot-10:00"));

    expect(onSelectSlot).not.toHaveBeenCalled();
  });

  it("sets accessibilityState.disabled on occupied slots and .selected on the selected slot", async () => {
    const view = await render(React.createElement(TimeSlotPicker, { slots, onSelectSlot: jest.fn() }));

    expect(view.getByTestId("time-slot-10:00").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(view.getByTestId("time-slot-09:30").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(view.getByTestId("time-slot-09:00").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false, disabled: false }),
    );
  });

  function getScale(element: ReturnType<typeof render> extends Promise<infer T> ? T : never, testID: string) {
    // The scale lives on an outer Animated.View: Reanimated's web animated components
    // drop NativeWind className styles, so the classed Pressable sits inside it.
    const style = element.getByTestId(`${testID}-scale`).props.style;
    const flattened = Array.isArray(style) ? Object.assign({}, ...style) : (style ?? {});
    const transform = flattened.transform as Array<{ scale?: number }> | undefined;

    return transform?.find((entry) => "scale" in entry)?.scale;
  }

  it("re-scales a slot up when it becomes selected via a prop change, and back down when deselected", async () => {
    const initialSlots = [
      { time: "09:00", status: "free" as const },
      { time: "09:30", status: "selected" as const },
    ];
    const view = await render(React.createElement(TimeSlotPicker, { slots: initialSlots, onSelectSlot: jest.fn() }));

    expect(getScale(view, "time-slot-09:00")).toBe(1);
    expect(getScale(view, "time-slot-09:30")).toBe(1.03);

    const nextSlots = [
      { time: "09:00", status: "selected" as const },
      { time: "09:30", status: "free" as const },
    ];
    await view.rerender(React.createElement(TimeSlotPicker, { slots: nextSlots, onSelectSlot: jest.fn() }));

    expect(getScale(view, "time-slot-09:00")).toBe(1.03);
    expect(getScale(view, "time-slot-09:30")).toBe(1);
  });
});
