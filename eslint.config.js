const js = require("@eslint/js");
const globals = require("globals");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  {
    ignores: [
      ".expo/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["*.config.js", "eslint.config.js", "metro.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // jest.setup.ts's jest.mock() factories and Jest manual mock files
    // (__mocks__/**) must use require() inside the factory body — Jest
    // hoists jest.mock() calls above top-level imports in the same file,
    // so an imported binding referenced inside the factory would be used
    // before initialization.
    files: ["jest.setup.ts", "__mocks__/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
