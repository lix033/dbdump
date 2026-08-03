"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  HardDrive,
  Loader2,
  Network,
  Pencil,
  Plug,
  Plus,
  Server,
  Trash2,
  XCircle,
} from "lucide-react";
import type { ComponentType } from "react";
import { toast } from "sonner";
import { getBackend } from "@/lib/backend";
import { toDestinationDraft } from "@/lib/destinations";
import { useI18n } from "@/i18n/provider";
import { formatBytes } from "@/i18n/format";
import type { Destination, DestinationKind, FreeSpace, Schedule, TestResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DestinationForm } from "@/components/destination-form";

/** Une icône par type : le repérage se fait à l'œil dans la liste. */
const ICONS: Record<DestinationKind, ComponentType<{ className?: string }>> = {
  folder: HardDrive,
  sftp: Server,
  ftp: Network,
  s3: Cloud,
};

export function DestinationsView() {
  const backend = getBackend();
  const { t } = useI18n();
  const copy = t.app.destinations;

  const [destinations, setDestinations] = useState<Destination[]>([]);
  // Les programmations servent seulement à dire « utilisée par N programmations » :
  // elles sont chargées ici plutôt que passées par la coque, qui n'en a pas besoin.
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Destination | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([backend.listDestinations(), backend.listSchedules()]).then(
      ([list, scheduleList]) => {
        if (!alive) return;
        setDestinations(list);
        setSchedules(scheduleList);
      },
    );
    return () => {
      alive = false;
    };
  }, [backend]);

  const selected = destinations.find((d) => d.id === selectedId) ?? destinations[0] ?? null;

  async function remove(destination: Destination) {
    await backend.deleteDestination(destination.id);
    setDestinations((all) => all.filter((d) => d.id !== destination.id));
    setSelectedId((id) => (id === destination.id ? null : id));
    toast.success(copy.toast.deleted);
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
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" />
            {copy.new}
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {destinations.length === 0 && (
            <div className="text-muted-foreground mt-6 flex flex-col items-center gap-2 px-4 text-center">
              <HardDrive className="size-8 opacity-40" />
              <p className="text-xs leading-relaxed">
                {copy.emptyLine1}
                <br />
                {copy.emptyLine2}
              </p>
            </div>
          )}
          <ul className="grid gap-1">
            {destinations.map((destination) => {
              const Icon = ICONS[destination.kind];
              return (
                <li key={destination.id}>
                  <button
                    onClick={() => setSelectedId(destination.id)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                      destination.id === selected?.id
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
                        : "hover:bg-sidebar-accent/60"
                    }`}
                  >
                    <Icon className="size-4 shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {destination.name}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {copy.kinds[destination.kind].label}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {selected ? (
          <Detail
            key={selected.id}
            destination={selected}
            schedules={schedules}
            onEdit={() => {
              setEditing(selected);
              setFormOpen(true);
            }}
            onDelete={() => remove(selected)}
          />
        ) : (
          <Empty
            hasDestinations={destinations.length > 0}
            onNew={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          />
        )}
      </main>

      <DestinationForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={(destination, created) => {
          setDestinations((all) =>
            all.some((d) => d.id === destination.id)
              ? all.map((d) => (d.id === destination.id ? destination : d))
              : [...all, destination],
          );
          setSelectedId(destination.id);
          toast.success(created ? copy.toast.created : copy.toast.updated);
        }}
      />
    </>
  );
}

function Detail({
  destination,
  schedules,
  onEdit,
  onDelete,
}: {
  destination: Destination;
  schedules: Schedule[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const backend = getBackend();
  const { t, locale } = useI18n();
  const copy = t.app.destinations;

  const [space, setSpace] = useState<FreeSpace | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let alive = true;
    backend
      .destinationSpace(destination.id)
      .then((value) => {
        if (alive) setSpace(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [backend, destination.id]);

  const users = schedules.filter((s) => s.options.destinationIds.includes(destination.id));

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      setTest(await backend.testDestination(toDestinationDraft(destination), destination.id));
    } catch (err) {
      setTest({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-6 p-6">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading min-w-0 flex-1 truncate text-xl font-bold tracking-tight">
            {destination.name}
          </h1>
          <Badge variant="outline">{copy.kinds[destination.kind].label}</Badge>
        </div>
        <p className="text-muted-foreground font-mono text-xs break-all">
          {describe(destination)}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={runTest} disabled={testing}>
            {testing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
            {testing ? copy.testing : copy.test}
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="size-4" />
            {copy.edit}
          </Button>
          <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={onDelete}>
            <Trash2 className="size-4" />
            {copy.delete}
          </Button>
        </div>
      </header>

      {test && (
        <p
          className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${
            test.ok ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive"
          }`}
        >
          {test.ok ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0" />
          )}
          <span className="whitespace-pre-wrap">{test.message}</span>
        </p>
      )}

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="bg-card rounded-xl border p-3">
          <dt className="text-muted-foreground text-xs">{copy.freeSpace}</dt>
          <dd className="mt-1 text-sm font-medium">
            {space
              ? copy.spaceOf(
                  formatBytes(space.freeBytes, t, locale),
                  formatBytes(space.totalBytes, t, locale),
                )
              : copy.spaceUnknown}
          </dd>
        </div>
        <div className="bg-card rounded-xl border p-3">
          <dt className="text-muted-foreground text-xs">{copy.usedBy}</dt>
          <dd className="mt-1 text-sm font-medium">
            {users.length === 0 ? copy.usedByNone : copy.usedBySchedules(users.length)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Résumé technique d'une destination, sans secret. */
function describe(destination: Destination): string {
  switch (destination.kind) {
    case "folder":
      return destination.path;
    case "sftp":
      return `sftp://${destination.username}@${destination.host}:${destination.port}${destination.remoteDir}`;
    case "ftp":
      return `${destination.tls ? "ftps" : "ftp"}://${destination.username}@${destination.host}:${destination.port}${destination.remoteDir}`;
    case "s3": {
      const host = destination.endpoint || "s3.amazonaws.com";
      const prefix = destination.prefix ? `/${destination.prefix}` : "";
      return `${host} · ${destination.bucket}${prefix} · ${destination.region}`;
    }
  }
}

function Empty({
  hasDestinations,
  onNew,
}: {
  hasDestinations: boolean;
  onNew: () => void;
}) {
  const { t } = useI18n();
  const copy = t.app.destinations;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="bg-accent flex size-20 items-center justify-center rounded-3xl">
        <HardDrive className="text-accent-foreground size-9" />
      </span>
      <div className="max-w-md space-y-1.5">
        <h2 className="font-heading text-xl font-bold tracking-tight">
          {hasDestinations ? copy.chooseTitle : copy.welcomeTitle}
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {hasDestinations ? copy.chooseText : copy.welcomeText}
        </p>
      </div>
      {!hasDestinations && (
        <Button className="shadow-soft" onClick={onNew}>
          <Plus className="size-4" />
          {copy.welcomeCta}
        </Button>
      )}
    </div>
  );
}
