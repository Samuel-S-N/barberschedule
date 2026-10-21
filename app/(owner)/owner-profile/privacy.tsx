import { useTranslation } from "react-i18next";

import { PrivacyDataScreen } from "../../../src/features/account/PrivacyDataScreen";

export default function OwnerPrivacyScreen() {
  const { t } = useTranslation();

  return <PrivacyDataScreen allowDelete={false} note={t("owner.profile.privacyNote")} />;
}
