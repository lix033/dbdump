use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineId {
    Postgres,
    Mysql,
    Sqlite,
    Mongodb,
}

impl EngineId {
    pub fn dump_binary(&self) -> &'static str {
        match self {
            EngineId::Postgres => "pg_dump",
            EngineId::Mysql => "mysqldump",
            EngineId::Sqlite => "sqlite3",
            EngineId::Mongodb => "mongodump",
        }
    }

    /// Binaire léger utilisé pour tester une connexion sans produire de dump.
    pub fn probe_binary(&self) -> &'static str {
        match self {
            EngineId::Postgres => "psql",
            EngineId::Mysql => "mysql",
            EngineId::Sqlite => "sqlite3",
            EngineId::Mongodb => "mongosh",
        }
    }

    pub fn install_hint(&self) -> &'static str {
        match self {
            EngineId::Postgres => "brew install postgresql@16",
            EngineId::Mysql => "brew install mysql-client",
            EngineId::Sqlite => "brew install sqlite",
            EngineId::Mongodb => "brew install mongodb-database-tools",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DumpFormat {
    Plain,
    Custom,
    Directory,
    Archive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SslMode {
    Disable,
    Prefer,
    Require,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub id: String,
    pub name: String,
    pub engine: EngineId,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub database: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    pub ssl_mode: SslMode,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DumpOptions {
    pub format: DumpFormat,
    pub destination_dir: String,
    pub file_name: String,
    pub schema_only: bool,
    pub data_only: bool,
    pub clean: bool,
    pub gzip: bool,
    pub exclude_tables: Vec<String>,
}

/// La commande à exécuter. `env` et `stdin_input` contiennent les secrets :
/// ils ne quittent jamais Rust.
pub struct DumpCommand {
    pub bin: &'static str,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    /// sqlite3 écrit son dump sur stdout : le runner doit le rediriger ici.
    /// Les autres moteurs écrivent eux-mêmes dans le fichier.
    pub stdout_to_file: Option<String>,
    /// mongodump n'a pas de variable d'environnement pour le mot de passe et
    /// `--password <valeur>` le rendrait visible dans `ps`. On le lui donne sur
    /// stdin, ce qu'il attend quand --username est fourni sans --password.
    pub stdin_input: Option<String>,
    /// Compression à appliquer au fichier produit, quand l'outil ne sait pas la
    /// faire lui-même (mysqldump, sqlite3).
    pub gzip_after: bool,
}

/// Construit l'argv du dump. C'est la seule autorité à l'exécution : le frontend
/// envoie des options structurées, jamais une commande. Le miroir TypeScript
/// (src/lib/dump-command.ts) ne sert qu'à l'aperçu et doit rester aligné.
pub fn build_dump_command(
    conn: &Connection,
    opts: &DumpOptions,
    output_path: &str,
    password: Option<&str>,
) -> DumpCommand {
    let mut args: Vec<String> = Vec::new();
    let mut env: Vec<(String, String)> = Vec::new();
    let mut stdout_to_file: Option<String> = None;
    let mut stdin_input: Option<String> = None;
    let mut gzip_after = false;
    let s = |v: &str| v.to_string();

    match conn.engine {
        EngineId::Postgres => {
            args.extend([s("--host"), conn.host.clone()]);
            args.extend([s("--port"), conn.port.to_string()]);
            args.extend([s("--username"), conn.username.clone()]);
            let fmt = match opts.format {
                DumpFormat::Plain => "plain",
                DumpFormat::Directory => "directory",
                _ => "custom",
            };
            args.extend([s("--format"), s(fmt)]);
            if opts.clean {
                args.extend([s("--clean"), s("--if-exists")]);
            }
            if opts.schema_only {
                args.push(s("--schema-only"));
            }
            if opts.data_only {
                args.push(s("--data-only"));
            }
            for t in &opts.exclude_tables {
                args.extend([s("--exclude-table"), t.clone()]);
            }
            // pg_dump compresse lui-même : pas besoin de repasser sur le fichier.
            if opts.gzip {
                args.push(s("--compress=9"));
            }
            // Sans --no-password, pg_dump ouvrirait un prompt tty et resterait
            // bloqué : la webview n'a pas de terminal pour y répondre.
            args.push(s("--no-password"));
            if matches!(conn.ssl_mode, SslMode::Require) {
                env.push((s("PGSSLMODE"), s("require")));
            }
            if let Some(p) = password {
                // Via l'env, pas l'argv : sinon le mot de passe serait lisible
                // dans `ps` par tout utilisateur de la machine.
                env.push((s("PGPASSWORD"), s(p)));
            }
            args.extend([s("--file"), s(output_path)]);
            args.push(conn.database.clone());
        }
        EngineId::Mysql => {
            args.push(format!("--host={}", conn.host));
            args.push(format!("--port={}", conn.port));
            args.push(format!("--user={}", conn.username));
            if opts.clean {
                args.push(s("--add-drop-table"));
            }
            if opts.schema_only {
                args.push(s("--no-data"));
            }
            if opts.data_only {
                args.push(s("--no-create-info"));
            }
            for t in &opts.exclude_tables {
                args.push(format!("--ignore-table={}.{}", conn.database, t));
            }
            if matches!(conn.ssl_mode, SslMode::Require) {
                args.push(s("--ssl-mode=REQUIRED"));
            }
            args.push(format!("--result-file={}", output_path));
            args.push(conn.database.clone());
            if let Some(p) = password {
                env.push((s("MYSQL_PWD"), s(p)));
            }
            // mysqldump ne sait pas compresser sa sortie.
            gzip_after = opts.gzip;
        }
        EngineId::Sqlite => {
            args.push(conn.file_path.clone().unwrap_or_default());
            match opts.format {
                // VACUUM INTO produit une copie cohérente même si la base est
                // en cours d'écriture, contrairement à un cp. sqlite3 écrit le
                // fichier lui-même, donc pas de redirection.
                DumpFormat::Archive => args.push(format!("VACUUM INTO '{}'", output_path)),
                _ => {
                    args.push(if opts.schema_only { s(".schema") } else { s(".dump") });
                    stdout_to_file = Some(s(output_path));
                    gzip_after = opts.gzip;
                }
            }
        }
        EngineId::Mongodb => {
            args.push(format!("--host={}", conn.host));
            args.push(format!("--port={}", conn.port));
            if !conn.username.is_empty() {
                args.push(format!("--username={}", conn.username));
            }
            args.push(format!("--db={}", conn.database));
            if matches!(conn.ssl_mode, SslMode::Require) {
                args.push(s("--ssl"));
            }
            for t in &opts.exclude_tables {
                args.push(format!("--excludeCollection={}", t));
            }
            match opts.format {
                DumpFormat::Archive => args.push(format!("--archive={}", output_path)),
                _ => args.push(format!("--out={}", output_path)),
            }
            // mongodump compresse nativement.
            if opts.gzip {
                args.push(s("--gzip"));
            }
            if password.is_some() && !conn.username.is_empty() {
                stdin_input = password.map(s);
            }
        }
    }

    DumpCommand {
        bin: conn.engine.dump_binary(),
        args,
        env,
        stdout_to_file,
        stdin_input,
        gzip_after,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn(engine: EngineId) -> Connection {
        Connection {
            id: "1".into(),
            name: "test".into(),
            engine,
            host: "localhost".into(),
            port: 5432,
            username: "mac".into(),
            database: "orncity".into(),
            file_path: None,
            ssl_mode: SslMode::Prefer,
            created_at: "2026-07-17".into(),
        }
    }

    fn opts(format: DumpFormat) -> DumpOptions {
        DumpOptions {
            format,
            destination_dir: "/tmp".into(),
            file_name: "out.dump".into(),
            schema_only: false,
            data_only: false,
            clean: false,
            gzip: false,
            exclude_tables: vec![],
        }
    }

    #[test]
    fn postgres_password_never_lands_in_argv() {
        let cmd = build_dump_command(
            &conn(EngineId::Postgres),
            &opts(DumpFormat::Custom),
            "/tmp/out.dump",
            Some("hunter2"),
        );
        assert!(!cmd.args.iter().any(|a| a.contains("hunter2")));
        assert!(cmd
            .env
            .iter()
            .any(|(k, v)| k == "PGPASSWORD" && v == "hunter2"));
    }

    #[test]
    fn postgres_never_prompts_on_tty() {
        let cmd = build_dump_command(
            &conn(EngineId::Postgres),
            &opts(DumpFormat::Custom),
            "/tmp/out.dump",
            None,
        );
        assert!(cmd.args.contains(&"--no-password".to_string()));
    }

    #[test]
    fn mysql_password_never_lands_in_argv() {
        let cmd = build_dump_command(
            &conn(EngineId::Mysql),
            &opts(DumpFormat::Plain),
            "/tmp/out.sql",
            Some("hunter2"),
        );
        assert!(!cmd.args.iter().any(|a| a.contains("hunter2")));
        assert!(cmd.env.iter().any(|(k, _)| k == "MYSQL_PWD"));
    }

    #[test]
    fn sqlite_dump_is_redirected_to_the_output_file() {
        let mut c = conn(EngineId::Sqlite);
        c.file_path = Some("/tmp/local.db".into());
        let cmd = build_dump_command(&c, &opts(DumpFormat::Plain), "/tmp/out.sql", None);
        // sqlite3 écrit sur stdout : sans redirection le fichier resterait vide.
        assert_eq!(cmd.stdout_to_file.as_deref(), Some("/tmp/out.sql"));
    }

    #[test]
    fn sqlite_vacuum_writes_its_own_file() {
        let mut c = conn(EngineId::Sqlite);
        c.file_path = Some("/tmp/local.db".into());
        let cmd = build_dump_command(&c, &opts(DumpFormat::Archive), "/tmp/out.db", None);
        assert_eq!(cmd.stdout_to_file, None);
        assert!(cmd.args.iter().any(|a| a.contains("VACUUM INTO")));
    }

    #[test]
    fn mongo_password_goes_to_stdin_not_argv() {
        let cmd = build_dump_command(
            &conn(EngineId::Mongodb),
            &opts(DumpFormat::Archive),
            "/tmp/out.archive",
            Some("hunter2"),
        );
        assert!(!cmd.args.iter().any(|a| a.contains("hunter2")));
        assert_eq!(cmd.stdin_input.as_deref(), Some("hunter2"));
    }

    #[test]
    fn gzip_is_native_for_postgres_and_mongo_but_post_hoc_for_mysql() {
        let mut o = opts(DumpFormat::Custom);
        o.gzip = true;
        let pg = build_dump_command(&conn(EngineId::Postgres), &o, "/tmp/o.dump", None);
        assert!(pg.args.contains(&"--compress=9".to_string()));
        assert!(!pg.gzip_after);

        let mut o2 = opts(DumpFormat::Plain);
        o2.gzip = true;
        let my = build_dump_command(&conn(EngineId::Mysql), &o2, "/tmp/o.sql", None);
        assert!(my.gzip_after);
    }

    #[test]
    fn exclude_tables_are_qualified_for_mysql() {
        let mut o = opts(DumpFormat::Plain);
        o.exclude_tables = vec!["logs".into()];
        let cmd = build_dump_command(&conn(EngineId::Mysql), &o, "/tmp/out.sql", None);
        assert!(cmd.args.contains(&"--ignore-table=orncity.logs".to_string()));
    }
}
