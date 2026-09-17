module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/tests"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["**/*.test.ts"],
  // lucide-react-native's package.json "react-native"/exports condition
  // points at its ESM (.mjs) build, and @react-native/jest-preset's own
  // `transform` config only registers babel-jest for .js/.ts/.tsx — .mjs
  // has no transformer at all, so it fails on the raw `export` syntax
  // regardless of transformIgnorePatterns. Route straight to the package's
  // parallel CommonJS build instead of touching the global transform config.
  moduleNameMapper: {
    "^lucide-react-native$": "<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
  },
  // Extends jest-expo's own default (see node_modules/jest-expo/jest-preset.js)
  // by adding "nativewind" and "lucide-react-native" (ships untranspiled
  // ESM) to the transform allowlist — react-native-*, expo-*, and
  // @expo-google-fonts/* are already covered by that default.
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|nativewind|lucide-react-native))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
};
