"use client";

import { useEffect, useState } from "react";
import { Activity, Cpu, HardDrive, MemoryStick } from "lucide-react";
import { getBackend } from "@/lib/backend";
import { useI18n } from "@/i18n/provider";
import { formatBytes, formatNumber } from "@/i18n/format";
import type { Destination, FreeSpace, SystemStats } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

/** Cadence de rafraîchissement. Assez lent pour ne rien coûter, assez vif pour
 *  qu'un dump qui démarre se voie. */
const REFRESH_MS = 2000;

export function MonitoringView() {
  const backend = getBackend();
  const { t, locale } = useI18n();
  const copy = t.app.monitoring;

  const [stats, setStats] = useState<SystemStats | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [spaces, setSpaces] = useState<Record<string, FreeSpace | null>>({});

  useEffect(() => {
    let alive = true;
    const poll = () => {
      backend
        .systemStats()
        .then((value) => {
          if (alive) setStats(value);
        })
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [backend]);

  useEffect(() => {
    let alive = true;
    backend.listDestinations().then(async (list) => {
      if (!alive) return;
      setDestinations(list);
      // L'espace des destinations distantes demande une connexion : on le
      // récupère une fois à l'ouverture, pas à chaque battement.
      const entries = await Promise.all(
        list.map(async (destination) => {
          const space = await backend.destinationSpace(destination.id).catch(() => null);
          return [destination.id, space] as const;
        }),
      );
      if (alive) setSpaces(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
  }, [backend]);

  return (
    <main className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-4xl gap-6 p-6">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading flex-1 text-xl font-bold tracking-tight">{copy.title}</h1>
          <Badge variant="outline" className="font-normal">
            {stats && stats.activeDumps > 0 ? copy.dumpRunning(stats.activeDumps) : copy.dumpIdle}
          </Badge>
        </header>

        {!backend.isDesktop && (
          <p className="bg-muted text-muted-foreground rounded-xl px-3 py-2.5 text-xs leading-relaxed">
            {copy.webNotice}
          </p>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          <Gauge
            icon={<Cpu className="size-4" />}
            label={copy.cpu}
            percent={stats?.cpuPercent ?? 0}
            value={stats ? `${formatNumber(stats.cpuPercent, locale, 0)} %` : copy.unknown}
          />
          <Gauge
            icon={<MemoryStick className="size-4" />}
            label={copy.memory}
            percent={
              stats && stats.memoryTotalBytes > 0
                ? (stats.memoryUsedBytes / stats.memoryTotalBytes) * 100
                : 0
            }
            value={
              stats
                ? `${formatBytes(stats.memoryUsedBytes, t, locale)} / ${formatBytes(
                    stats.memoryTotalBytes,
                    t,
                    locale,
                  )}`
                : copy.unknown
            }
          />
          <Gauge
            icon={<Activity className="size-4" />}
            label={copy.dumpUsage}
            percent={stats?.dumpCpuPercent ?? 0}
            value={
              stats && stats.activeDumps > 0
                ? `${formatNumber(stats.dumpCpuPercent, locale, 0)} % · ${formatBytes(
                    stats.dumpMemoryBytes,
                    t,
                    locale,
                  )}`
                : copy.dumpIdle
            }
          />
        </section>

        <section className="grid gap-2">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {copy.volumes}
          </h2>
          <ul className="grid gap-2">
            {(stats?.volumes ?? []).map((volume) => (
              <SpaceRow
                key={volume.mountPoint}
                title={volume.name || volume.mountPoint}
                subtitle={volume.mountPoint}
                freeBytes={volume.freeBytes}
                totalBytes={volume.totalBytes}
              />
            ))}
          </ul>
        </section>

        <section className="grid gap-2">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {copy.destinations}
          </h2>
          {destinations.length === 0 ? (
            <p className="text-muted-foreground text-sm">{copy.destinationsNone}</p>
          ) : (
            <ul className="grid gap-2">
              {destinations.map((destination) => {
                const space = spaces[destination.id];
                return space ? (
                  <SpaceRow
                    key={destination.id}
                    title={destination.name}
                    subtitle={t.app.destinations.kinds[destination.kind].label}
                    freeBytes={space.freeBytes}
                    totalBytes={space.totalBytes}
                  />
                ) : (
                  <li
                    key={destination.id}
                    className="bg-card flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm"
                  >
                    <HardDrive className="text-muted-foreground size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate font-medium">{destination.name}</span>
                    <span className="text-muted-foreground text-xs">{copy.spaceUnknown}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="text-muted-foreground text-xs">{copy.refreshed}</p>
      </div>
    </main>
  );
}

function Gauge({
  icon,
  label,
  percent,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  percent: number;
  value: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="bg-card grid gap-2 rounded-xl border p-3">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium tabular-nums">{value}</div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/** Ligne « espace libre » : la barre montre l'occupation, et vire à l'alerte
 *  quand il reste peu de place — c'est là que la sauvegarde échouera. */
function SpaceRow({
  title,
  subtitle,
  freeBytes,
  totalBytes,
}: {
  title: string;
  subtitle: string;
  freeBytes: number;
  totalBytes: number;
}) {
  const { t, locale } = useI18n();
  const copy = t.app.monitoring;
  const usedPercent = totalBytes > 0 ? ((totalBytes - freeBytes) / totalBytes) * 100 : 0;
  const tight = usedPercent > 90;

  return (
    <li className="bg-card grid gap-2 rounded-xl border px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        <span className="text-muted-foreground truncate font-mono text-xs">{subtitle}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
          <div
            className={`h-full rounded-full ${tight ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${Math.min(100, usedPercent)}%` }}
          />
        </div>
        <span
          className={`shrink-0 text-xs tabular-nums ${tight ? "text-destructive font-medium" : "text-muted-foreground"}`}
        >
          {copy.free(formatBytes(freeBytes, t, locale))} ·{" "}
          {copy.used(Math.round(usedPercent))}
        </span>
      </div>
    </li>
  );
}
