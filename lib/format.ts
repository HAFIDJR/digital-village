/**
 * Locale-aware formatting for the Indonesian civil service context.
 *
 * Every numeric formatter emits tabular-safe strings; pair them with the
 * `tnum` utility so columns never shift width while data refreshes.
 */

const ID = "id-ID";

/**
 * The village office runs on WIB.
 *
 * Date formatters are pinned to Asia/Jakarta so the dashboard reads like the
 * wall clock in the office regardless of where the server or the officer's
 * laptop sits. Without the pin, a 07:30 WIB shift start renders as "00.30" on a
 * UTC host, and a letter filed at 23:50 WIB is stamped with the wrong date.
 */
const TZ = "Asia/Jakarta";

const numberFormatter = new Intl.NumberFormat(ID);
const decimalFormatter = new Intl.NumberFormat(ID, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const currencyFormatter = new Intl.NumberFormat(ID, {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : numberFormatter.format(value);

export const formatDecimal = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : decimalFormatter.format(value);

/** "Rp 1.250.000" — space after the symbol reads cleaner in dense tables. */
export const formatCurrency = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(numeric)) return "—";
  return currencyFormatter.format(numeric).replace(/\u00a0/g, " ");
};

/** Compact form used in KPI cards: "4,8 rb", "1,2 jt". */
export function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  if (Math.abs(value) < 10_000) return numberFormatter.format(value);
  const units: [number, string][] = [
    [1_000_000_000, "M"],
    [1_000_000, "jt"],
    [1_000, "rb"],
  ];
  for (const [size, suffix] of units) {
    if (Math.abs(value) >= size) {
      return `${decimalFormatter.format(value / size)}${suffix}`;
    }
  }
  return numberFormatter.format(value);
}

/** Today's date in the long Indonesian civil format: "Kamis, 24 September 2026". */
export function formatLongDate(input: Date | string) {
  const date = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat(ID, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(date);
}

export function formatDate(input: Date | string | null | undefined) {
  if (!input) return "—";
  const date = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat(ID, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  }).format(date);
}

/** "24 Sep 2026 · 09.41 WIB" */
export function formatDateTime(input: Date | string | null | undefined) {
  if (!input) return "—";
  const date = typeof input === "string" ? new Date(input) : input;
  const day = new Intl.DateTimeFormat(ID, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  }).format(date);
  const time = new Intl.DateTimeFormat(ID, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  })
    .format(date)
    .replace(":", ".");
  return `${day} · ${time} WIB`;
}

/** Clock only, for the shift indicator: "09.41". */
export function formatClock(input: Date | string) {
  const date = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat(ID, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  })
    .format(date)
    .replace(":", ".");
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

const relativeFormatter = new Intl.RelativeTimeFormat(ID, { numeric: "auto" });

/**
 * "10 menit lalu" — always rendered from an absolute `now` that the caller
 * supplies, so server and client markup agree and hydration stays stable.
 */
export function formatRelative(input: Date | string, now: number | Date, short = false) {
  const date = typeof input === "string" ? new Date(input) : input;
  const nowMs = typeof now === "number" ? now : now.getTime();
  const diff = date.getTime() - nowMs;
  const abs = Math.abs(diff);

  if (abs < 45_000) return short ? "baru" : "baru saja";
  if (abs < 3_600_000) {
    const minutes = Math.round(diff / 60_000);
    return short ? `${Math.abs(minutes)} mnt` : relativeFormatter.format(minutes, "minute");
  }

  for (const [unit, ms] of RELATIVE_UNITS) {
    if (abs >= ms || unit === "minute") {
      const value = Math.round(diff / ms);
      if (short) {
        const suffix: Partial<Record<Intl.RelativeTimeFormatUnit, string>> = {
          year: "th",
          years: "th",
          quarter: "kw",
          quarters: "kw",
          month: "bln",
          months: "bln",
          week: "mgg",
          weeks: "mgg",
          day: "hr",
          days: "hr",
          hour: "jam",
          hours: "jam",
          minute: "mnt",
          minutes: "mnt",
          second: "dtk",
          seconds: "dtk",
        };
        return `${Math.abs(value)} ${suffix[unit] ?? ""}`.trim();
      }
      return relativeFormatter.format(value, unit);
    }
  }
  return "—";
}

/**
 * SLA countdown. Negative values mean the request is past its due date.
 * Returns a label plus the semantic bucket the UI colours by.
 */
export function formatSla(
  dueAt: Date | string | null,
  now: number | Date,
): { label: string; tone: "safe" | "warning" | "overdue" | "none" } {
  if (!dueAt) return { label: "Tanpa SLA", tone: "none" };
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const nowMs = typeof now === "number" ? now : now.getTime();
  const diff = due.getTime() - nowMs;

  if (diff < 0) {
    const overdue = Math.abs(diff);
    const days = Math.floor(overdue / 86_400_000);
    const hours = Math.floor((overdue % 86_400_000) / 3_600_000);
    return {
      label: days > 0 ? `Lewat ${days} hari` : `Lewat ${Math.max(hours, 1)} jam`,
      tone: "overdue",
    };
  }

  if (diff < 3_600_000) {
    return { label: `${Math.max(Math.round(diff / 60_000), 1)} menit lagi`, tone: "warning" };
  }
  if (diff < 86_400_000) {
    return { label: `${Math.floor(diff / 3_600_000)} jam lagi`, tone: "warning" };
  }
  return { label: `${Math.floor(diff / 86_400_000)} hari lagi`, tone: "safe" };
}

/**
 * NIK is printed grouped for legibility but never truncated: officers read all
 * sixteen digits when reconciling against a physical KTP.
 */
export function formatNik(nik: string | null | undefined, maskFirst = 0) {
  if (!nik) return "—";
  const groups = nik.match(/.{1,4}/g) ?? [nik];
  const joined = groups.join(" ");
  if (maskFirst <= 0) return joined;
  return `${"•".repeat(maskFirst)}${joined.slice(maskFirst)}`;
}

export function formatKk(kk: string | null | undefined) {
  if (!kk) return "—";
  return (kk.match(/.{1,4}/g) ?? [kk]).join(" ");
}

export function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

/** Age in whole years from an ISO birth date, evaluated against `now`. */
export function ageFrom(birthDate: string | Date, now: number | Date) {
  const birth = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  const nowDate = typeof now === "number" ? new Date(now) : now;
  let age = nowDate.getFullYear() - birth.getFullYear();
  const monthDelta = nowDate.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && nowDate.getDate() < birth.getDate())) age -= 1;
  return age;
}

/** Initials for avatar fallbacks: "Siti Rahmawati" -> "SR". */
export function initialsOf(name: string) {
  return (
    name
      .replace(/[^\p{L}\s.]/gu, "")
      .split(/\s+/)
      .filter((part) => part.length > 0)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Deterministic slug for announcement URLs. */
export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 200);
}
