// A jest.fn so a test can switch the device language with `jest.mocked(getLocales).mockReturnValue(...)`.
jest.mock("expo-localization", () => ({
  getLocales: jest.fn(() => [{ languageCode: "en", languageTag: "en-US" }]),
}));

import "./src/i18n";

// The published mock (`react-native-reanimated/mock`) eagerly initializes the
// real native Worklets module and crashes under Jest — see the note in
// __mocks__/react-native-reanimated.js. Mock explicitly instead of relying on
// Jest's node_modules auto-mock convention, since this project's `roots`
// (jest.config.js) is scoped to `tests/`, not the project root where
// `__mocks__/` normally needs to live to be auto-discovered.
jest.mock("react-native-reanimated", () => require("./__mocks__/react-native-reanimated"));

(
  globalThis as typeof globalThis & {
    __BARBERSCHEDULE_TEST_SETUP__?: boolean;
  }
).__BARBERSCHEDULE_TEST_SETUP__ = true;
