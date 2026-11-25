import { Redirect } from "expo-router";

// Old link target (signup, privacy screens, installed copies of the app): the policy is the entry point of the legal documents.
export default function LegalScreen() {
  return <Redirect href="/privacidade" />;
}
