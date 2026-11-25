import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Share, Text, View } from "react-native";

import { Toast } from "../../components/domain/Toast";
import { Button } from "../../components/ui/Button";
import { shopBaseDomain } from "./host";
import { useMyShop } from "./my-shop";
import { QrCode, qrSize } from "./QrCode";
import { qrMatrix } from "./qr";
import { copyLink, downloadQrPng, shareLink } from "./share-link";
import { shopLink } from "./shop-link";

// The business's general link with its QR code. The same component serves the owner, the professional and the last setup step.
export function ShopLinkCard({ audience }: { audience: "owner" | "professional" }) {
  const { t } = useTranslation();
  const isWeb = Platform.OS === "web";
  const mine = useMyShop();
  const slug = mine.data?.slug;
  const link = useMemo(() => (slug ? shopLink(slug, shopBaseDomain(), isWeb && typeof window !== "undefined" ? window.location : undefined) : null), [isWeb, slug]);
  const matrix = useMemo(() => (link ? qrMatrix(link.url) : null), [link]);
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);

  if (!link || !matrix) return null;

  const clipboard = isWeb && typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  const share = async () => {
    const result = await shareLink(link.url, link.display, {
      clipboard,
      nativeShare: isWeb ? undefined : (options) => Share.share(options),
      webShare: isWeb && typeof navigator !== "undefined" && typeof navigator.share === "function" ? (data) => navigator.share(data) : undefined,
    });

    if (result === "copied") setFeedback({ message: t("shopLinkScreen.copied"), variant: "success" });
    if (result === "failed") setFeedback({ message: t("shopLinkScreen.failed"), variant: "error" });
  };
  const copy = async () => setFeedback((await copyLink(link.url, clipboard)) ? { message: t("shopLinkScreen.copied"), variant: "success" } : { message: t("shopLinkScreen.failed"), variant: "error" });
  const download = () => downloadQrPng(matrix, `qr-${slug}.png`).catch(() => setFeedback({ message: t("shopLinkScreen.downloadFailed"), variant: "error" }));

  return (
    <View className="gap-4">
      <Text className="text-base font-sans text-neutral-700">{t(audience === "owner" ? "shopLinkScreen.introOwner" : "shopLinkScreen.introProfessional")}</Text>
      <View className="items-center gap-4 rounded-[20px] border border-neutral-200 bg-surface p-4">
        <QrCode accessibilityLabel={t("shopLinkScreen.qrLabel")} matrix={matrix} size={qrSize(matrix.length, 240)} />
        <Text className="text-center text-lg font-display-semibold text-ink" selectable testID="shop-link-url">{link.display}</Text>
      </View>
      <Button label={t("shopLinkScreen.share")} onPress={() => void share()} testID="shop-link-share" />
      {isWeb ? <Button label={t("shopLinkScreen.copy")} onPress={() => void copy()} testID="shop-link-copy" variant="outline" /> : null}
      {isWeb ? <Button label={t("shopLinkScreen.download")} onPress={() => void download()} testID="shop-link-download" variant="outline" /> : null}
      <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
    </View>
  );
}
