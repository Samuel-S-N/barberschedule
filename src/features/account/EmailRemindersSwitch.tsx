import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Toggle } from "../../components/ui/Toggle";
import { useColors } from "../../lib/design/theme/ThemeProvider";
import { useSupabaseSession } from "../../providers/AppProviders";
import { setEmailReminders } from "./api";
import { useMyProfile } from "./use-my-profile";

// Customer settings row: the 24 h reminder e-mail, for the whole Zenc account (every business). On by default.
export function EmailRemindersSwitch() {
  const colors = useColors();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const profile = useMyProfile();
  const save = useMutation({
    mutationFn: (enabled: boolean) => setEmailReminders(supabase, enabled),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["my-profile"] }),
  });
  const value = save.isPending ? Boolean(save.variables) : profile.data?.emailReminders ?? true;

  return (
    <View className="min-h-[56px] flex-row items-center gap-3 rounded-[20px] border border-neutral-200 bg-surface p-4">
      <Mail color={colors.primary[600]} size={22} />
      <View className="flex-1 gap-1">
        <Text className="text-base font-sans-semibold text-ink">{t("emailReminders.label")}</Text>
        <Text className="text-sm font-sans text-neutral-600">{t("emailReminders.hint")}</Text>
        {save.isError ? <Text className="text-sm font-sans text-danger-500">{t("emailReminders.error")}</Text> : null}
      </View>
      <Toggle accessibilityLabel={t("emailReminders.label")} disabled={save.isPending || profile.isLoading} onValueChange={(next) => save.mutate(next)} testID="email-reminders-switch" value={value} />
    </View>
  );
}
