"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  FolderOpen,
  Loader2,
  Play,
  Terminal,
  FolderDown,
  FileCog,
  SlidersHorizontal,
  PackageOpen,
} from "lucide-react";
import { toast } from "sonner";
import { getBackend } from "@/lib/backend";
import { ENGINES, suggestFileName } from "@/lib/engines";
import { buildDumpCommand, formatCommand } from "@/lib/dump-command";
import { useI18n } from "@/i18n/provider";
import type {
  BinaryStatus,
  Connection,
  DumpFormat,
  DumpJob,
  DumpOptions,
  DumpProgress,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { EngineAvatar } from "@/components/engine-avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DumpProgressDialog } from "@/components/dump-progress-dialog";
import { DestinationPicker } from "@/components/destination-picker";

const emptySubscribe = () => () => {};

/** Choisit-on un dossier de destination ? Uniquement sur desktop : le web ne
 *  peut pas écrire librement sur le disque, il télécharge le fichier. Via
 *  useSyncExternalStore, avec un snapshot serveur `false` (le rendu statique est
 *  généré hors Tauri) : pas de décalage d'hydratation sur le web, et le desktop
 *  bascule sur `true` après montage. */
function useSupportsDir(isDesktop: boolean): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => isDesktop,
    () => false,
  );
}

