import { Platform } from "react-native";

import { shadows } from "../../src/lib/design/shadows";

function expectedFor(
  opts: { shadowOpacity: number; shadowRadius: number; offset: { width: number; height: number }; elevation: number },
) {
  return Platform.OS === "android"
    ? { elevation: opts.elevation }
    : {
        shadowColor: "#000000",
        shadowOpacity: opts.shadowOpacity,
        shadowRadius: opts.shadowRadius,
        shadowOffset: opts.offset,
      };
}

describe("design shadow tokens", () => {
  it("defines level 1 (standard card)", () => {
    expect(shadows.level1).toEqual(
      expectedFor({ shadowOpacity: 0.06, shadowRadius: 4, offset: { width: 0, height: 1 }, elevation: 2 }),
    );
  });

  it("defines level 2 (highlighted card / toast)", () => {
    expect(shadows.level2).toEqual(
      expectedFor({ shadowOpacity: 0.1, shadowRadius: 12, offset: { width: 0, height: 4 }, elevation: 5 }),
    );
  });

  it("defines level 3 (bottom sheet / modal)", () => {
    expect(shadows.level3).toEqual(
      expectedFor({ shadowOpacity: 0.15, shadowRadius: 20, offset: { width: 0, height: -2 }, elevation: 12 }),
    );
  });
});
