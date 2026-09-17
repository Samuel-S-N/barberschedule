module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/tests"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["**/*.test.ts"],
  // Extends jest-expo's own default (see node_modules/jest-expo/jest-preset.js)
  // by adding "nativewind" to the transform allowlist — react-native-*,
  // expo-*, and @expo-google-fonts/* are already covered by that default.
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|nativewind))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
};
