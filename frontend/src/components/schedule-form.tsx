"use client";

import { useMemo, useState } from "react";
import { FolderOpen } from "lucide-react";
import { getBackend } from "@/lib/backend";
import { ENGINES } from "@/lib/engines";
import { defaultTrigger, nextRun, toDateTimeLocalValue } from "@/lib/schedule";
import { useI18n } from "@/i18n/provider";
import { formatDateTime, formatWeekday } from "@/i18n/format";
import type {
  Connection,
  DumpFormat,
  Schedule,
  ScheduleDraft,
  ScheduleTrigger,
  TriggerKind,
} from "@/lib/types";
import { DestinationPicker } from "@/components/destination-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Périodes proposées, en minutes. Une liste fermée plutôt qu'un champ libre :
 *  « toutes les 3 minutes » sur une grosse base ne finirait jamais. */
const INTERVALS = [30, 60, 120, 180, 360, 720] as const;

/** Nombre de sauvegardes conservées. 0 = toutes. */
const RETENTIONS = [0, 3, 7, 14, 30] as const;

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Modèle par défaut : horodaté, donc jamais deux exécutions dans le même
 *  fichier. */
const DEFAULT_TEMPLATE = "{db}_{datetime}";

function emptyDraft(connection: Connection | undefined): ScheduleDraft {
  const engine = connection?.engine ?? "postgres";
  const format = ENGINES[engine].formats[0];
  return {
    name: "",
    connectionId: connection?.id ?? "",
    trigger: defaultTrigger("daily"),
    enabled: true,
    keepLast: 0,
    options: {
      format: format.value,
      destinationDir: "",
      fileName: `${DEFAULT_TEMPLATE}${format.extension}`,
      schemaOnly: false,
      dataOnly: false,
      clean: false,
      gzip: false,
      excludeTables: [],
      destinationIds: [],
      keepLocal: true,
    },
  };
}

