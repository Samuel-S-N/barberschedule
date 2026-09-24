import { Platform, Share } from "react-native";

import { saveExportFile } from "../../src/features/account/export-file";

const file = { content: "{}", filename: "data.json", mimeType: "application/json" };

describe("saveExportFile", () => {
  afterEach(() => jest.restoreAllMocks());

  it("shares the JSON text on native platforms", async () => {
    Platform.OS = "ios";
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);

    await saveExportFile(file);

    expect(share).toHaveBeenCalledWith({ message: "{}", title: "data.json" });
  });

  it("downloads a Blob through an anchor on web", async () => {
    Platform.OS = "web";
    const click = jest.fn();
    const anchor = { click } as unknown as HTMLAnchorElement;
    (globalThis as { document?: unknown }).document = { createElement: jest.fn(() => anchor) };
    (globalThis as { URL: unknown }).URL = { createObjectURL: jest.fn(() => "blob:1"), revokeObjectURL: jest.fn() };

    await saveExportFile(file);

    expect(anchor.download).toBe("data.json");
    expect(anchor.href).toBe("blob:1");
    expect(click).toHaveBeenCalled();
  });
});
