import { Text, View } from "react-native";

export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";

export type StatusBadgeProps = {
  status: AppointmentStatus;
  label?: string;
  testID?: string;
};

const DEFAULT_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

const CLASSNAME: Record<AppointmentStatus, string> = {
  scheduled: "bg-warning-500/10",
  confirmed: "bg-success-500/10",
  completed: "bg-neutral-100",
  cancelled: "bg-neutral-100",
  no_show: "bg-danger-500/10",
};

const TEXT_CLASSNAME: Record<AppointmentStatus, string> = {
  scheduled: "text-warning-500",
  confirmed: "text-success-500",
  completed: "text-neutral-600",
  cancelled: "text-neutral-400",
  no_show: "text-danger-500",
};

const DOT_CLASSNAME: Record<AppointmentStatus, string> = {
  scheduled: "bg-warning-500",
  confirmed: "bg-success-500",
  completed: "bg-neutral-600",
  cancelled: "bg-neutral-400",
  no_show: "bg-danger-500",
};

export function StatusBadge({ status, label, testID }: StatusBadgeProps) {
  const resolvedLabel = label ?? DEFAULT_LABEL[status];

  return (
    <View
      accessibilityLabel={resolvedLabel}
      className={`flex-row items-center gap-1.5 self-start rounded-full px-3 py-1 ${CLASSNAME[status]}`}
      testID={testID}
    >
      <View className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSNAME[status]}`} />
      <Text className={`text-xs font-sans-semibold ${TEXT_CLASSNAME[status]}`}>{resolvedLabel}</Text>
    </View>
  );
}
