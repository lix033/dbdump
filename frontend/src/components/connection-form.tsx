"use client";

import { useState } from "react";
import { Loader2, FolderOpen, CheckCircle2, XCircle, Plug } from "lucide-react";
import { getBackend } from "@/lib/backend";
import { ENGINE_LIST, ENGINES } from "@/lib/engines";
import { ENGINE_UI } from "@/lib/engine-ui";
import { EngineAvatar } from "@/components/engine-avatar";
import type { Connection, ConnectionDraft, EngineId, SslMode, TestResult } from "@/lib/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY: ConnectionDraft = {
  name: "",
  engine: "postgres",
  host: "localhost",
  port: 5432,
  username: "",
  database: "",
  password: "",
  sslMode: "prefer",
};

function toDraft(conn: Connection): ConnectionDraft {
  // Le mot de passe n'est pas relu depuis le store : à l'édition, le champ reste
  // vide et un champ vide signifie « garder celui du trousseau ».
  return { ...conn, password: "" };
}

export function ConnectionForm({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Connection | null;
  onSaved: (conn: Connection) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Remonté à chaque ouverture (Radix démonte le contenu à la fermeture) :
            l'état du formulaire s'initialise depuis `editing` sans effet de reset.
            La key protège le cas où l'on change de connexion sans refermer. */}
        {open && (
          <ConnectionFormBody
            key={editing?.id ?? "new"}
            editing={editing}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConnectionFormBody({
  editing,
  onOpenChange,
  onSaved,
}: {
  editing: Connection | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (conn: Connection) => void;
}) {
  const backend = getBackend();
  const [draft, setDraft] = useState<ConnectionDraft>(() => (editing ? toDraft(editing) : EMPTY));
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState(false);

  const spec = ENGINES[draft.engine];
  const set = <K extends keyof ConnectionDraft>(key: K, value: ConnectionDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function changeEngine(engine: EngineId) {
    setDraft((d) => ({ ...d, engine, port: ENGINES[engine].defaultPort }));
    setResult(null);
  }

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      setResult(await backend.testConnection(draft));
    } finally {
      setTesting(false);
    }
  }

  async function handlePickFile() {
    const path = await backend.pickFile();
    if (path) {
      set("filePath", path);
      if (!draft.name) set("name", path.split("/").pop() ?? "");
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      onSaved(await backend.saveConnection(draft, editing?.id));
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const canSave = draft.name.trim() !== "" && (spec.fileBased ? !!draft.filePath : !!draft.host);

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <EngineAvatar engine={draft.engine} size="md" />
          <div>
            <DialogTitle className="text-base">
              {editing ? "Modifier la connexion" : "Nouvelle connexion"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Mot de passe rangé dans le trousseau système, jamais sur le disque.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nom</Label>
            <Input
              id="name"
              placeholder="Prod OrnCity"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="engine">Moteur</Label>
            <Select value={draft.engine} onValueChange={(v) => changeEngine(v as EngineId)}>
              <SelectTrigger id="engine">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENGINE_LIST.map((e) => {
                  const Icon = ENGINE_UI[e.id].icon;
                  return (
                    <SelectItem key={e.id} value={e.id}>
                      <Icon className="size-4" style={{ color: ENGINE_UI[e.id].color }} />
                      {e.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {spec.fileBased ? (
            <div className="grid gap-2">
              <Label htmlFor="file">Fichier de base</Label>
              <div className="flex gap-2">
                <Input
                  id="file"
                  readOnly
                  placeholder="Aucun fichier sélectionné"
                  value={draft.filePath ?? ""}
                  className="font-mono text-xs"
                />
                <Button type="button" variant="outline" size="icon" onClick={handlePickFile}>
                  <FolderOpen className="size-4" />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <div className="grid gap-2">
                  <Label htmlFor="host">Hôte</Label>
                  <Input
                    id="host"
                    value={draft.host}
                    onChange={(e) => set("host", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    value={draft.port}
                    onChange={(e) => set("port", Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-2">
                  <Label htmlFor="username">Utilisateur</Label>
                  <Input
                    id="username"
                    value={draft.username}
                    onChange={(e) => set("username", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder={editing ? "Inchangé" : ""}
                    value={draft.password}
                    onChange={(e) => set("password", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-2">
                  <Label htmlFor="database">Base</Label>
                  <Input
                    id="database"
                    value={draft.database}
                    onChange={(e) => set("database", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ssl">SSL</Label>
                  <Select value={draft.sslMode} onValueChange={(v) => set("sslMode", v as SslMode)}>
                    <SelectTrigger id="ssl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disable">Désactivé</SelectItem>
                      <SelectItem value="prefer">Préféré</SelectItem>
                      <SelectItem value="require">Requis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {result && (
            <div
              className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${
                result.ok
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {result.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0" />
              )}
              <div>
                <p>{result.message}</p>
                {result.ok && result.serverVersion && (
                  <p className="text-xs opacity-80">
                    Version {result.serverVersion} · {result.latencyMs} ms
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
            Tester
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </DialogFooter>
    </>
  );
}
