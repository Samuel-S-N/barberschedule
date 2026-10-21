import { Modal, Pressable, Text, View } from "react-native";

import { Button } from "../ui/Button";

export type ConfirmDialogProps = {
  body: string;
  busy?: boolean;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  visible: boolean;
};

// A small centred confirmation pop-up for destructive actions.
export function ConfirmDialog({ body, busy = false, cancelLabel, confirmLabel, onCancel, onConfirm, title, visible }: ConfirmDialogProps) {
  if (!visible) return null;

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <Pressable className="flex-1 items-center justify-center bg-black/40 p-5" onPress={onCancel}>
        <Pressable className="w-full max-w-[360px] gap-3 rounded-2xl bg-surface p-5" onPress={() => undefined} testID="confirm-dialog">
          <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{title}</Text>
          <Text className="text-base font-sans text-neutral-700">{body}</Text>
          <View className="gap-2">
            <Button disabled={busy} label={confirmLabel} onPress={onConfirm} testID="confirm-dialog-confirm" variant="danger" />
            <Button label={cancelLabel} onPress={onCancel} testID="confirm-dialog-cancel" variant="ghost" />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
