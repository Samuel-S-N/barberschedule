export type DomainErrorCode =
  | "SLOT_UNAVAILABLE"
  | "DAILY_BOOKING_LIMIT"
  | "BOOKING_FORBIDDEN"
  | "SERVICE_UNAVAILABLE"
  | "BARBER_UNAVAILABLE"
  | "CUSTOMER_UNAVAILABLE"
  | "SCHEDULE_UNAVAILABLE"
  | "INVALID_BOOKING_START"
  | "APPOINTMENT_FORBIDDEN"
  | "APPOINTMENT_LIFECYCLE_LOCKED"
  | "APPOINTMENT_NOT_FOUND"
  | "APPOINTMENT_STATUS_INVALID"
  | "AGENDA_INVALID_RANGE"
  | "RECURRENCE_INVALID"
  | "RECURRENCE_REQUEST_FAILED"
  | "OWNER_AGENDA_REQUEST_FAILED"
  | "OWNER_STATUS_REQUEST_FAILED"
  | "APPOINTMENT_REQUEST_FAILED"
  | "BOOKING_REQUEST_FAILED"
  | "PROFILE_INVALID"
  | "ACCOUNT_DELETION_BLOCKED"
  | "ACCOUNT_REQUEST_FAILED"
  | "BARBER_NOT_LINKED"
  | "BARBER_INVITE_CONFLICT"
  | "COMPENSATION_INVALID"
  | "EARNINGS_INVALID_RANGE"
  | "BARBER_REQUEST_FAILED";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function toDomainError(error: { code?: string; message?: string }): DomainError {
  switch (error.code) {
    case "P0001":
    case "23P01":
      return new DomainError("SLOT_UNAVAILABLE", "That time is no longer available.");
    case "P0002":
      return new DomainError(
        "DAILY_BOOKING_LIMIT",
        "You already have an appointment on this local shop date.",
      );
    case "P0003":
    case "P0008":
    case "42501":
      return new DomainError("BOOKING_FORBIDDEN", "You cannot create this appointment.");
    case "P0004":
      return new DomainError("SERVICE_UNAVAILABLE", "That service is no longer available.");
    case "P0005":
      return new DomainError("BARBER_UNAVAILABLE", "That barber is no longer available.");
    case "P0006":
      return new DomainError("SCHEDULE_UNAVAILABLE", "That time is outside the schedule.");
    case "P0007":
      return new DomainError("CUSTOMER_UNAVAILABLE", "That customer is no longer available.");
    case "P0009":
      return new DomainError("INVALID_BOOKING_START", "Choose a future available time.");
    case "P0010":
      return new DomainError(
        "APPOINTMENT_FORBIDDEN",
        "You cannot change this appointment.",
      );
    case "P0011":
      return new DomainError(
        "APPOINTMENT_LIFECYCLE_LOCKED",
        "Appointments can only be changed at least 90 minutes before they start.",
      );
    case "P0012":
      return new DomainError(
        "APPOINTMENT_NOT_FOUND",
        "That appointment is no longer available to change.",
      );
    case "P0013":
      return new DomainError(
        "APPOINTMENT_STATUS_INVALID",
        "That appointment cannot move to the requested status.",
      );
    case "P0014":
      return new DomainError("AGENDA_INVALID_RANGE", "Choose a valid agenda range.");
    case "P0015":
      return new DomainError("RECURRENCE_INVALID", "Choose a valid recurrence rule and 90-day window.");
    case "P0017":
      return new DomainError("PROFILE_INVALID", "Enter your name and a valid phone number.");
    case "P0018":
      return new DomainError(
        "ACCOUNT_DELETION_BLOCKED",
        "Cancel your upcoming appointments (or contact the shop about your recurring schedule) before deleting your account.",
      );
    case "P0019":
      return new DomainError("BARBER_NOT_LINKED", "This account is not linked to an active barber.");
    case "P0020":
      return new DomainError("BARBER_INVITE_CONFLICT", "This barber already has an account or the email is in use.");
    case "P0021":
      return new DomainError("COMPENSATION_INVALID", "Enter a valid commission or chair rental.");
    case "P0022":
      return new DomainError("EARNINGS_INVALID_RANGE", "Choose a period of up to 92 days.");
    default:
      return new DomainError("BOOKING_REQUEST_FAILED", "Unable to create the appointment.");
  }
}
