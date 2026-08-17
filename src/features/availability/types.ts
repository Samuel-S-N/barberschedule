export type AvailableSlot = {
  endsAt: string;
  localDate: string;
  localTime: string;
  startsAt: string;
};

export type AvailableSlotRow = {
  ends_at: string;
  local_date: string;
  local_time: string;
  starts_at: string;
};

export type AvailableSlotsInput = {
  barberId: string;
  barberServiceId: string;
  localDate: string;
};
