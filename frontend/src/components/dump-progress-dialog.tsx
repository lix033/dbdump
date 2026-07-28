"use client";

import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  CircleCheck,
  Download,
  FolderOpen,
  Loader2,
  RotateCw,
  X,
} from "lucide-react";
import type { Connection, DumpJob } from "@/lib/types";
import { useI18n } from "@/i18n/provider";
import { formatBytes } from "@/i18n/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EngineAvatar } from "@/components/engine-avatar";

type State = "running" | "success" | "error";

/** Fenêtre affichée pendant et après un dump : barre de progression, journal en
 *  direct, puis le résultat (fichier produit / erreur détaillée) avec les actions
 *  adaptées à la plateforme. */
export function DumpProgressDialog({
  open,
  onOpenChange,
  connection,
  isDesktop,
  running,
  log,
  error,
  job,
  onCancel,
  onRetry,
  onDownload,
  onReveal,
  onCopyToDownloads,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: Connection;
  isDesktop: boolean;
  running: boolean;
  log: string[];
  error: string | null;
  job: DumpJob | null;
  onCancel: () => void;
  onRetry: () => void;
  onDownload: () => void;
  onReveal: () => void;
  onCopyToDownloads: () => void;
}) {
  const { locale, t } = useI18n();
  const copy = t.app.progress;
  const logRef = useRef<HTMLDivElement>(null);
  const state: State = running ? "running" : error ? "error" : "success";

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const title =
    state === "running"
      ? copy.titleRunning
      : state === "success"
        ? copy.titleSuccess
        : copy.titleError;

  return (
    <Dialog
      open={open}
      // Tant que le dump tourne, on empêche la fermeture accidentelle (Échap,
      // clic extérieur, croix) : il faut passer par « Annuler ».
      onOpenChange={(next) => {
        if (!next && running) return;
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={!running} className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <EngineAvatar engine={connection.engine} size="lg" />
            <div className="min-w-0">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="truncate">{connection.name}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Barre de progression : indéterminée pendant, pleine (verte/rouge) après. */}
        <div className="bg-muted relative h-1.5 w-full overflow-hidden rounded-full">
          {state === "running" ? (
            <span className="bg-primary animate-indeterminate rounded-full" />
          ) : (
            <span
              className={`absolute inset-y-0 left-0 w-full rounded-full ${
                state === "success" ? "bg-success" : "bg-destructive"
              }`}
            />
          )}
        </div>

        {state === "success" && job && (
          <div className="border-success/30 bg-success/10 flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
            <CircleCheck className="text-success mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 text-sm">
              <p className="font-medium">
                {copy.written(formatBytes(job.sizeBytes ?? 0, t, locale))}
              </p>
              <p className="text-muted-foreground truncate font-mono text-xs">{job.outputPath}</p>
            </div>
          </div>
        )}

        {state === "error" && error && (
          <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-3">
            <div className="text-destructive mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <AlertTriangle className="size-4" />
              {copy.errorHeading}
            </div>
            <pre className="text-destructive max-h-40 overflow-auto font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {error}
            </pre>
          </div>
        )}

        {log.length > 0 && (
          <div
            ref={logRef}
            className="bg-foreground/[0.04] dark:bg-background/50 max-h-44 overflow-y-auto rounded-lg border p-3 font-mono text-xs leading-relaxed"
          >
            {log.map((line, i) => (
              <div key={i} className="text-muted-foreground break-words whitespace-pre-wrap">
                {line}
              </div>
            ))}
          </div>
        )}

        <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:flex-wrap sm:justify-end">
          {state === "running" && (
            <Button variant="outline" onClick={onCancel}>
              <Loader2 className="size-4 animate-spin" />
              {copy.cancel}
            </Button>
          )}

          {state === "error" && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {copy.close}
              </Button>
              <Button onClick={onRetry}>
                <RotateCw className="size-4" />
                {copy.retry}
              </Button>
            </>
          )}

          {state === "success" && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                <X className="size-4" />
                {copy.close}
              </Button>
              {isDesktop ? (
                <>
                  <Button variant="outline" onClick={onCopyToDownloads}>
                    <Download className="size-4" />
                    {copy.copyToDownloads}
                  </Button>
                  <Button onClick={onReveal}>
                    <FolderOpen className="size-4" />
                    {copy.openFolder}
                  </Button>
                </>
              ) : (
                <Button autoFocus onClick={onDownload}>
                  <Download className="size-4" />
                  {copy.download}
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
