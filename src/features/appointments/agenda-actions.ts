export type QuickActions = { complete: boolean; confirm: boolean; noShow: boolean };

export const isOpenStatus = (status: string) => status === "scheduled" || status === "confirmed";

// The buttons an agenda card shows at a glance. Everything else lives in the details pop-up.
export function quickActions(input: { canConfirm: boolean; endsAt: string; now: Date; status: string }): QuickActions {
  const open = isOpenStatus(input.status);

  return {
    complete: open,
    confirm: input.canConfirm && input.status === "scheduled" && new Date(input.endsAt) >= input.now,
    noShow: open,
  };
}
