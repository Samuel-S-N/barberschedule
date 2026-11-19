import { LogOut } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text } from "react-native";

import { Toast } from "../../components/domain/Toast";
import { errorMessage } from "../../i18n/errors";
import { useColors } from "../../lib/design/theme/ThemeProvider";
import { useSupabaseSession } from "../../providers/AppProviders";
import { signOut } from "../auth/api";

export function SignOutButton() {
  const colors = useColors();
  const { t } = useTranslation();
  const { supabase } = useSupabaseSession();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        className="min-h-[56px] flex-row items-center justify-center gap-2 rounded-[20px] border border-neutral-200 bg-surface"
        onPress={async () => {
          try {
            await signOut(supabase);
          } catch (caught) {
            setError(errorMessage(caught, t, t("profile.signOutError")));
          }
        }}
        testID="profile-signout"
      >
        <LogOut color={colors.danger[500]} size={20} />
        <Text className="text-base font-sans-semibold text-danger-500">{t("profile.signOut")}</Text>
      </Pressable>
      <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
    </>
  );
}
