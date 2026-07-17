use std::path::Path;
use std::process::Stdio;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

use crate::engines::{build_dump_command, Connection, DumpOptions, EngineId};

pub struct DumpOutcome {
    pub size_bytes: u64,
    pub output_path: String,
}

/// Exécute un dump de bout en bout, sans dépendre de Tauri : la logique système
/// est ainsi testable contre une vraie base (voir les tests en bas de fichier).
///
/// `on_log` reçoit chaque ligne de stderr au fil de l'eau. `cancel` est un futur
/// qui, s'il se résout avant la fin, tue le process — l'appelant Tauri y branche
/// l'annulation depuis l'UI ; un test passe `std::future::pending()`.
pub async fn execute_dump(
    conn: &Connection,
    opts: &DumpOptions,
    password: Option<&str>,
    tools_dir: &Path,
    mut on_log: impl FnMut(String),
    cancel: impl std::future::Future<Output = ()>,
) -> Result<DumpOutcome, String> {
    let output_path = format!("{}/{}", opts.destination_dir, opts.file_name);
    let cmd_spec = build_dump_command(conn, opts, &output_path, password);

    // Postgres : si pg_dump n'est pas installé, on le télécharge (une fois) et on
    // exécute le binaire portable par son chemin absolu. Les autres moteurs
    // restent tributaires des outils système (déjà signalés par check_binary).
    let resolved_bin = if matches!(conn.engine, EngineId::Postgres) {
        crate::provision::resolve_pg_dump(tools_dir, &mut on_log)?
            .to_string_lossy()
            .into_owned()
    } else {
        cmd_spec.bin.to_string()
    };

    let mut command = Command::new(&resolved_bin);
    command.args(&cmd_spec.args);
    for (k, v) in &cmd_spec.env {
        command.env(k, v);
    }
    command.stderr(Stdio::piped());
    command.stdout(Stdio::piped());
    if cmd_spec.stdin_input.is_some() {
        command.stdin(Stdio::piped());
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("impossible de lancer {} : {e}", cmd_spec.bin))?;

    if let (Some(secret), Some(mut stdin)) = (cmd_spec.stdin_input.clone(), child.stdin.take()) {
        stdin
            .write_all(format!("{secret}\n").as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        drop(stdin);
    }

    // sqlite3 crache le dump sur stdout : on l'écrit nous-mêmes. Pour les autres
    // moteurs stdout ne porte que du bruit, et le log utile est sur stderr.
    let stdout = child.stdout.take();
    let stdout_task = match (&cmd_spec.stdout_to_file, stdout) {
        (Some(path), Some(out)) => {
            let path = path.clone();
            Some(tokio::spawn(async move {
                let mut file = tokio::fs::File::create(&path).await.map_err(|e| e.to_string())?;
                let mut reader = BufReader::new(out);
                tokio::io::copy_buf(&mut reader, &mut file)
                    .await
                    .map(|_| ())
                    .map_err(|e| e.to_string())
            }))
        }
        _ => None,
    };

    // stderr est collecté dans une tâche pour ne pas bloquer si le tampon se
    // remplit pendant qu'on attend la fin du process.
    let stderr = child.stderr.take();
    let (log_tx, mut log_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    if let Some(stderr) = stderr {
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = log_tx.send(line);
            }
        });
    }

    // On conserve les lignes de stderr en plus de les transmettre à l'UI : en cas
    // d'échec, la vraie cause y est ("connection refused", "permission denied",
    // "role does not exist"…) et doit apparaître dans le message d'erreur, pas
    // seulement dans le journal.
    let mut stderr_lines: Vec<String> = Vec::new();

    tokio::pin!(cancel);
    let status = loop {
        tokio::select! {
            line = log_rx.recv() => {
                if let Some(line) = line {
                    stderr_lines.push(line.clone());
                    on_log(line);
                }
            }
            s = child.wait() => break s.map_err(|e| e.to_string())?,
            _ = &mut cancel => {
                let _ = child.kill().await;
                return Err("Dump annulé".into());
            }
        }
    };

    // Vider les dernières lignes de log arrivées après la fin du process.
    while let Ok(line) = log_rx.try_recv() {
        stderr_lines.push(line.clone());
        on_log(line);
    }

    if let Some(task) = stdout_task {
        task.await.map_err(|e| e.to_string())??;
    }

    if !status.success() {
        let code = status.code().unwrap_or(-1);
        // Les dernières lignes de stderr portent la cause ; on en garde un extrait
        // lisible plutôt que le seul code de sortie.
        let start = stderr_lines.len().saturating_sub(8);
        let detail = stderr_lines[start..].join("\n");
        return Err(if detail.trim().is_empty() {
            format!("{} a échoué (code {code}), sans détail sur la sortie d'erreur.", cmd_spec.bin)
        } else {
            format!("{} a échoué (code {code}) :\n{detail}", cmd_spec.bin)
        });
    }

    let final_path = if cmd_spec.gzip_after {
        on_log("compression gzip…".into());
        crate::gzip::gzip_file(&output_path)?
    } else {
        output_path.clone()
    };

    // Un `.unwrap_or(0)` masquerait un fichier manquant en « Terminé · 0 o » :
    // on remonte plutôt l'anomalie.
    let size = match std::fs::metadata(&final_path) {
        Ok(m) => m.len(),
        Err(e) => {
            return Err(format!(
                "{} s'est terminé sans erreur mais le fichier attendu est introuvable :\n{final_path}\n({e})",
                cmd_spec.bin
            ))
        }
    };
    Ok(DumpOutcome {
        size_bytes: size,
        output_path: final_path,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engines::{DumpFormat, EngineId, SslMode};

    fn pg_conn(database: &str) -> Connection {
        Connection {
            id: "test".into(),
            name: "local".into(),
            engine: EngineId::Postgres,
            host: "localhost".into(),
            port: 5432,
            username: whoami_user(),
            database: database.into(),
            file_path: None,
            ssl_mode: SslMode::Prefer,
            created_at: "0".into(),
        }
    }

    fn whoami_user() -> String {
        std::env::var("USER").unwrap_or_else(|_| "postgres".into())
    }

    fn opts(dir: &str, name: &str, format: DumpFormat) -> DumpOptions {
        DumpOptions {
            format,
            destination_dir: dir.into(),
            file_name: name.into(),
            schema_only: false,
            data_only: false,
            clean: false,
            gzip: false,
            exclude_tables: vec![],
        }
    }

    fn pg_available() -> bool {
        which::which("pg_dump").is_ok()
            && std::process::Command::new("pg_isready")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
    }

    /// Dump réel de la base locale `orncity`. Ignoré si Postgres n'est pas là,
    /// pour ne pas casser un CI sans base.
    #[tokio::test]
    async fn real_postgres_custom_dump_produces_a_valid_file() {
        if !pg_available() {
            eprintln!("Postgres indisponible, test ignoré");
            return;
        }
        let dir = std::env::temp_dir().join("dbdump-it");
        std::fs::create_dir_all(&dir).unwrap();
        let dir = dir.to_string_lossy().to_string();

        let mut logs = Vec::new();
        let outcome = execute_dump(
            &pg_conn("orncity"),
            &opts(&dir, "it.dump", DumpFormat::Custom),
            None,
            &std::env::temp_dir(),
            |line| logs.push(line),
            std::future::pending(),
        )
        .await
        .expect("le dump doit réussir");

        assert!(outcome.size_bytes > 0, "fichier vide");
        // Un dump custom pg commence par la signature "PGDMP".
        let head = std::fs::read(&outcome.output_path).unwrap();
        assert_eq!(&head[..5], b"PGDMP", "signature de dump custom absente");
        std::fs::remove_file(&outcome.output_path).ok();
    }

    #[tokio::test]
    async fn real_postgres_plain_schema_only_contains_create_table() {
        if !pg_available() {
            eprintln!("Postgres indisponible, test ignoré");
            return;
        }
        let dir = std::env::temp_dir().join("dbdump-it");
        std::fs::create_dir_all(&dir).unwrap();
        let dir = dir.to_string_lossy().to_string();

        let mut o = opts(&dir, "schema.sql", DumpFormat::Plain);
        o.schema_only = true;
        let outcome = execute_dump(
            &pg_conn("orncity"),
            &o,
            None,
            &std::env::temp_dir(),
            |_| {},
            std::future::pending(),
        )
        .await
        .expect("le dump doit réussir");

        let sql = std::fs::read_to_string(&outcome.output_path).unwrap();
        assert!(sql.contains("CREATE TABLE"), "aucun CREATE TABLE");
        assert!(!sql.contains("COPY public."), "des données malgré schema-only");
        std::fs::remove_file(&outcome.output_path).ok();
    }

    #[tokio::test]
    async fn wrong_database_reports_an_error() {
        if !pg_available() {
            return;
        }
        let dir = std::env::temp_dir().to_string_lossy().to_string();
        let res = execute_dump(
            &pg_conn("base_qui_nexiste_pas_42"),
            &opts(&dir, "nope.dump", DumpFormat::Custom),
            None,
            &std::env::temp_dir(),
            |_| {},
            std::future::pending(),
        )
        .await;
        assert!(res.is_err(), "un dump vers une base absente doit échouer");
    }
}
