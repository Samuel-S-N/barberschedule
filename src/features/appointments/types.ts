export type AppointmentSource = "customer" | "owner" | "recurrence";

export type BookingInput = {
  barberServiceId: string;
  customerId: string;
  notes?: string | null;
  source: AppointmentSource;
  startsAt: string;
};

export type AppointmentRow = {
  barber_buffer_minutes_snapshot: number;
  barber_id: string;
  barber_service_id: string;
  created_at: string;
  customer_id: string;
  ends_at: string;
  id: string;
  notes: string | null;
  occupied_until: string;
  service_duration_minutes_snapshot: number;
  service_id: string;
  service_name_snapshot: string;
  service_price_cents_snapshot: number;
  shop_id: string;
  source: AppointmentSource;
  starts_at: string;
  status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
  updated_at: string;
};

export type Appointment = {
  barberBufferMinutesSnapshot: number;
  barberId: string;
  barberServiceId: string;
  createdAt: string;
  customerId: string;
  endsAt: string;
  id: string;
  notes: string | null;
  occupiedUntil: string;
  serviceDurationMinutesSnapshot: number;
  serviceId: string;
  serviceNameSnapshot: string;
  servicePriceCentsSnapshot: number;
  shopId: string;
  source: AppointmentSource;
  startsAt: string;
  status: AppointmentRow["status"];
  updatedAt: string;
};
