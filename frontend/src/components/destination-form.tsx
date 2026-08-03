"use client";

import { useState } from "react";
import { CheckCircle2, FolderOpen, Loader2, Plug, XCircle } from "lucide-react";
import { getBackend } from "@/lib/backend";
import { toDestinationDraft } from "@/lib/destinations";
import { useI18n } from "@/i18n/provider";
import type {
  Destination,
  DestinationDraft,
  DestinationKind,
  TestResult,
} from "@/lib/types";
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

export const DESTINATION_KINDS: DestinationKind[] = ["folder", "sftp", "ftp", "s3"];

/** Brouillon vierge pour un type donné. Les ports par défaut évitent une saisie
 *  que personne n'a envie de chercher. */
function emptyDraft(kind: DestinationKind, name = ""): DestinationDraft {
  const base = { name, secret: "" };
  switch (kind) {
    case "folder":
      return { ...base, kind, path: "" };
    case "sftp":
      return { ...base, kind, host: "", port: 22, username: "", remoteDir: "", privateKeyPath: "" };
    case "ftp":
      return { ...base, kind, host: "", port: 21, username: "", remoteDir: "", tls: true };
    case "s3":
      return {
        ...base,
        kind,
        endpoint: "",
        region: "us-east-1",
        bucket: "",
        prefix: "",
        accessKeyId: "",
        pathStyle: false,
      };
  }
}