export function DumpPanel({
  connection,
  onJobDone,
}: {
  connection: Connection;
  onJobDone: (job: DumpJob) => void;
}) {
  const backend = getBackend();
  const { t } = useI18n();
  const panel = t.app.panel;
  const spec = ENGINES[connection.engine];

  // Le composant est monté avec key={connection.id} par le parent : à chaque
  // connexion il repart de zéro, donc l'initialisation directe suffit — pas
  // besoin d'un effet pour réinitialiser le format ou le journal.
  const [format, setFormat] = useState<DumpFormat>(spec.formats[0].value);
  const [destinationDir, setDestinationDir] = useState("");
  const [schemaOnly, setSchemaOnly] = useState(false);
  const [dataOnly, setDataOnly] = useState(false);
  const [clean, setClean] = useState(false);
  const [gzip, setGzip] = useState(false);
  const [excludeRaw, setExcludeRaw] = useState("");
  const [destinationIds, setDestinationIds] = useState<string[]>([]);
  const [keepLocal, setKeepLocal] = useState(true);

  const supportsDir = useSupportsDir(backend.isDesktop);

  const [binary, setBinary] = useState<BinaryStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [lastJob, setLastJob] = useState<DumpJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [progress, setProgress] = useState<DumpProgress | null>(null);

  // Nom proposé (dérivé) sauf si l'utilisateur l'a saisi lui-même : garder une
  // valeur dérivée plutôt qu'un état miroir évite un effet de synchronisation.
  const suggestedName = useMemo(
    () => suggestFileName(connection.database || connection.name, format, connection.engine),
    [connection.database, connection.name, connection.engine, format],
  );
  const [fileNameOverride, setFileNameOverride] = useState<string | null>(null);
  const fileName = fileNameOverride ?? suggestedName;

  useEffect(() => {
    let cancelled = false;
    backend.checkBinary(connection.engine).then((b) => {
      if (!cancelled) setBinary(b);
    });
    return () => {
      cancelled = true;
    };
  }, [backend, connection.engine]);

  // En mode téléchargement (navigateur sans sélecteur de dossier), la destination
  // est implicitement le gestionnaire de téléchargements : pas besoin d'un choix
  // de dossier pour lancer.
  const effectiveDestinationDir = supportsDir ? destinationDir : t.mock.downloadDirLabel;

  const options: DumpOptions = useMemo(
    () => ({
      format,
      destinationDir: effectiveDestinationDir,
      fileName,
      schemaOnly,
      dataOnly,
      clean,
      gzip,
      excludeTables: excludeRaw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      destinationIds,
      keepLocal,
    }),
    [
      format,
      effectiveDestinationDir,
      fileName,
      schemaOnly,
      dataOnly,
      clean,
      gzip,
      excludeRaw,
      destinationIds,
      keepLocal,
    ],
  );

  const preview = useMemo(
    () =>
      formatCommand(
        buildDumpCommand(connection, options, `${effectiveDestinationDir}/${fileName}`),
      ),
    [connection, options, effectiveDestinationDir, fileName],
  );

  async function handlePickDir() {
    const dir = await backend.pickDirectory();
    if (dir) setDestinationDir(dir);
  }

  async function handleRun() {
    setDialogOpen(true);
    setRunning(true);
    setLog([]);
    setLastJob(null);
    setError(null);
    setProgress(null);
    try {
      const job = await backend.runDump(
        connection,
        options,
        (line) => setLog((l) => [...l, line]),
        setProgress,
      );
      setLastJob(job);
      onJobDone(job);
    } catch (err) {
      // La cause complète (stderr de l'outil) reste affichée dans la fenêtre.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  function handleCancel() {
    backend.cancelDump(connection.id);
  }

  async function handleDownload() {
    try {
      if (lastJob) await backend.downloadResult(lastJob.id);
    } catch (err) {
      toast.error(t.app.toast.downloadFailed, {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function handleReveal() {
    if (lastJob) backend.revealInFolder(lastJob.outputPath);
  }

  async function handleCopyToDownloads() {
    if (!lastJob) return;
    try {
      const copied = await backend.copyToDownloads(lastJob.outputPath);
      toast.success(t.app.toast.copiedToDownloads, { description: copied });
    } catch (err) {
      toast.error(t.app.toast.copyFailed, {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // pg_dump téléchargeable à la volée : absent du système mais fourni par DBDump.
  const willProvision = !!binary && !binary.found && binary.provisionable;
  // Réellement bloquant : ni installé, ni fournissable par DBDump.
  const missingBinary = !!binary && !binary.found && !binary.provisionable;
  const canRun = !!effectiveDestinationDir && !!fileName && !missingBinary && !running;
  // Libellés des formats : structure côté `engines.ts`, texte côté dictionnaire.
  const formatTexts = t.app.formats[connection.engine];
  const formatHint = formatTexts[format]?.hint;

  return (
    <div className="flex h-full flex-col">
      <header className="bg-card/60 flex items-center justify-between gap-4 border-b px-6 py-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <EngineAvatar engine={connection.engine} size="lg" />
          <div className="min-w-0">
            <h2 className="font-heading truncate text-lg font-bold tracking-tight">
              {connection.name}
            </h2>
            <p className="text-muted-foreground truncate text-sm">
              {spec.label}
              {!spec.fileBased && ` · ${connection.host}:${connection.port} · ${connection.database}`}
              {spec.fileBased && ` · ${connection.filePath}`}
            </p>
          </div>
        </div>
        {binary && (
          <Badge
            variant="outline"
            className={`shrink-0 gap-1.5 font-mono text-xs ${
              binary.found
                ? "border-success/30 bg-success/10 text-success"
                : willProvision
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                binary.found ? "bg-success" : willProvision ? "bg-warning" : "bg-destructive"
              }`}
            />
            {binary.found
              ? `${binary.name} ${binary.version ?? ""}`.trim()
              : willProvision
                ? panel.binaryToDownload(binary.name)
                : panel.binaryMissing(binary.name)}
          </Badge>
        )}
      </header>

      {willProvision && (
        <div className="border-warning/30 bg-warning/10 border-b px-6 py-3">
          <div className="flex gap-2.5 text-sm">
            <PackageOpen className="text-warning mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">{panel.provisionTitle(binary!.name)}</p>
              <p className="text-muted-foreground">
                {panel.provisionTextBefore}
                <code className="bg-background/60 rounded px-1.5 py-0.5 font-mono text-xs">
                  {binary!.installHint}
                </code>
                {panel.provisionTextAfter}
              </p>
            </div>
          </div>
        </div>
      )}

      {missingBinary && (
        <div className="border-warning/30 bg-warning/10 border-b px-6 py-3">
          <div className="flex gap-2.5 text-sm">
            <AlertTriangle className="text-warning mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">{panel.missingTitle(binary!.name)}</p>
              <p className="text-muted-foreground">
                {panel.missingTextBefore}
                <code className="bg-background/60 rounded px-1.5 py-0.5 font-mono text-xs">
                  {binary!.installHint}
                </code>
                {panel.missingTextAfter}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto grid max-w-3xl gap-5">
          <SectionCard
            icon={FolderDown}
            title={panel.destination.title}
            hint={supportsDir ? panel.destination.hintDesktop : panel.destination.hintWeb}
          >
            {supportsDir ? (
              <div className="flex gap-2">
                <Input
                  readOnly
                  placeholder={panel.destination.pick}
                  value={destinationDir}
                  className="bg-muted/40 font-mono text-xs"
                />
                <Button variant="outline" onClick={handlePickDir}>
                  <FolderOpen className="size-4" />
                  {panel.destination.browse}
                </Button>
              </div>
            ) : (
              <div className="border-border bg-muted/40 text-muted-foreground flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs leading-relaxed">
                <FolderDown className="mt-0.5 size-4 shrink-0" />
                <span>
                  {panel.destination.webNoteBefore}
                  <span className="text-foreground font-medium">
                    {panel.destination.webNoteStrong}
                  </span>
                  {panel.destination.webNoteAfter}
                </span>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="filename" className="text-muted-foreground text-xs">
                {panel.destination.fileName}
              </Label>
              <Input
                id="filename"
                value={fileName}
                onChange={(e) => setFileNameOverride(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            {/* Copies supplémentaires : NAS, SFTP, S3… Le dossier ci-dessus
                reste le point de départ, l'outil de dump y écrit toujours. */}
            {supportsDir && (
              <div className="grid gap-1.5 border-t pt-3">
                <Label className="text-muted-foreground text-xs">{t.app.picker.title}</Label>
                <DestinationPicker
                  selected={destinationIds}
                  onSelect={setDestinationIds}
                  keepLocal={keepLocal}
                  onKeepLocal={setKeepLocal}
                />
              </div>
            )}
          </SectionCard>

          <SectionCard icon={FileCog} title={panel.format.title} hint={panel.format.hint}>
            <Select value={format} onValueChange={(v) => setFormat(v as DumpFormat)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {spec.formats.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {formatTexts[f.value]?.label ?? f.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formatHint && (
              <p className="text-muted-foreground text-xs leading-relaxed">{formatHint}</p>
            )}
          </SectionCard>

          <SectionCard
            icon={SlidersHorizontal}
            title={panel.options.title}
            hint={panel.options.hint}
          >
            <div className="grid gap-1">
              <Toggle
                id="schema-only"
                label={panel.options.schemaOnly.label}
                hint={panel.options.schemaOnly.hint}
                checked={schemaOnly}
                onChange={(v) => {
                  setSchemaOnly(v);
                  if (v) setDataOnly(false);
                }}
              />
              <Toggle
                id="data-only"
                label={panel.options.dataOnly.label}
                hint={panel.options.dataOnly.hint}
                checked={dataOnly}
                onChange={(v) => {
                  setDataOnly(v);
                  if (v) setSchemaOnly(false);
                }}
              />
              <Toggle
                id="clean"
                label={panel.options.clean.label}
                hint={panel.options.clean.hint}
                checked={clean}
                onChange={setClean}
              />
              <Toggle
                id="gzip"
                label={panel.options.gzip.label}
                hint={panel.options.gzip.hint}
                checked={gzip}
                onChange={setGzip}
              />
            </div>

            <div className="grid gap-1.5 pt-1">
              <Label htmlFor="exclude" className="text-muted-foreground text-xs">
                {panel.options.excludeTables}
              </Label>
              <textarea
                id="exclude"
                rows={2}
                placeholder={"logs\nsessions"}
                value={excludeRaw}
                onChange={(e) => setExcludeRaw(e.target.value)}
                className="border-input bg-transparent placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 min-h-16 w-full rounded-lg border px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-[3px]"
              />
              <p className="text-muted-foreground text-xs">{panel.options.excludeHint}</p>
            </div>
          </SectionCard>

          <SectionCard icon={Terminal} title={panel.command.title} hint={panel.command.hint}>
            <pre className="bg-foreground/[0.04] dark:bg-background/50 text-muted-foreground overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-relaxed">
              {preview}
            </pre>
          </SectionCard>

        </div>
      </div>

      <footer className="bg-card/60 flex items-center justify-between gap-4 border-t px-6 py-4 backdrop-blur">
        <p className="text-muted-foreground min-w-0 truncate font-mono text-xs">
          {supportsDir
            ? destinationDir
              ? `${destinationDir}/${fileName}`
              : panel.destination.pickFolderFirst
            : `↓ ${fileName}`}
        </p>
        <Button size="lg" className="shadow-soft shrink-0" onClick={handleRun} disabled={!canRun}>
          {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {running ? panel.running : panel.run}
        </Button>
      </footer>

      <DumpProgressDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        connection={connection}
        isDesktop={backend.isDesktop}
        running={running}
        progress={progress}
        log={log}
        error={error}
        job={lastJob}
        onCancel={handleCancel}
        onRetry={handleRun}
        onDownload={handleDownload}
        onReveal={handleReveal}
        onCopyToDownloads={handleCopyToDownloads}
      />
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card shadow-soft rounded-2xl border p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="bg-accent text-accent-foreground flex size-8 items-center justify-center rounded-lg">
          <Icon className="size-4" />
        </span>
        <div className="leading-tight">
          <h3 className="font-heading text-sm font-semibold tracking-tight">{title}</h3>
          <p className="text-muted-foreground text-xs">{hint}</p>
        </div>
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="hover:bg-muted/50 flex items-start justify-between gap-4 rounded-lg px-2 py-2 transition-colors">
      <div className="grid gap-0.5">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
