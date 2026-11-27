// The hosted dev site is public and doubles as the demo shown to businesses (decision of 2026-11-27); its build sets
// EXPO_PUBLIC_APP_ENV=dev (deploy-env.yml). Production, local development and tests leave it unset or "production": no banner.
export const isDemoEnvironment = (appEnv: string | undefined) => appEnv === "dev";
