import { ScrollViewStyleReset, useServerDocumentContext } from "expo-router/html";
import type { PropsWithChildren } from "react";

import { INSTALL_CAPTURE_SCRIPT } from "../src/features/install/capture-script";

// The static export's document. Replacing Expo's default means repeating what it gave us (charset, viewport, the scroll reset).
// `viewport-fit=cover` lets the page use the whole iPhone screen with `black-translucent`; `Screen` pads by the safe-area insets.
export default function Root({ children }: PropsWithChildren) {
  // Expo Router hands the export's own head nodes (styles, preloads) and body nodes (the bundle scripts) through this context; a custom
  // document that omits them ships a page with no JavaScript.
  const { bodyAttributes, bodyNodes, headNodes, htmlAttributes } = useServerDocumentContext() ?? {};

  return (
    <html {...htmlAttributes} lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta content="IE=edge" httpEquiv="X-UA-Compatible" />
        <meta content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" name="viewport" />
        <link href="/manifest.json" rel="manifest" />
        <meta content="#171412" name="theme-color" />
        <meta content="yes" name="mobile-web-app-capable" />
        <meta content="yes" name="apple-mobile-web-app-capable" />
        <meta content="black-translucent" name="apple-mobile-web-app-status-bar-style" />
        <meta content="Zenc" name="apple-mobile-web-app-title" />
        <link href="/icons/apple-touch-icon.png" rel="apple-touch-icon" />
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
        <ScrollViewStyleReset />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
