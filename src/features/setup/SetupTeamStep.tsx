import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { Toggle } from "../../components/ui/Toggle";
import { useOwnerAsProfessional } from "../professionals/owner/use-owner-as-professional";
import type { SetupProfessional } from "./api";
import { FROM_SETUP } from "./from-setup";
import { SetupStepCard } from "./SetupStepCard";
import { professionalLacks } from "./steps";

// Step 5: the team. "I serve customers myself" (the owner as a professional, copying the shop hours once) or add professionals;
// each professional shows what it lacks, with a shortcut to fix it. Invites are optional: nothing here needs them accepted.
export function SetupTeamStep({ done, onChanged, professionals }: { done: boolean; onChanged: () => void; professionals: SetupProfessional[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const asProfessional = useOwnerAsProfessional();

  return (
    <SetupStepCard done={done} hint={t("setup.team.hint")} stepKey="team" title={t("setup.team.title")}>
      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-sm font-sans-medium text-ink">{t("setup.team.serve")}</Text>
          <Text className="text-xs font-sans text-neutral-600">{t("setup.team.serveHint")}</Text>
        </View>
        <Toggle
          accessibilityLabel={t("setup.team.serve")}
          disabled={asProfessional.isLoading || asProfessional.toggle.isPending}
          onValueChange={(on) => asProfessional.toggle.mutate(on, { onSettled: onChanged })}
          testID="setup-team-serve"
          value={asProfessional.active}
        />
      </View>
      {professionals.map((professional) => {
        const lacks = professionalLacks(professional);

        return (
          <View className="gap-2 rounded-[16px] border border-neutral-200 p-3" key={professional.id} testID={`setup-professional-${professional.id}`}>
            <Text className="text-sm font-sans-semibold text-ink">{professional.name}</Text>
            {lacks.includes("hours") ? <Text className="text-xs font-sans text-neutral-600">{t("setup.team.lacksHours")}</Text> : null}
            {lacks.includes("services") ? <Text className="text-xs font-sans text-neutral-600">{t("setup.team.lacksServices")}</Text> : null}
            {lacks.includes("hours") ? <Button label={t("setup.team.addHours")} onPress={() => router.push({ params: { ...FROM_SETUP, professional: professional.id }, pathname: "/schedule" })} size="sm" variant="outline" /> : null}
            {lacks.includes("services") ? <Button label={t("setup.team.addServices")} onPress={() => router.push({ params: { ...FROM_SETUP, id: professional.id }, pathname: "/professional-profile" })} size="sm" variant="outline" /> : null}
          </View>
        );
      })}
      <Button label={t("setup.team.add")} onPress={() => router.push({ params: FROM_SETUP, pathname: "/professional-new" } as never)} size="sm" testID="setup-team-add" variant="outline" />
    </SetupStepCard>
  );
}
