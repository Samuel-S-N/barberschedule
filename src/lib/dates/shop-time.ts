const shopTimeZone = "America/Sao_Paulo";

type LocalDateTime = {
  localDate: string;
  localTime: string;
};

const formatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  timeZone: shopTimeZone,
  year: "numeric",
});

function formatParts(instant: Date): LocalDateTime {
  const parts = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    localDate: `${parts.year}-${parts.month}-${parts.day}`,
    localTime: `${parts.hour}:${parts.minute}`,
  };
}

function parseLocalDateTime(localDate: string, localTime: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);

  if (!match || !/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) {
    throw new RangeError("Use local date YYYY-MM-DD and time HH:mm.");
  }

  const [, year, month, day] = match;
  const [hour, minute] = localTime.split(":").map(Number);
  const target = Date.UTC(Number(year), Number(month) - 1, Number(day), hour, minute);
  const date = new Date(target);

  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) {
    throw new RangeError("Use a valid local date.");
  }

  return target;
}

export function formatInstantInShopTime(instant: Date) {
  return formatParts(instant);
}

export function localDateTimeToInstant(localDate: string, localTime: string) {
  const target = parseLocalDateTime(localDate, localTime);
  let instant = target;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const local = formatParts(new Date(instant));
    const [year, month, day] = local.localDate.split("-").map(Number);
    const [hour, minute] = local.localTime.split(":").map(Number);
    instant = target - (Date.UTC(year, month - 1, day, hour, minute) - instant);
  }

  const resolved = new Date(instant);

  if (
    formatParts(resolved).localDate !== localDate
    || formatParts(resolved).localTime !== localTime
  ) {
    throw new RangeError("Local date and time do not exist in the shop timezone.");
  }

  return resolved;
}
