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

const FREQUENCY: Record<Locale, Record<1 | 2, string>> = {
  en: { 1: "weekly", 2: "every 2 weeks" },
  es: { 1: "semanal", 2: "cada 2 semanas" },
  pt: { 1: "semanal", 2: "a cada 2 semanas" },
};

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
  "recurrence.rejected": {
    en: { body: (c) => `${c.service} · ${c.frequency}`, title: "Recurrence declined" },
    es: { body: (c) => `${c.service} · ${c.frequency}`, title: "Recurrencia rechazada" },
    pt: { body: (c) => `${c.service} · ${c.frequency}`, title: "Recorrência recusada" },
  },
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

  const extended = EXTENDED[eventType];

  if (extended) {
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    const template = extended[language];

    return {
      body: template.body({
        customer: text(payload.customer_name),
        frequency: FREQUENCY[language][Number(payload.interval_weeks) === 2 ? 2 : 1],
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
