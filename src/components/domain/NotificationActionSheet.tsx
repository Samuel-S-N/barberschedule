import { Modal, Pressable, View } from "react-native";

import { Button } from "../ui/Button";

export type NotificationActionSheetProps = {
  busy?: boolean;
  deleteLabel: string;
  onClose: () => void;
  onDelete: () => void;
  visible: boolean;
};

// The pop-up shown when a notification is held down.
export function NotificationActionSheet({ busy = false, deleteLabel, onClose, onDelete, visible }: NotificationActionSheetProps) {
  if (!visible) return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <Pressable className="flex-1 items-center justify-center bg-black/40 p-5" onPress={onClose}>
        <Pressable className="w-full max-w-[360px] rounded-2xl bg-surface p-5" onPress={() => undefined} testID="notification-sheet">
          <View>
            <Button disabled={busy} label={deleteLabel} onPress={onDelete} testID="notification-sheet-delete" variant="danger" />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
