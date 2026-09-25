import { Platform, Share } from "react-native";

type ExportFile = { content: string; filename: string; mimeType: string };

export async function saveExportFile(file: ExportFile) {
  if (Platform.OS !== "web") {
    await Share.share({ message: file.content, title: file.filename });
    return;
  }

  const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
