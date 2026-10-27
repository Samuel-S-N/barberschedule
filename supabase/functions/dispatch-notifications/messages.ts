export type Locale = "en" | "pt" | "es";

const LOCALE_TAG: Record<Locale, string> = { en: "en-GB", es: "es-ES", pt: "pt-BR" };
const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

type Template = { title: string; body: (service: string, when: string) => string };
type Catalog = Record<Locale, Template>;

export function normalizeLocale(value: unknown): Locale {
  return value === "pt" || value === "es" ? value : "en";
}

const GENERIC_SERVICE: Record<Locale, string> = { en: "Appointment", es: "Cita", pt: "Agendamento" };

const UNKNOWN: Record<Locale, string> = {
  en: "You have a new notification.",
  es: "Tienes una nueva notificación.",
  pt: "Você tem uma nova notificação.",
};

const APPOINTMENT_EVENTS: Record<string, Catalog> = {
  "appointment.booked": {
    en: { body: (s, w) => `${s} on ${w}.`, title: "Appointment booked" },
    es: { body: (s, w) => `${s} el ${w}.`, title: "Cita reservada" },
    pt: { body: (s, w) => `${s} em ${w}.`, title: "Agendamento confirmado" },
  },
  "appointment.cancelled": {
    en: { body: (s, w) => `${s} on ${w} was cancelled.`, title: "Appointment cancelled" },
    es: { body: (s, w) => `Cita de ${s} el ${w} fue cancelada.`, title: "Cita cancelada" },
    pt: { body: (s, w) => `Agendamento de ${s} em ${w} foi cancelado.`, title: "Agendamento cancelado" },
  },
  "appointment.rescheduled": {
    en: { body: (s, w) => `${s} moved to ${w}.`, title: "Appointment rescheduled" },
    es: { body: (s, w) => `Cita de ${s} reprogramada para ${w}.`, title: "Cita reprogramada" },
    pt: { body: (s, w) => `Agendamento de ${s} remarcado para ${w}.`, title: "Agendamento remarcado" },
  },
  "appointment.reminder": {
    en: { body: (s, w) => `Coming up: ${s} on ${w}.`, title: "Appointment reminder" },
    es: { body: (s, w) => `Próxima cita: ${s} el ${w}.`, title: "Recordatorio de cita" },
    pt: { body: (s, w) => `Em breve: ${s} em ${w}.`, title: "Lembrete de agendamento" },
  },
};

const CONFLICT: Catalog = {
  en: { body: (_s, w) => `The recurring booking on ${w} has a conflict and needs a decision.`, title: "Recurring booking conflict" },
  es: { body: (_s, w) => `La cita recurrente del ${w} tiene un conflicto y requiere una decisión.`, title: "Conflicto en cita recurrente" },
  pt: { body: (_s, w) => `O agendamento recorrente de ${w} tem um conflito e precisa de uma decisão.`, title: "Conflito em agendamento recorrente" },
};

type Ctx = { customer: string; frequency: string; service: string; when: string };
type ExtendedTemplate = { title: string; body: (c: Ctx) => string };

const FREQUENCY: Record<Locale, { every: (weeks: number) => string; one: string; two: string }> = {
  en: { every: (weeks) => `every ${weeks} weeks`, one: "weekly", two: "every 2 weeks" },
  es: { every: (weeks) => `cada ${weeks} semanas`, one: "semanal", two: "cada 2 semanas" },
  pt: { every: (weeks) => `a cada ${weeks} semanas`, one: "semanal", two: "a cada 2 semanas" },
};

function frequency(language: Locale, weeks: unknown) {
  const count = Number(weeks);
  const names = FREQUENCY[language];

  if (count === 2) return names.two;
  if (Number.isInteger(count) && count > 2) return names.every(count);

  return names.one;
}

