import React from "react";
import { render } from "@testing-library/react-native";

import { RatingStars } from "../../src/components/domain/RatingStars";
import { colors } from "../../src/lib/design/colors";

function getStarSvgs(view: Awaited<ReturnType<typeof render>>) {
  return view.root!.queryAll((node) => node.type === "RNSVGSvgView");
}

describe("RatingStars", () => {
  it("fills stars up to the rounded rating and leaves the rest empty", async () => {
    const view = await render(React.createElement(RatingStars, { rating: 3.6, testID: "rating" }));
    const stars = getStarSvgs(view);

    expect(stars).toHaveLength(5);

    for (let index = 0; index < 4; index += 1) {
      expect(stars[index].props.fill).toBe(colors.warning[400]);
      expect(stars[index].props.stroke).toBe(colors.warning[400]);
    }

    expect(stars[4].props.fill).toBe("none");
    expect(stars[4].props.stroke).toBe(colors.neutral[300]);
  });

  it("exposes the rating as an accessibility label", async () => {
    const view = await render(React.createElement(RatingStars, { rating: 4, testID: "rating" }));

    expect(view.getByTestId("rating").props.accessibilityLabel).toBe("4 out of 5 stars");
  });

  it("defaults the icon size to 16 and honors an explicit size", async () => {
    const view = await render(React.createElement(RatingStars, { rating: 5, size: 24, testID: "rating" }));
    const stars = getStarSvgs(view);

    expect(stars[0].props.width).toBe(24);
    expect(stars[0].props.height).toBe(24);
  });
});