export function ScheduleForm({
  open,
  onOpenChange,
  editing,
  connections,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Schedule | null;
  connections: Connection[];
  onSaved: (schedule: Schedule, created: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {/* key : chaque ouverture repart du modèle voulu, sans effet de synchro. */}
        <Body
          key={editing?.id ?? "new"}
          editing={editing}
          connections={connections}
          onSaved={onSaved}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function Body({
  editing,
  connections,
  onSaved,
  onClose,
}: {
  editing: Schedule | null;
  connections: Connection[];
  onSaved: (schedule: Schedule, created: boolean) => void;
  onClose: () => void;
}) {
  const backend = getBackend();
  const { t, locale } = useI18n();
  const copy = t.app.schedules.form;

  // À l'édition on ne reprend que les champs du formulaire : l'identifiant et
  // les dates d'exécution appartiennent au backend.
  const [draft, setDraft] = useState<ScheduleDraft>(() =>
    editing
      ? {
          name: editing.name,
          connectionId: editing.connectionId,
          options: editing.options,
          trigger: editing.trigger,
          enabled: editing.enabled,
          keepLast: editing.keepLast,
        }
      : emptyDraft(connections[0]),
  );
  const [excludeRaw, setExcludeRaw] = useState(draft.options.excludeTables.join("\n"));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const connection = connections.find((c) => c.id === draft.connectionId);
  const engine = connection?.engine ?? "postgres";
  const formats = ENGINES[engine].formats;

  const patch = (values: Partial<ScheduleDraft>) => setDraft((d) => ({ ...d, ...values }));
  const patchOptions = (values: Partial<ScheduleDraft["options"]>) =>
    setDraft((d) => ({ ...d, options: { ...d.options, ...values } }));

  // Aperçu de l'échéance pendant la saisie : le backend recalculera la même
  // chose à l'enregistrement (miroir de schedule.rs).
  const preview = useMemo(() => nextRun(draft.trigger), [draft.trigger]);

  async function browse() {
    const dir = await backend.pickDirectory();
    if (dir) patchOptions({ destinationDir: dir });
  }

  async function submit() {
    if (!draft.name.trim()) return setError(copy.missingName);
    if (!draft.connectionId) return setError(copy.missingConnection);
    if (!draft.options.destinationDir.trim()) return setError(copy.missingDestination);

    setSaving(true);
    setError(null);
    try {
      const saved = await backend.saveSchedule(
        {
          ...draft,
          name: draft.name.trim(),
          options: {
            ...draft.options,
            excludeTables: excludeRaw
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          },
        },
        editing?.id,
      );
      onSaved(saved, !editing);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? copy.editTitle : copy.newTitle}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-2">
        <div className="grid gap-2">
          <Label htmlFor="schedule-name">{copy.name}</Label>
          <Input
            id="schedule-name"
            value={draft.name}
            placeholder={copy.namePlaceholder}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="schedule-connection">{copy.connection}</Label>
          <Select
            value={draft.connectionId}
            onValueChange={(value) => {
              // Changer de moteur peut invalider le format retenu.
              const next = connections.find((c) => c.id === value);
              const available = ENGINES[next?.engine ?? "postgres"].formats;
              const keep = available.find((f) => f.value === draft.options.format);
              const chosen = keep ?? available[0];
              setDraft((d) => ({
                ...d,
                connectionId: value,
                options: {
                  ...d.options,
                  format: chosen.value,
                  fileName: `${DEFAULT_TEMPLATE}${chosen.extension}`,
                },
              }));
            }}
          >
            <SelectTrigger id="schedule-connection">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {connections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} · {ENGINES[c.engine].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TriggerFields
          trigger={draft.trigger}
          onChange={(trigger) => patch({ trigger })}
        />

        <div className="grid gap-2">
          <Label>{copy.destination}</Label>
          <div className="flex gap-2">
            <Input
              value={draft.options.destinationDir}
              placeholder={copy.noFolder}
              onChange={(e) => patchOptions({ destinationDir: e.target.value })}
            />
            <Button type="button" variant="outline" onClick={browse}>
              <FolderOpen className="size-4" />
              {copy.browse}
            </Button>
          </div>
        </div>

        <div className="grid gap-2 rounded-xl border p-3">
          <Label>{t.app.picker.title}</Label>
          <DestinationPicker
            selected={draft.options.destinationIds}
            onSelect={(destinationIds) => patchOptions({ destinationIds })}
            keepLocal={draft.options.keepLocal}
            onKeepLocal={(keepLocal) => patchOptions({ keepLocal })}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="schedule-filename">{copy.fileName}</Label>
          <Input
            id="schedule-filename"
            value={draft.options.fileName}
            className="font-mono text-xs"
            onChange={(e) => patchOptions({ fileName: e.target.value })}
          />
          <p className="text-muted-foreground text-xs">{copy.fileNameHint}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="schedule-format">{copy.format}</Label>
            <Select
              value={draft.options.format}
              onValueChange={(value) => patchOptions({ format: value as DumpFormat })}
            >
              <SelectTrigger id="schedule-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formats.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {t.app.formats[engine][f.value]?.label ?? f.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="schedule-keep">{copy.retention}</Label>
            <Select
              value={String(draft.keepLast)}
              onValueChange={(value) => patch({ keepLast: Number(value) })}
            >
              <SelectTrigger id="schedule-keep">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RETENTIONS.map((count) => (
                  <SelectItem key={count} value={String(count)}>
                    {count === 0
                      ? t.app.schedules.keepAll
                      : t.app.schedules.keepLastValue(count)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {draft.keepLast > 0 && (
          <p className="text-muted-foreground -mt-2 text-xs">{copy.retentionHint}</p>
        )}

        <div className="grid gap-3 rounded-xl border p-3">
          <Label>{copy.options}</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle
              id="schedule-schema"
              label={copy.schemaOnly}
              checked={draft.options.schemaOnly}
              onChange={(v) => patchOptions({ schemaOnly: v, dataOnly: v ? false : draft.options.dataOnly })}
            />
            <Toggle
              id="schedule-data"
              label={copy.dataOnly}
              checked={draft.options.dataOnly}
              onChange={(v) => patchOptions({ dataOnly: v, schemaOnly: v ? false : draft.options.schemaOnly })}
            />
            <Toggle
              id="schedule-clean"
              label={copy.clean}
              checked={draft.options.clean}
              onChange={(v) => patchOptions({ clean: v })}
            />
            <Toggle
              id="schedule-gzip"
              label={copy.gzip}
              checked={draft.options.gzip}
              onChange={(v) => patchOptions({ gzip: v })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="schedule-exclude">{copy.excludeTables}</Label>
            <textarea
              id="schedule-exclude"
              rows={2}
              placeholder={"logs\nsessions"}
              value={excludeRaw}
              onChange={(e) => setExcludeRaw(e.target.value)}
              className="border-input bg-transparent placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 min-h-16 w-full rounded-lg border px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-[3px]"
            />
            <p className="text-muted-foreground text-xs">{copy.excludeHint}</p>
          </div>
        </div>

        <Toggle
          id="schedule-enabled"
          label={copy.enabled}
          checked={draft.enabled}
          onChange={(v) => patch({ enabled: v })}
        />

        <p
          className={`text-xs ${preview ? "text-muted-foreground" : "text-warning-foreground bg-warning/15 rounded-lg px-3 py-2"}`}
        >
          {preview ? copy.nextRunPreview(formatDateTime(preview, locale)) : copy.nextRunNever}
        </p>

        {error && (
          <p className="text-destructive text-sm whitespace-pre-wrap" role="alert">
            {error}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {copy.cancel}
        </Button>
        <Button onClick={submit} disabled={saving}>
          {copy.save}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Les champs propres au type de déclencheur choisi. */
function TriggerFields({
  trigger,
  onChange,
}: {
  trigger: ScheduleTrigger;
  onChange: (trigger: ScheduleTrigger) => void;
}) {
  const { t, locale } = useI18n();
  const copy = t.app.schedules.form;

  const time = "time" in trigger ? trigger.time : "02:00";
  const setTime = (value: string) => {
    if ("time" in trigger) onChange({ ...trigger, time: value });
  };

  return (
    <div className="grid gap-3 rounded-xl border p-3">
      <div className="grid gap-2">
        <Label htmlFor="schedule-kind">{copy.when}</Label>
        <Select
          value={trigger.kind}
          onValueChange={(value) => onChange(defaultTrigger(value as TriggerKind))}
        >
          <SelectTrigger id="schedule-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["interval", "daily", "weekly", "monthly", "once"] as const).map((kind) => (
              <SelectItem key={kind} value={kind}>
                {copy.kind[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {trigger.kind === "interval" && (
        <div className="grid gap-2">
          <Label htmlFor="schedule-every">{copy.every}</Label>
          <Select
            value={String(trigger.everyMinutes)}
            onValueChange={(value) =>
              onChange({ kind: "interval", everyMinutes: Number(value) })
            }
          >
            <SelectTrigger id="schedule-every">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {minutes < 60
                    ? `${minutes} ${t.app.duration.minutes}`
                    : `${minutes / 60} ${t.app.duration.hours}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {trigger.kind === "weekly" && (
        <div className="grid gap-2">
          <Label>{copy.weekdays}</Label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((day) => {
              const on = trigger.weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onChange({
                      ...trigger,
                      weekdays: on
                        ? trigger.weekdays.filter((d) => d !== day)
                        : [...trigger.weekdays, day],
                    })
                  }
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    on
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-accent text-muted-foreground"
                  }`}
                >
                  {formatWeekday(day, locale)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {trigger.kind === "monthly" && (
        <div className="grid gap-2">
          <Label htmlFor="schedule-day">{copy.dayOfMonth}</Label>
          <Select
            value={String(trigger.dayOfMonth)}
            onValueChange={(value) => onChange({ ...trigger, dayOfMonth: Number(value) })}
          >
            <SelectTrigger id="schedule-day" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <SelectItem key={day} value={String(day)}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">{copy.clampNotice}</p>
        </div>
      )}

      {trigger.kind === "once" ? (
        <div className="grid gap-2">
          <Label htmlFor="schedule-at">{copy.date}</Label>
          <Input
            id="schedule-at"
            type="datetime-local"
            value={trigger.at}
            min={toDateTimeLocalValue(new Date())}
            onChange={(e) => onChange({ kind: "once", at: e.target.value })}
            className="w-60"
          />
        </div>
      ) : (
        trigger.kind !== "interval" && (
          <div className="grid gap-2">
            <Label htmlFor="schedule-time">{copy.time}</Label>
            <Input
              id="schedule-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-32"
            />
          </div>
        )
      )}
    </div>
  );
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
    </div>
  );
}
