import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { ColorField } from "../../src/components/domain/ColorField";
import { ConfirmDialog } from "../../src/components/domain/ConfirmDialog";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { useShopTheme } from "../../src/features/shops/ShopThemeProvider";
import { ThemePreview } from "../../src/features/shops/ThemePreview";
import { normalizeThemeColor, updateShopTheme } from "../../src/features/shops/theme";
import type { ShopThemeValues } from "../../src/features/shops/theme";
import { errorMessage } from "../../src/i18n/errors";
import { deriveTheme } from "../../src/lib/design/theme/derive";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";

// Offered colours: Âmbar (default), Terracota, Vinho, Rosa, Violeta, Azul, Turquesa, Verde, Grafite, Preto.
const ACTION_PRESETS = ["#DB9A34", "#C2593A", "#7A1F2B", "#D9588A", "#7C5CE0", "#2F6FDB", "#1BA39C", "#2F9E5B", "#3D3327", "#171412"] as const;
// Quente (default), Neutro, Frio, Rosado, Verde claro, Lavanda.
const BASE_PRESETS = ["#F7F3EE", "#F5F5F5", "#EEF3F8", "#F8EFF1", "#EFF5F0", "#F3F0F8"] as const;

type Draft = { accent: string; base: string; primary: string };

const toDraft = (values: ShopThemeValues | undefined): Draft => ({ accent: values?.accent ?? "", base: values?.base ?? "", primary: values?.primary ?? "" });

export default function OwnerAppearanceScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const { data } = useShopTheme();
  const [draft, setDraft] = useState<Draft>(toDraft(undefined));
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  // Load the saved colours once per shop; after that the owner edits the draft freely.
  useEffect(() => {
    if (data) setDraft(toDraft(data.input));
  }, [data?.shopId]);

  const parsed = useMemo(
    () => ({ accent: normalizeThemeColor(draft.accent), base: normalizeThemeColor(draft.base), primary: normalizeThemeColor(draft.primary) }),
    [draft],
  );
  const valid = parsed.accent.ok && parsed.base.ok && parsed.primary.ok;
  const values: ShopThemeValues = {
    accent: parsed.accent.ok ? parsed.accent.value : null,
    base: parsed.base.ok ? parsed.base.value : null,
    primary: parsed.primary.ok ? parsed.primary.value : null,
  };
  const theme = useMemo(() => deriveTheme(values), [values.accent, values.base, values.primary]);

  const save = useMutation({
    mutationFn: (next: ShopThemeValues) => updateShopTheme(supabase, data!.shopId, next),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("owner.appearance.saveError")), variant: "error" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shop-theme"] });
      setFeedback({ message: t("owner.appearance.saved"), variant: "success" });
    },
  });
  const error = (result: { ok: boolean }) => (result.ok ? undefined : t("owner.appearance.invalidColor"));

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.appearance.title")} />
            <Text className="text-base text-neutral-600">{t("owner.appearance.intro")}</Text>
            <Card>
              <View className="gap-5">
                <ColorField
                  error={error(parsed.primary)}
                  hint={t("owner.appearance.primaryHint")}
                  inputLabel={t("owner.appearance.hexLabel")}
                  label={t("owner.appearance.primary")}
                  onChange={(primary) => setDraft((current) => ({ ...current, primary }))}
                  presets={ACTION_PRESETS}
                  testID="appearance-primary"
                  value={draft.primary}
                />
                <ColorField
                  error={error(parsed.accent)}
                  hint={t("owner.appearance.accentHint")}
                  inputLabel={t("owner.appearance.hexLabel")}
                  label={t("owner.appearance.accent")}
                  onChange={(accent) => setDraft((current) => ({ ...current, accent }))}
                  presets={ACTION_PRESETS}
                  testID="appearance-accent"
                  value={draft.accent}
                />
                <ColorField
                  error={error(parsed.base)}
                  hint={t("owner.appearance.baseHint")}
                  inputLabel={t("owner.appearance.hexLabel")}
                  label={t("owner.appearance.base")}
                  onChange={(base) => setDraft((current) => ({ ...current, base }))}
                  presets={BASE_PRESETS}
                  testID="appearance-base"
                  value={draft.base}
                />
              </View>
            </Card>
            <ThemePreview input={values} />
            {theme.adjusted.primary || theme.adjusted.accent ? (
              <Text className="text-sm text-neutral-600" testID="appearance-adjusted">{t("owner.appearance.adjusted")}</Text>
            ) : null}
            <Button disabled={!valid || !data || save.isPending} label={t("owner.appearance.save")} onPress={() => save.mutate(values)} testID="appearance-save" />
            <Button label={t("owner.appearance.reset")} onPress={() => setConfirmingReset(true)} testID="appearance-reset" variant="ghost" />
          </View>
        </View>
      </KeyboardAwareScrollView>
      <ConfirmDialog
        body={t("owner.appearance.resetBody")}
        cancelLabel={t("owner.appearance.resetCancel")}
        confirmLabel={t("owner.appearance.resetConfirm")}
        confirmVariant="dark"
        onCancel={() => setConfirmingReset(false)}
        onConfirm={() => {
          setConfirmingReset(false);
          setDraft(toDraft(undefined));
          save.mutate({ accent: null, base: null, primary: null });
        }}
        title={t("owner.appearance.resetTitle")}
        visible={confirmingReset}
      />
      <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "success"} visible={Boolean(feedback)} />
    </Screen>
  );
}
