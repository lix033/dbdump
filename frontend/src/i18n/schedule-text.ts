import type { Locale } from "./config";
import type { Dictionary } from "./dictionaries/en";
import { formatDateTime, formatDuration, formatWeekday } from "./format";
import { parseLocalDateTime } from "@/lib/schedule";
import type { ScheduleTrigger } from "@/lib/types";

/** Résumé lisible d'un déclencheur : « Chaque jour à 02:00 », « lun., jeu. à
 *  02:00 ». Les noms de jours et les dates passent par `Intl`, donc une langue
 *  ajoutée n'a pas sept jours de plus à traduire. */
export function triggerSummary(
  trigger: ScheduleTrigger,
  t: Dictionary,
  locale: Locale,
): string {
  const s = t.app.schedules.summary;
  switch (trigger.kind) {
    case "interval":
      return s.interval(formatDuration(trigger.everyMinutes, t, locale));
    case "daily":
      return s.daily(trigger.time);
    case "weekly": {
      if (trigger.weekdays.length === 0) return s.frozen;
      const days = [...trigger.weekdays]
        .sort((a, b) => a - b)
        .map((day) => formatWeekday(day, locale))
        .join(", ");
      return s.weekly(days, trigger.time);
    }
    case "monthly":
      return s.monthly(trigger.dayOfMonth, trigger.time);
    case "once": {
      const at = parseLocalDateTime(trigger.at);
      return at ? s.once(formatDateTime(at, locale)) : s.frozen;
    }
  }
}
