import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("expo-router/html", () => ({ ScrollViewStyleReset: () => null, useServerDocumentContext: jest.fn() }));

import { useServerDocumentContext } from "expo-router/html";

import Root from "../../app/+html";

// Regression: a custom +html that leaves out the document context ships a page with no JavaScript (the bundle scripts arrive as bodyNodes).
describe("app/+html.tsx renders what Expo Router hands it", () => {
  it("puts head nodes in <head> and body nodes (the bundle scripts) after the app", () => {
    jest.mocked(useServerDocumentContext).mockReturnValue({
      bodyAttributes: { className: "from-expo" },
      bodyNodes: React.createElement("script", { src: "/_expo/static/js/web/entry.js" }),
      headNodes: React.createElement("link", { href: "/_expo/static/css/app.css", rel: "stylesheet" }),
    } as never);

    const html = renderToStaticMarkup(React.createElement(Root, null, React.createElement("div", { id: "root" })));

    expect(html).toContain('<link href="/_expo/static/css/app.css" rel="stylesheet"/>');
    expect(html.indexOf('<div id="root">')).toBeLessThan(html.indexOf("/_expo/static/js/web/entry.js"));
    expect(html).toContain('<body class="from-expo">');
  });
});
