"use client";

import { useEffect, useState } from "react";
import { Cloud, HardDrive, Network, Server } from "lucide-react";
import type { ComponentType } from "react";
import { getBackend } from "@/lib/backend";
import { useI18n } from "@/i18n/provider";
import type { Destination, DestinationKind } from "@/lib/types";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const ICONS: Record<DestinationKind, ComponentType<{ className?: string }>> = {
  folder: HardDrive,
  sftp: Server,
  ftp: Network,
  s3: Cloud,
};

/** Choix des destinations d'un dump, partagé par le panneau de dump et le
 *  formulaire de programmation : les deux envoient exactement les mêmes options.
 *
 *  Le dossier de travail reste obligatoire — pg_dump écrit sur un disque, pas
 *  dans un bucket. Ces destinations-ci sont des copies **en plus**, et
 *  « garder la copie locale » permet de n'en faire qu'un point de passage. */
export function DestinationPicker({
  selected,
  onSelect,
  keepLocal,
  onKeepLocal,
}: {
  selected: string[];
  onSelect: (ids: string[]) => void;
  keepLocal: boolean;
  onKeepLocal: (keep: boolean) => void;
}) {
  const backend = getBackend();
  const { t } = useI18n();
  const copy = t.app.picker;

  const [destinations, setDestinations] = useState<Destination[]>([]);

  useEffect(() => {
    let alive = true;
    backend.listDestinations().then((list) => {
      if (alive) setDestinations(list);
    });
    return () => {
      alive = false;
    };
  }, [backend]);

  if (destinations.length === 0) {
    return <p className="text-muted-foreground text-xs leading-relaxed">{copy.none}</p>;
  }

  const toggle = (id: string) =>
    onSelect(selected.includes(id) ? selected.filter((d) => d !== id) : [...selected, id]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5">
        {destinations.map((destination) => {
          const Icon = ICONS[destination.kind];
          const on = selected.includes(destination.id);
          return (
            <button
              key={destination.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(destination.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                on
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <Icon className="size-3.5" />
              {destination.name}
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <div className="grid gap-1.5">
          <div className="flex items-center gap-2.5">
            <Switch id="keep-local" checked={keepLocal} onCheckedChange={onKeepLocal} />
            <Label htmlFor="keep-local" className="text-sm font-normal">
              {copy.keepLocal}
            </Label>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {keepLocal ? copy.keepLocalHint : copy.removeLocalHint}
          </p>
        </div>
      )}
    </div>
  );
}