const EXTENDED: Record<string, Record<Locale, ExtendedTemplate>> = {
  "appointment.confirmed": {
    en: { body: (c) => `${c.service} on ${c.when} is confirmed.`, title: "Appointment confirmed" },
    es: { body: (c) => `Tu cita de ${c.service} el ${c.when} está confirmada.`, title: "Cita confirmada" },
    pt: { body: (c) => `${c.service} em ${c.when} foi confirmado.`, title: "Agendamento confirmado" },
  },
  "staff.awaiting_confirmation": {
    en: { body: (c) => `${c.customer} · ${c.service} · ${c.when}`, title: "Awaiting confirmation" },
    es: { body: (c) => `${c.customer} · ${c.service} · ${c.when}`, title: "Pendiente de confirmación" },
    pt: { body: (c) => `${c.customer} · ${c.service} · ${c.when}`, title: "Aguardando confirmação" },
  },
  "staff.booked": {
    en: { body: (c) => `${c.customer} · ${c.service} · ${c.when}`, title: "New appointment" },
    es: { body: (c) => `${c.customer} · ${c.service} · ${c.when}`, title: "Nueva cita" },
    pt: { body: (c) => `${c.customer} · ${c.service} · ${c.when}`, title: "Novo agendamento" },
  },
  "staff.cancelled": {
    en: { body: (c) => `${c.customer} cancelled ${c.service} on ${c.when}.`, title: "Appointment cancelled" },
    es: { body: (c) => `${c.customer} canceló ${c.service} el ${c.when}.`, title: "Cita cancelada" },
    pt: { body: (c) => `${c.customer} cancelou ${c.service} em ${c.when}.`, title: "Agendamento cancelado" },
  },
  "staff.rescheduled": {
    en: { body: (c) => `${c.customer} · ${c.service} moved to ${c.when}.`, title: "Appointment rescheduled" },
    es: { body: (c) => `${c.customer} · ${c.service} reprogramada para ${c.when}.`, title: "Cita reprogramada" },
    pt: { body: (c) => `${c.customer} · ${c.service} remarcado para ${c.when}.`, title: "Agendamento remarcado" },
  },
  "recurrence.requested": {
    en: { body: (c) => `${c.customer} · ${c.service} · ${c.frequency}`, title: "New recurrence request" },
    es: { body: (c) => `${c.customer} · ${c.service} · ${c.frequency}`, title: "Nuevo pedido de recurrencia" },
    pt: { body: (c) => `${c.customer} · ${c.service} · ${c.frequency}`, title: "Novo pedido de recorrência" },
  },
  "recurrence.accepted": {
    en: { body: (c) => `${c.service} · ${c.frequency}`, title: "Recurrence accepted" },
    es: { body: (c) => `${c.service} · ${c.frequency}`, title: "Recurrencia aceptada" },
    pt: { body: (c) => `${c.service} · ${c.frequency}`, title: "Recorrência aceita" },
  },
  "recurrence.cancel_requested": {
    en: { body: (c) => `${c.customer} · ${c.service} · ${c.frequency}`, title: "Plan cancellation requested" },
    es: { body: (c) => `${c.customer} · ${c.service} · ${c.frequency}`, title: "Cancelación de plan solicitada" },
    pt: { body: (c) => `${c.customer} · ${c.service} · ${c.frequency}`, title: "Cancelamento de plano solicitado" },
  },
  "recurrence.cancel_accepted": {
    en: { body: (c) => `${c.service} · ${c.frequency}`, title: "Plan cancelled" },
    es: { body: (c) => `${c.service} · ${c.frequency}`, title: "Plan cancelado" },
    pt: { body: (c) => `${c.service} · ${c.frequency}`, title: "Plano cancelado" },
  },
  "recurrence.cancel_declined": {
    en: { body: (c) => `${c.service} · ${c.frequency}`, title: "Cancellation declined" },
    es: { body: (c) => `${c.service} · ${c.frequency}`, title: "Cancelación rechazada" },
    pt: { body: (c) => `${c.service} · ${c.frequency}`, title: "Cancelamento recusado" },
  },
  "recurrence.rejected": {
    en: { body: (c) => `${c.service} · ${c.frequency}`, title: "Recurrence declined" },
    es: { body: (c) => `${c.service} · ${c.frequency}`, title: "Recurrencia rechazada" },
    pt: { body: (c) => `${c.service} · ${c.frequency}`, title: "Recorrência recusada" },
  },
};

const MONEY_LOCALE_TAG = LOCALE_TAG;

function formatMoney(cents: unknown, locale: Locale) {
  return new Intl.NumberFormat(MONEY_LOCALE_TAG[locale], { currency: "BRL", style: "currency" }).format(Number(cents) / 100);
}

const PAYOUT_TITLES: Record<string, Record<Locale, string>> = {
  "payout.due": { en: "Payout day", es: "Hoy toca pagar a barberos", pt: "Hoje é dia de repasse" },
  "payout.paid": { en: "Payout received", es: "Pago recibido", pt: "Repasse recebido" },
};

function formatWhen(startsAt: unknown, locale: Locale, timeZone: string) {
  const date = new Date(String(startsAt));

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    timeZone,
    weekday: "short",
  }).format(date);
}

function formatDate(occurrenceDate: unknown, locale: Locale) {
  const date = new Date(`${String(occurrenceDate)}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { day: "numeric", month: "short", timeZone: "UTC", weekday: "short" }).format(date);
}

export function buildMessage(
  eventType: string,
  locale: unknown,
  payload: Record<string, unknown>,
  timeZone: string = DEFAULT_TIME_ZONE,
) {
  const language = normalizeLocale(locale);

  if (eventType === "recurrence.conflict") {
    const template = CONFLICT[language];

    return { body: template.body("", formatDate(payload.occurrence_date, language)), title: template.title };
  }

  if (eventType === "payout.due") {
    const names = Array.isArray(payload.barber_names) ? payload.barber_names.map(String) : [];
    const extra = Number(payload.count) - names.length;

    return { body: `${names.join(", ")}${extra > 0 ? ` +${extra}` : ""}`, title: PAYOUT_TITLES[eventType][language] };
  }

  if (eventType === "payout.paid") {
    return { body: `${formatMoney(payload.amount_cents, language)} · ${formatDate(payload.paid_on, language)}`, title: PAYOUT_TITLES[eventType][language] };
  }

  const extended = EXTENDED[eventType];

  if (extended) {
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    const template = extended[language];

    return {
      body: template.body({
        customer: text(payload.customer_name),
        frequency: frequency(language, payload.interval_weeks),
        service: text(payload.service_name) || GENERIC_SERVICE[language],
        when: formatWhen(payload.starts_at, language, timeZone),
      }),
      title: template.title,
    };
  }

  const catalog = APPOINTMENT_EVENTS[eventType];

  if (!catalog) {
    return { body: UNKNOWN[language], title: "Barberschedule" };
  }

  const template = catalog[language];
  const service = typeof payload.service_name === "string" && payload.service_name ? payload.service_name : GENERIC_SERVICE[language];

  return { body: template.body(service, formatWhen(payload.starts_at, language, timeZone)), title: template.title };
}
