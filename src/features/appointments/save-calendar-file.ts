import { Platform } from "react-native";

import { saveExportFile } from "../account/export-file";

export async function saveCalendarFile(filename: string, content: string) {
  if (Platform.OS === "web") {
    await saveExportFile({ content, filename, mimeType: "text/calendar" });
    return;
  }
  // Native modules are loaded lazily so web and jest never touch them.
  const { File, Paths } = await import("expo-file-system");
  const Sharing = await import("expo-sharing");
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);
  await Sharing.shareAsync(file.uri, { UTI: "public.calendar-event", mimeType: "text/calendar" });
}