export function DestinationForm({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Destination | null;
  onSaved: (destination: Destination, created: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <Body
          key={editing?.id ?? "new"}
          editing={editing}
          onSaved={onSaved}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function Body({
  editing,
  onSaved,
  onClose,
}: {
  editing: Destination | null;
  onSaved: (destination: Destination, created: boolean) => void;
  onClose: () => void;
}) {
  const backend = getBackend();
  const { t } = useI18n();
  const copy = t.app.destinations.form;

  const [draft, setDraft] = useState<DestinationDraft>(() =>
    editing ? toDestinationDraft(editing) : emptyDraft("folder"),
  );
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Un patch typé par variante : changer de type remplace tout le brouillon,
  // sinon on garderait des champs qui n'existent plus.
  const patch = (values: Partial<DestinationDraft>) =>
    setDraft((d) => ({ ...d, ...values }) as DestinationDraft);

  function validate(): string | null {
    if (!draft.name.trim()) return copy.missingName;
    if (draft.kind === "folder" && !draft.path.trim()) return copy.missingPath;
    if ((draft.kind === "sftp" || draft.kind === "ftp") && !draft.host.trim())
      return copy.missingHost;
    if (draft.kind === "s3" && !draft.bucket.trim()) return copy.missingBucket;
    return null;
  }

  async function runTest() {
    const problem = validate();
    if (problem) return setError(problem);
    setError(null);
    setTesting(true);
    setTest(null);
    try {
      setTest(await backend.testDestination(draft, editing?.id));
    } catch (err) {
      setTest({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  }

  async function submit() {
    const problem = validate();
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      const saved = await backend.saveDestination(
        { ...draft, name: draft.name.trim() },
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

  async function browse() {
    const dir = await backend.pickDirectory();
    if (dir) patch({ path: dir } as Partial<DestinationDraft>);
  }

  async function pickKey() {
    const file = await backend.pickFile();
    if (file) patch({ privateKeyPath: file } as Partial<DestinationDraft>);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? copy.editTitle : copy.newTitle}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-2">
        <div className="grid gap-2">
          <Label htmlFor="destination-name">{copy.name}</Label>
          <Input
            id="destination-name"
            value={draft.name}
            placeholder={copy.namePlaceholder}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="destination-kind">{copy.kind}</Label>
          <Select
            value={draft.kind}
            onValueChange={(value) => {
              setDraft(emptyDraft(value as DestinationKind, draft.name));
              setTest(null);
            }}
          >
            <SelectTrigger id="destination-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DESTINATION_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t.app.destinations.kinds[kind].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {t.app.destinations.kinds[draft.kind].hint}
          </p>
        </div>

        {draft.kind === "folder" && (
          <div className="grid gap-2">
            <Label htmlFor="destination-path">{copy.path}</Label>
            <div className="flex gap-2">
              <Input
                id="destination-path"
                value={draft.path}
                onChange={(e) => patch({ path: e.target.value } as Partial<DestinationDraft>)}
              />
              <Button type="button" variant="outline" onClick={browse}>
                <FolderOpen className="size-4" />
                {copy.browse}
              </Button>
            </div>
          </div>
        )}

        {(draft.kind === "sftp" || draft.kind === "ftp") && (
          <>
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <div className="grid gap-2">
                <Label htmlFor="destination-host">{copy.host}</Label>
                <Input
                  id="destination-host"
                  value={draft.host}
                  onChange={(e) => patch({ host: e.target.value } as Partial<DestinationDraft>)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="destination-port">{copy.port}</Label>
                <Input
                  id="destination-port"
                  type="number"
                  value={draft.port}
                  onChange={(e) =>
                    patch({ port: Number(e.target.value) } as Partial<DestinationDraft>)
                  }
                />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="destination-user">{copy.username}</Label>
                <Input
                  id="destination-user"
                  value={draft.username}
                  onChange={(e) =>
                    patch({ username: e.target.value } as Partial<DestinationDraft>)
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="destination-secret">{copy.password}</Label>
                <Input
                  id="destination-secret"
                  type="password"
                  value={draft.secret}
                  placeholder={editing ? copy.passwordUnchanged : ""}
                  onChange={(e) => patch({ secret: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="destination-dir">{copy.remoteDir}</Label>
              <Input
                id="destination-dir"
                value={draft.remoteDir}
                placeholder="/backups"
                className="font-mono text-xs"
                onChange={(e) => patch({ remoteDir: e.target.value } as Partial<DestinationDraft>)}
              />
            </div>
          </>
        )}

        {draft.kind === "sftp" && (
          <div className="grid gap-2">
            <Label htmlFor="destination-key">{copy.privateKey}</Label>
            <div className="flex gap-2">
              <Input
                id="destination-key"
                value={draft.privateKeyPath}
                className="font-mono text-xs"
                onChange={(e) =>
                  patch({ privateKeyPath: e.target.value } as Partial<DestinationDraft>)
                }
              />
              <Button type="button" variant="outline" onClick={pickKey}>
                {copy.pickKey}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">{copy.privateKeyHint}</p>
            {/* Vérification de la clé d'hôte : dit à l'avance ce que le test
                reprochera, plutôt que de laisser l'échec surprendre. */}
            <p className="bg-muted text-muted-foreground rounded-lg px-3 py-2 text-xs leading-relaxed">
              {copy.knownHostsNotice}
            </p>
          </div>
        )}

        {draft.kind === "ftp" && (
          <div className="grid gap-1.5">
            <div className="flex items-center gap-2.5">
              <Switch
                id="destination-tls"
                checked={draft.tls}
                onCheckedChange={(v) => patch({ tls: v } as Partial<DestinationDraft>)}
              />
              <Label htmlFor="destination-tls" className="font-normal">
                {copy.tls}
              </Label>
            </div>
            {!draft.tls && (
              <p className="text-warning-foreground bg-warning/15 rounded-lg px-3 py-2 text-xs">
                {copy.tlsHint}
              </p>
            )}
          </div>
        )}

        {draft.kind === "s3" && (
          <>
            <div className="grid gap-2">
              <Label htmlFor="destination-endpoint">{copy.endpoint}</Label>
              <Input
                id="destination-endpoint"
                value={draft.endpoint}
                placeholder="https://minio.example.com"
                className="font-mono text-xs"
                onChange={(e) => patch({ endpoint: e.target.value } as Partial<DestinationDraft>)}
              />
              <p className="text-muted-foreground text-xs">{copy.endpointHint}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="destination-bucket">{copy.bucket}</Label>
                <Input
                  id="destination-bucket"
                  value={draft.bucket}
                  onChange={(e) => patch({ bucket: e.target.value } as Partial<DestinationDraft>)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="destination-region">{copy.region}</Label>
                <Input
                  id="destination-region"
                  value={draft.region}
                  onChange={(e) => patch({ region: e.target.value } as Partial<DestinationDraft>)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="destination-prefix">{copy.prefix}</Label>
              <Input
                id="destination-prefix"
                value={draft.prefix}
                placeholder="backups/production"
                className="font-mono text-xs"
                onChange={(e) => patch({ prefix: e.target.value } as Partial<DestinationDraft>)}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="destination-key-id">{copy.accessKeyId}</Label>
                <Input
                  id="destination-key-id"
                  value={draft.accessKeyId}
                  className="font-mono text-xs"
                  onChange={(e) =>
                    patch({ accessKeyId: e.target.value } as Partial<DestinationDraft>)
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="destination-secret-key">{copy.secretAccessKey}</Label>
                <Input
                  id="destination-secret-key"
                  type="password"
                  value={draft.secret}
                  placeholder={editing ? copy.passwordUnchanged : ""}
                  onChange={(e) => patch({ secret: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2.5">
                <Switch
                  id="destination-path-style"
                  checked={draft.pathStyle}
                  onCheckedChange={(v) => patch({ pathStyle: v } as Partial<DestinationDraft>)}
                />
                <Label htmlFor="destination-path-style" className="font-normal">
                  {copy.pathStyle}
                </Label>
              </div>
              <p className="text-muted-foreground text-xs">{copy.pathStyleHint}</p>
            </div>
          </>
        )}

        {test && (
          <p
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
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

        {error && (
          <p className="text-destructive text-sm whitespace-pre-wrap" role="alert">
            {error}
          </p>
        )}
      </div>

      <DialogFooter className="sm:justify-between">
        <Button variant="outline" onClick={runTest} disabled={testing}>
          {testing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
          {testing ? t.app.destinations.testing : t.app.destinations.test}
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {copy.save}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
