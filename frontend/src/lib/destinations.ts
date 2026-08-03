import type { Destination, DestinationConfig, DestinationDraft } from "./types";

/** Le brouillon débarrassé de ce qui ne se stocke pas ici (le nom et le secret,
 *  qui ont leur propre sort). Même raison qu'en dessous : pas de `...reste`, le
 *  compilateur vérifie chaque variante. */
export function destinationConfig(draft: DestinationDraft): DestinationConfig {
  switch (draft.kind) {
    case "folder":
      return { kind: "folder", path: draft.path };
    case "sftp":
      return {
        kind: "sftp",
        host: draft.host,
        port: draft.port,
        username: draft.username,
        remoteDir: draft.remoteDir,
        privateKeyPath: draft.privateKeyPath,
      };
    case "ftp":
      return {
        kind: "ftp",
        host: draft.host,
        port: draft.port,
        username: draft.username,
        remoteDir: draft.remoteDir,
        tls: draft.tls,
      };
    case "s3":
      return {
        kind: "s3",
        endpoint: draft.endpoint,
        region: draft.region,
        bucket: draft.bucket,
        prefix: draft.prefix,
        accessKeyId: draft.accessKeyId,
        pathStyle: draft.pathStyle,
      };
  }
}

/** Une destination enregistrée, ramenée à ce que le formulaire manipule.
 *
 *  Écrit champ par champ plutôt qu'avec un `...reste` : le compilateur vérifie
 *  ainsi qu'aucune variante n'oublie une clé, et l'identifiant comme la date de
 *  création — qui appartiennent au stockage — ne peuvent pas se glisser dans un
 *  brouillon par accident.
 *
 *  `secret` reste vide : il n'est jamais relu depuis le coffre, et un champ vide
 *  signifie « garder celui qui est déjà enregistré ». */
export function toDestinationDraft(destination: Destination): DestinationDraft {
  const common = { name: destination.name, secret: "" };
  switch (destination.kind) {
    case "folder":
      return { ...common, kind: "folder", path: destination.path };
    case "sftp":
      return {
        ...common,
        kind: "sftp",
        host: destination.host,
        port: destination.port,
        username: destination.username,
        remoteDir: destination.remoteDir,
        privateKeyPath: destination.privateKeyPath,
      };
    case "ftp":
      return {
        ...common,
        kind: "ftp",
        host: destination.host,
        port: destination.port,
        username: destination.username,
        remoteDir: destination.remoteDir,
        tls: destination.tls,
      };
    case "s3":
      return {
        ...common,
        kind: "s3",
        endpoint: destination.endpoint,
        region: destination.region,
        bucket: destination.bucket,
        prefix: destination.prefix,
        accessKeyId: destination.accessKeyId,
        pathStyle: destination.pathStyle,
      };
  }
}
