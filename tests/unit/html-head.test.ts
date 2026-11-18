import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import Root from "../../app/+html";

describe("app/+html.tsx", () => {
  const html = renderToStaticMarkup(React.createElement(Root, null, React.createElement("div", { id: "app" })));

  it.each([
    '<link href="/manifest.json" rel="manifest"/>',
    '<meta content="#171412" name="theme-color"/>',
    '<meta content="yes" name="apple-mobile-web-app-capable"/>',
    '<meta content="black-translucent" name="apple-mobile-web-app-status-bar-style"/>',
    '<meta content="Zenc" name="apple-mobile-web-app-title"/>',
    '<link href="/icons/apple-touch-icon.png" rel="apple-touch-icon"/>',
  ])("has %s", (tag) => {
    expect(html).toContain(tag);
  });

  it("has a viewport that also covers the notch area", () => {
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain("width=device-width");
  });

  it("captures the install prompt before the bundle runs and renders the app body", () => {
    expect(html).toContain("__zencInstallPromptEvent");
    expect(html).toContain('<div id="app"></div>');
  });
});
