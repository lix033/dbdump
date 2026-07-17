"use client";

import { useEffect, useState } from "react";
import { DatabaseZap, Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { getBackend } from "@/lib/backend";
import { useIsBrowser } from "@/lib/use-is-browser";
import { ENGINES } from "@/lib/engines";
import type { Connection, DumpJob } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConnectionForm } from "@/components/connection-form";
import { DumpPanel } from "@/components/dump-panel";
import { EngineAvatar } from "@/components/engine-avatar";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Page() {
  const backend = getBackend();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const browserMode = useIsBrowser();

  useEffect(() => {
    backend.loadConnections().then((list) => {
      setConnections(list);
      setSelectedId((id) => id ?? list[0]?.id ?? null);
      setLoaded(true);
    });
  }, [backend]);

  const selected = connections.find((c) => c.id === selectedId) ?? null;

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function handleSaved(conn: Connection) {
    setConnections((list) => {
      const exists = list.some((c) => c.id === conn.id);
      return exists ? list.map((c) => (c.id === conn.id ? conn : c)) : [...list, conn];
    });
    setSelectedId(conn.id);
    toast.success(editing ? "Connexion modifiée" : "Connexion ajoutée");
  }

  async function handleDelete(conn: Connection) {
    await backend.deleteConnection(conn.id);
    setConnections((list) => list.filter((c) => c.id !== conn.id));
    setSelectedId((id) => (id === conn.id ? null : id));
    toast.success("Connexion supprimée");
  }

  function handleJobDone(job: DumpJob) {
    console.info("dump terminé", job.id);
  }

  return (
    <div className="bg-background flex h-dvh">
      <aside className="bg-sidebar flex w-72 shrink-0 flex-col border-r">
        <div className="flex items-center gap-2.5 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="DBDump" className="size-9" width={36} height={36} />
          <div className="flex flex-col leading-tight">
            <span className="font-heading text-[15px] font-bold tracking-tight">DBDump</span>
            <span className="text-muted-foreground text-[11px]">Sauvegardes de bases</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {browserMode && (
              <Badge variant="outline" className="text-[10px] font-normal">
                démo
              </Badge>
            )}
            <ThemeToggle />
          </div>
        </div>

        <div className="px-3 pb-2">
          <Button className="shadow-soft w-full" onClick={openNew}>
            <Plus className="size-4" />
            Nouvelle connexion
          </Button>
        </div>

        <div className="text-muted-foreground px-5 pt-3 pb-1 text-[11px] font-medium tracking-wide uppercase">
          Connexions
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {loaded && connections.length === 0 && (
            <div className="text-muted-foreground mt-6 flex flex-col items-center gap-2 px-4 text-center">
              <DatabaseZap className="size-8 opacity-40" />
              <p className="text-xs leading-relaxed">
                Aucune connexion pour l&apos;instant.
                <br />
                Ajoutez-en une pour démarrer.
              </p>
            </div>
          )}
          <ul className="grid gap-1">
            {connections.map((conn) => {
              const active = conn.id === selectedId;
              return (
                <li key={conn.id}>
                  <div
                    className={`group flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors ${
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
                        : "hover:bg-sidebar-accent/60"
                    }`}
                  >
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      onClick={() => setSelectedId(conn.id)}
                    >
                      <EngineAvatar engine={conn.engine} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{conn.name}</span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {ENGINES[conn.engine].label}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 rounded-lg"
                        aria-label="Modifier"
                        onClick={() => {
                          setEditing(conn);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hover:text-destructive size-7 rounded-lg"
                        aria-label="Supprimer"
                        onClick={() => handleDelete(conn)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <main className="min-w-0 flex-1">
        {selected ? (
          // key : chaque connexion repart d'un panneau neuf (format, journal…).
          <DumpPanel key={selected.id} connection={selected} onJobDone={handleJobDone} />
        ) : (
          <EmptyState hasConnections={connections.length > 0} onNew={openNew} />
        )}
      </main>

      <ConnectionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={handleSaved}
      />
    </div>
  );
}

function EmptyState({ hasConnections, onNew }: { hasConnections: boolean; onNew: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="bg-accent text-accent-foreground flex size-20 items-center justify-center rounded-3xl">
        <DatabaseZap className="size-9" />
      </span>
      <div className="max-w-sm space-y-1.5">
        <h2 className="font-heading text-xl font-bold tracking-tight">
          {hasConnections ? "Choisissez une connexion" : "Bienvenue sur DBDump"}
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {hasConnections ? (
            <>
              Sélectionnez une base dans la liste pour configurer et lancer sa sauvegarde.
              <ArrowLeft className="mb-0.5 ml-1 inline size-4" />
            </>
          ) : (
            "Connectez une base PostgreSQL, MySQL, SQLite ou MongoDB, puis exportez-la en un clic vers le dossier de votre choix."
          )}
        </p>
      </div>
      {!hasConnections && (
        <Button className="shadow-soft" onClick={onNew}>
          <Plus className="size-4" />
          Ajouter une connexion
        </Button>
      )}
    </div>
  );
}
