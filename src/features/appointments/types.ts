export type AppointmentSource = "customer" | "owner" | "recurrence" | "professional";

export type BookingInput = {
  professionalServiceId: string;
  customerId: string;
  notes?: string | null;
  source: AppointmentSource;
  startsAt: string;
};

export type AppointmentRow = {
  professional_buffer_minutes_snapshot: number;
  professional_id: string;
  professional_service_id: string;
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
  professionalBufferMinutesSnapshot: number;
  professionalId: string;
  professionalServiceId: string;
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
