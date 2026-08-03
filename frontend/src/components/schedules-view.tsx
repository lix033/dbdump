"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  FolderOpen,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { getBackend } from "@/lib/backend";
import { ENGINES } from "@/lib/engines";
import { useI18n } from "@/i18n/provider";
import { formatBytes, formatDateTime } from "@/i18n/format";
import { triggerSummary } from "@/i18n/schedule-text";
import type { Connection, RunStatus, Schedule, ScheduleRun } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScheduleForm } from "@/components/schedule-form";

export function SchedulesView({ connections }: { connections: Connection[] }) {
  const backend = getBackend();
  const { t, locale } = useI18n();
  const copy = t.app.schedules;

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);

  const refresh = useCallback(
    () =>
      Promise.all([backend.listSchedules(), backend.listScheduleRuns()]).then(
        ([nextSchedules, nextRuns]) => {
          setSchedules(nextSchedules);
          setRuns(nextRuns);
        },
      ),
    [backend],
  );

  useEffect(() => {
    let alive = true;
    const load = () => {
      Promise.all([backend.listSchedules(), backend.listScheduleRuns()]).then(
        ([nextSchedules, nextRuns]) => {
          if (!alive) return;
          setSchedules(nextSchedules);
          setRuns(nextRuns);
        },
      );
    };
    load();
    // L'ordonnanceur tourne en fond : sans cet abonnement, une exécution
    // déclenchée par l'horloge n'apparaîtrait qu'au prochain changement d'écran.
    const unsubscribe = backend.onSchedulesChanged(load);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [backend]);

  // Sélection dérivée : à défaut de choix explicite, la première programmation.
  const selected = schedules.find((s) => s.id === selectedId) ?? schedules[0] ?? null;

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  async function toggle(schedule: Schedule) {
    const updated = await backend.setScheduleEnabled(schedule.id, !schedule.enabled);
    setSchedules((all) => all.map((s) => (s.id === updated.id ? updated : s)));
    toast.success(updated.enabled ? copy.toast.enabled : copy.toast.disabled);
  }

  async function remove(schedule: Schedule) {
    await backend.deleteSchedule(schedule.id);
    setSchedules((all) => all.filter((s) => s.id !== schedule.id));
    setSelectedId((id) => (id === schedule.id ? null : id));
    toast.success(copy.toast.deleted);
  }

  async function runNow(schedule: Schedule) {
    try {
      toast.info(copy.toast.started);
      await backend.runScheduleNow(schedule.id);
      await refresh();
    } catch (err) {
      toast.error(copy.toast.failed, {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <>
      <aside className="bg-sidebar flex w-72 shrink-0 flex-col border-r">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="font-heading truncate text-[15px] font-bold tracking-tight">
            {copy.title}
          </span>
        </div>

        <div className="px-3 pb-2">
          <Button
            className="shadow-soft w-full"
            onClick={openNew}
            disabled={connections.length === 0}
          >
            <Plus className="size-4" />
            {copy.new}
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {schedules.length === 0 && (
            <div className="text-muted-foreground mt-6 flex flex-col items-center gap-2 px-4 text-center">
              <CalendarClock className="size-8 opacity-40" />
              <p className="text-xs leading-relaxed">
                {copy.emptyLine1}
                <br />
                {copy.emptyLine2}
              </p>
            </div>
          )}
          <ul className="grid gap-1">
            {schedules.map((schedule) => (
              <li key={schedule.id}>
                <button
                  onClick={() => setSelectedId(schedule.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                    schedule.id === selectedId
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
                      : "hover:bg-sidebar-accent/60"
                  }`}
                >
                  <StatusDot schedule={schedule} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{schedule.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {schedule.enabled && schedule.nextRunAt
                        ? formatDateTime(schedule.nextRunAt, locale)
                        : copy.paused}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {backend.isDesktop && <AutostartToggle />}
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {selected ? (
          <Detail
            schedule={selected}
            connections={connections}
            runs={runs.filter((r) => r.scheduleId === selected.id)}
            onToggle={() => toggle(selected)}
            onRunNow={() => runNow(selected)}
            onEdit={() => {
              setEditing(selected);
              setFormOpen(true);
            }}
            onDelete={() => remove(selected)}
          />
        ) : (
          <Empty
            hasSchedules={schedules.length > 0}
            canCreate={connections.length > 0}
            onNew={openNew}
          />
        )}
      </main>

      <ScheduleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        connections={connections}
        onSaved={(schedule, created) => {
          setSchedules((all) =>
            all.some((s) => s.id === schedule.id)
              ? all.map((s) => (s.id === schedule.id ? schedule : s))
              : [...all, schedule],
          );
          setSelectedId(schedule.id);
          toast.success(created ? copy.toast.created : copy.toast.updated);
        }}
      />
    </>
  );
}

/** « Lancer au démarrage » : au pied de la liste, là où on vient de programmer
 *  une sauvegarde nocturne — le moment exact où la question se pose. */
function AutostartToggle() {
  const backend = getBackend();
  const { t } = useI18n();
  const copy = t.app.schedules.autostart;
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    backend
      .isAutostartEnabled()
      .then((value) => {
        if (alive) setEnabled(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [backend]);

  async function toggle(next: boolean) {
    // Optimiste puis corrigé : l'écriture du LaunchAgent peut échouer (droits,
    // dossier absent), auquel cas l'interrupteur doit revenir en arrière.
    setEnabled(next);
    try {
      await backend.setAutostart(next);
    } catch (err) {
      setEnabled(!next);
      toast.error(copy.failed, {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div className="flex items-start gap-2.5 border-t px-3 py-3">
      <Switch id="autostart" checked={enabled} onCheckedChange={toggle} className="mt-0.5" />
      <label htmlFor="autostart" className="min-w-0 cursor-pointer">
        <span className="block text-xs font-medium">{copy.label}</span>
        <span className="text-muted-foreground block text-[11px] leading-snug">{copy.hint}</span>
      </label>
    </div>
  );
}

function StatusDot({ schedule }: { schedule: Schedule }) {
  const tone = !schedule.enabled
    ? "bg-muted-foreground/40"
    : schedule.lastStatus === "failed"
      ? "bg-destructive"
      : "bg-success";
  return <span className={`size-2 shrink-0 rounded-full ${tone}`} aria-hidden />;
}

function Detail({
  schedule,
  connections,
  runs,
  onToggle,
  onRunNow,
  onEdit,
  onDelete,
}: {
  schedule: Schedule;
  connections: Connection[];
  runs: ScheduleRun[];
  onToggle: () => void;
  onRunNow: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t, locale } = useI18n();
  const copy = t.app.schedules;
  const connection = connections.find((c) => c.id === schedule.connectionId);
  const busy = runs.some((r) => r.status === "running");

  return (
    <div className="mx-auto grid max-w-3xl gap-6 p-6">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading min-w-0 flex-1 truncate text-xl font-bold tracking-tight">
            {schedule.name}
          </h1>
          <Badge variant={schedule.enabled ? "default" : "outline"}>
            {schedule.enabled ? copy.active : copy.paused}
          </Badge>
          <Switch
            checked={schedule.enabled}
            onCheckedChange={onToggle}
            aria-label={schedule.enabled ? copy.paused : copy.active}
          />
        </div>
        <p className="text-muted-foreground text-sm">
          {triggerSummary(schedule.trigger, t, locale)}
          {connection && ` · ${connection.name} · ${ENGINES[connection.engine].label}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onRunNow} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {busy ? copy.running : copy.runNow}
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="size-4" />
            {copy.edit}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
            {copy.delete}
          </Button>
        </div>
      </header>

      <dl className="grid gap-3 sm:grid-cols-2">
        <Fact
          label={copy.nextRun}
          value={
            schedule.enabled && schedule.nextRunAt
              ? formatDateTime(schedule.nextRunAt, locale)
              : copy.noNextRun
          }
          icon={<CalendarClock className="size-4" />}
        />
        <Fact
          label={copy.lastRun}
          value={schedule.lastRunAt ? formatDateTime(schedule.lastRunAt, locale) : copy.never}
          icon={<StatusIcon status={schedule.lastStatus} />}
        />
        <Fact
          label={copy.destination}
          value={schedule.options.destinationDir}
          icon={<FolderOpen className="size-4" />}
          mono
        />
        <Fact
          label={copy.keepLast}
          value={
            schedule.keepLast === 0 ? copy.keepAll : copy.keepLastValue(schedule.keepLast)
          }
        />
      </dl>

      <section className="grid gap-2">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {copy.history}
        </h2>
        {runs.length === 0 ? (
          <p className="text-muted-foreground text-sm">{copy.historyEmpty}</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RunRow({ run }: { run: ScheduleRun }) {
  const { t, locale } = useI18n();
  const copy = t.app.schedules;
  const backend = getBackend();

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
      <StatusIcon status={run.status} />
      <span className="text-muted-foreground tabular-nums">
        {formatDateTime(run.startedAt, locale)}
      </span>
      <span className="font-medium">{copy.status[run.status]}</span>
      {run.caughtUp && (
        <Badge variant="outline" className="text-[10px] font-normal">
          {copy.caughtUp}
        </Badge>
      )}
      {run.sizeBytes !== undefined && (
        <span className="text-muted-foreground tabular-nums">
          {formatBytes(run.sizeBytes, t, locale)}
        </span>
      )}
      {run.outputPath && backend.isDesktop && (
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7"
          onClick={() => backend.revealInFolder(run.outputPath!)}
        >
          <FolderOpen className="size-3.5" />
        </Button>
      )}
      {run.error && (
        <p className="text-destructive w-full text-xs whitespace-pre-wrap">{run.error}</p>
      )}
    </li>
  );
}

function StatusIcon({ status }: { status?: RunStatus }) {
  if (status === "success") return <CheckCircle2 className="text-success size-4 shrink-0" />;
  if (status === "failed") return <XCircle className="text-destructive size-4 shrink-0" />;
  if (status === "running")
    return <Loader2 className="text-primary size-4 shrink-0 animate-spin" />;
  if (status === "cancelled") return <Pause className="text-muted-foreground size-4 shrink-0" />;
  return <CalendarClock className="text-muted-foreground size-4 shrink-0" />;
}

function Fact({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="bg-card rounded-xl border p-3">
      <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {icon}
        {label}
      </dt>
      <dd className={`mt-1 truncate text-sm ${mono ? "font-mono text-xs" : "font-medium"}`}>
        {value}
      </dd>
    </div>
  );
}

function Empty({
  hasSchedules,
  canCreate,
  onNew,
}: {
  hasSchedules: boolean;
  canCreate: boolean;
  onNew: () => void;
}) {
  const { t } = useI18n();
  const copy = t.app.schedules;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="bg-accent flex size-20 items-center justify-center rounded-3xl">
        <CalendarClock className="text-accent-foreground size-9" />
      </span>
      <div className="max-w-md space-y-1.5">
        <h2 className="font-heading text-xl font-bold tracking-tight">
          {hasSchedules ? copy.chooseTitle : copy.welcomeTitle}
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {hasSchedules ? copy.chooseText : canCreate ? copy.welcomeText : copy.needsConnection}
        </p>
      </div>
      {!hasSchedules && canCreate && (
        <Button className="shadow-soft" onClick={onNew}>
          <Plus className="size-4" />
          {copy.welcomeCta}
        </Button>
      )}
    </div>
  );
}
