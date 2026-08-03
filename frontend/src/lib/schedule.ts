import type { ScheduleTrigger } from "./types";

/** Calendrier des programmations, côté UI.
 *
 *  Miroir de `desktop/src/schedule.rs` : le backend reste l'autorité (c'est lui
 *  qui écrit `nextRunAt`), mais l'UI a besoin de la même règle pour annoncer
 *  « prochaine exécution : … » pendant la saisie, avant tout enregistrement — et
 *  le mode démo, sans Rust, s'en sert pour de bon. Les deux implémentations
 *  doivent rester alignées ; leurs cas limites sont testés côté Rust. */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Prochaine occurrence strictement postérieure à `after`, ou `null` quand la
 *  programmation n'a plus d'avenir (occurrence unique passée, heure illisible,
 *  aucun jour coché). */
export function nextRun(trigger: ScheduleTrigger, after: Date = new Date()): Date | null {
  switch (trigger.kind) {
    case "interval": {
      // Une période nulle enchaînerait les dumps sans fin.
      const minutes = Math.max(1, Math.floor(trigger.everyMinutes));
      return new Date(after.getTime() + minutes * MINUTE);
    }
    case "daily": {
      const time = parseTime(trigger.time);
      return time && firstMatch(after, 366, () => time);
    }
    case "weekly": {
      const time = parseTime(trigger.time);
      if (!time || trigger.weekdays.length === 0) return null;
      return firstMatch(after, 366, (date) =>
        trigger.weekdays.includes(isoWeekday(date)) ? time : null,
      );
    }
    case "monthly": {
      const time = parseTime(trigger.time);
      if (!time) return null;
      const wanted = clamp(Math.floor(trigger.dayOfMonth), 1, 31);
      return firstMatch(after, 366, (date) => {
        const day = Math.min(wanted, daysInMonth(date.getFullYear(), date.getMonth()));
        return date.getDate() === day ? time : null;
      });
    }
    case "once": {
      const at = parseLocalDateTime(trigger.at);
      return at && at > after ? at : null;
    }
  }
}

/** Balaie les jours à partir de celui de `after` et renvoie le premier instant
 *  strictement postérieur. */
function firstMatch(
  after: Date,
  maxDays: number,
  pick: (date: Date) => { h: number; m: number } | null,
): Date | null {
  for (let offset = 0; offset < maxDays; offset++) {
    // Avancer par composantes de date plutôt qu'en ajoutant 24 h : les jours de
    // changement d'heure ne durent pas 24 h et feraient sauter une date.
    const date = new Date(after.getFullYear(), after.getMonth(), after.getDate() + offset);
    const time = pick(date);
    if (!time) continue;
    // Reconstruit depuis les composantes locales : un décalage horaire au milieu
    // de la période ne doit pas faire glisser l'heure affichée.
    const candidate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      time.h,
      time.m,
      0,
      0,
    );
    if (candidate > after) return candidate;
  }
  return null;
}

/** "HH:MM" → composantes, ou `null` si illisible. */
function parseTime(value: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

/** Accepte le "YYYY-MM-DDTHH:MM" d'un `<input type="datetime-local">` comme un
 *  RFC 3339 complet (ce que renvoie le backend). */
export function parseLocalDateTime(value: string): Date | null {
  const v = value.trim();
  const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v);
  if (local) {
    const [, y, mo, d, h, mi, s] = local;
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  }
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** 1 = lundi … 7 = dimanche (`getDay()` compte à partir de dimanche). */
export function isoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Valeur pour un `<input type="datetime-local">` : heure locale, sans fuseau. */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Déclencheur par défaut d'une nouvelle programmation : tous les jours à 2 h,
 *  l'heure creuse habituelle des sauvegardes. */
export function defaultTrigger(kind: ScheduleTrigger["kind"]): ScheduleTrigger {
  switch (kind) {
    case "interval":
      return { kind: "interval", everyMinutes: 360 };
    case "daily":
      return { kind: "daily", time: "02:00" };
    case "weekly":
      return { kind: "weekly", time: "02:00", weekdays: [1] };
    case "monthly":
      return { kind: "monthly", time: "02:00", dayOfMonth: 1 };
    case "once": {
      const tomorrow = new Date(Date.now() + DAY);
      tomorrow.setHours(2, 0, 0, 0);
      return { kind: "once", at: toDateTimeLocalValue(tomorrow) };
    }
  }
}
