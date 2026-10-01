# Keyboard and text inputs

1. Input forwards autoCapitalize, autoCorrect, keyboardType, autoComplete, textContentType, returnKeyType, onSubmitEditing (test first).
2. Screen gets `keyboardAvoiding` -> KeyboardAvoidingView (test first).
3. Apply per-field props + `keyboardAvoiding` + `keyboardShouldPersistTaps="handled"` on login, signup, forgot-password, reset-password, account, security/password, booking review.
4. Last field of each form: returnKeyType + onSubmitEditing calling the button handler (guarded by the same disabled check).
5. Verify: tsc, lint, unit tests, browser check of login/signup, code review.
