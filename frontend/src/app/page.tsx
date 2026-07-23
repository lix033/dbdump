"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Download,
  Lock,
  Settings2,
  Package,
  KeyRound,
  SlidersHorizontal,
  Radio,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppleIcon, WindowsIcon, LinuxIcon } from "@/components/os-icons";

// ── Configuration : remplacez par votre dépôt GitHub "utilisateur/repo". Les
//    boutons pointent vers vos Releases ; les liens directs par plateforme sont
//    résolus automatiquement via l'API GitHub dès qu'une release existe.
const GITHUB_REPO = "lix033/dbdump";
const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`;

type OsKey = "mac-arm" | "mac-intel" | "windows" | "linux";

/** OS du visiteur pour recommander le bon téléchargement. Via useSyncExternalStore
 *  (snapshot serveur `null`) : pas de setState dans un effet, pas de décalage
 *  d'hydratation sur le rendu statique. */
function useDetectedOs(): OsKey | null {
  return useSyncExternalStore(
    () => () => {},
    () => {
      const ua = navigator.userAgent;
      const p = navigator.platform || "";
      if (/Mac/.test(p) || /Mac/.test(ua)) return "mac-arm";
      if (/Win/.test(p) || /Windows/.test(ua)) return "windows";
      if (/Linux/.test(p) && !/Android/.test(ua)) return "linux";
      return null;
    },
    () => null,
  );
}

const PLATFORMS: {
  key: OsKey;
  Icon: ComponentType<{ className?: string }>;
  name: string;
  arch: string;
  cta: string;
}[] = [
  { key: "mac-arm", Icon: AppleIcon, name: "macOS", arch: "Apple Silicon (M1–M4)", cta: "Télécharger (.dmg)" },
  { key: "mac-intel", Icon: AppleIcon, name: "macOS", arch: "Intel (x86-64)", cta: "Télécharger (.dmg)" },
  { key: "windows", Icon: WindowsIcon, name: "Windows", arch: "10 / 11 (x86-64)", cta: "Télécharger (.exe)" },
  { key: "linux", Icon: LinuxIcon, name: "Linux", arch: "AppImage / .deb", cta: "Télécharger" },
];

const FEATURES = [
  { icon: Lock, title: "100% local", text: "Tout s'exécute sur votre machine. Aucune donnée ni mot de passe n'est envoyé sur un serveur tiers." },
  { icon: Settings2, title: "Les vrais outils", text: "DBDump pilote les binaires officiels (pg_dump, mysqldump, mongodump, sqlite3) : des dumps fidèles et restaurables." },
  { icon: Package, title: "pg_dump inclus", text: "PostgreSQL pas installé ? DBDump télécharge automatiquement pg_dump au premier dump. Rien à configurer." },
  { icon: KeyRound, title: "Mots de passe protégés", text: "Vos identifiants vivent dans le trousseau système, jamais en clair. Le fichier de connexions est chiffré en AES-256." },
  { icon: SlidersHorizontal, title: "Options complètes", text: "Structure seule, données seules, gzip, exclusion de tables, formats custom / SQL / répertoire… tout est là." },
  { icon: Radio, title: "Progression en direct", text: "Une fenêtre affiche l'avancement et la sortie de l'outil en temps réel — et la cause exacte en cas d'échec." },
];

const STEPS = [
  { title: "Installez", text: "Téléchargez l'app pour votre système et ouvrez-la. Aucune dépendance à installer au préalable." },
  { title: "Ajoutez une connexion", text: "Hôte, port, utilisateur, mot de passe. Testez la connexion en un clic." },
  { title: "Choisissez le dossier", text: "Sélectionnez où enregistrer, le format et les options qui vous conviennent." },
  { title: "Lancez le dump", text: "Suivez la progression, puis ouvrez le dossier ou récupérez le fichier produit." },
];

const ENGINES = [
  { name: "PostgreSQL", color: "oklch(0.55 0.13 250)" },
  { name: "MySQL / MariaDB", color: "oklch(0.64 0.14 55)" },
  { name: "SQLite", color: "oklch(0.58 0.12 210)" },
  { name: "MongoDB", color: "oklch(0.6 0.14 150)" },
];

const FAQ = [
  {
    q: "Dois-je installer PostgreSQL / pg_dump avant ?",
    a: "Non. Si pg_dump n'est pas déjà sur votre machine, DBDump télécharge automatiquement une version portable au premier dump PostgreSQL, puis fonctionne hors-ligne. Si vous avez votre propre installation, DBDump la détecte et la privilégie. Pour MySQL et MongoDB, les outils officiels doivent être installés ; SQLite est fourni par le système.",
  },
  {
    q: "Mes données ou mots de passe sont-ils envoyés quelque part ?",
    a: "Jamais. DBDump est une application de bureau qui s'exécute entièrement sur votre machine. Les mots de passe sont dans le trousseau système et le fichier de connexions est chiffré en AES-256. Aucun serveur, aucune télémétrie.",
  },
  {
    q: "Quelles bases sont supportées ?",
    a: "PostgreSQL, MySQL / MariaDB, SQLite et MongoDB — chacune avec son outil de dump officiel et ses options (structure seule, données seules, compression, exclusion de tables, formats custom / SQL brut / répertoire).",
  },
  {
    q: "Vais-je voir un avertissement de sécurité au lancement ?",
    a: "Sur macOS, non : l'application est signée avec un certificat Apple Developer et notarisée par Apple, elle s'ouvre normalement. Sur Windows, SmartScreen peut afficher « Windows a protégé votre ordinateur » tant que la signature de code n'est pas déployée — cliquez « Informations complémentaires » puis « Exécuter quand même ».",
  },
];

export default function LandingPage() {
  const [links, setLinks] = useState<Partial<Record<OsKey, string>>>({});
  const [version, setVersion] = useState<string | null>(null);
  const recommended = useDetectedOs();

  // Révélation douce au défilement : on ajoute la classe `.in` quand un élément
  // `.reveal` entre dans la vue. Manipulation de classes uniquement (pas de state).
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    // Liens directs via l'API GitHub (silencieux si aucune release / hors-ligne).
    (async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!res.ok) return;
        const rel = await res.json();
        const assets: { name: string; browser_download_url: string }[] = rel.assets ?? [];
        const find = (re: RegExp) => assets.find((a) => re.test(a.name))?.browser_download_url;
        setLinks({
          "mac-arm": find(/aarch64.*\.dmg$/i) ?? find(/aarch64.*\.app\.tar\.gz$/i),
          "mac-intel": find(/x64.*\.dmg$/i) ?? find(/x86_64.*\.dmg$/i),
          windows: find(/x64.*setup\.exe$/i) ?? find(/\.msi$/i) ?? find(/\.exe$/i),
          linux: find(/\.AppImage$/i) ?? find(/\.deb$/i),
        });
        if (rel.tag_name) setVersion(rel.tag_name);
      } catch {
        /* on garde les liens vers la page des releases */
      }
    })();
  }, []);

  const hrefFor = (key: OsKey) => links[key] ?? RELEASES_PAGE;
  const recLabel = recommended?.startsWith("mac")
    ? "macOS"
    : recommended === "windows"
      ? "Windows"
      : recommended === "linux"
        ? "Linux"
        : null;

  return (
    <div className="bg-background text-foreground min-h-dvh">
      {/* Header */}
      <header className="bg-background/70 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
          <Link href="#top" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="DBDump" className="size-9" width={36} height={36} />
            <span className="font-heading text-lg font-extrabold tracking-tight">DBDump</span>
          </Link>
          <nav className="text-muted-foreground ml-auto hidden gap-7 text-sm sm:flex">
            <a href="#features" className="hover:text-foreground transition-colors">Fonctionnalités</a>
            <a href="#how" className="hover:text-foreground transition-colors">Comment ça marche</a>
            <a href="#faq" className="hover:text-foreground transition-colors">Documentation</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <ThemeToggle />
            <Button asChild size="sm" className="shadow-soft">
              <a href="#download">
                <Download className="size-4" />
                Télécharger
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="relative overflow-hidden px-6 pt-24 pb-20 text-center">
          <div
            aria-hidden
            className="bg-primary/15 glow-pulse pointer-events-none absolute -top-40 left-1/2 size-[680px] -translate-x-1/2 rounded-full blur-3xl"
          />
          <div className="relative mx-auto max-w-3xl">
            <span className="bg-card text-muted-foreground anim-fade-up mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs">
              <span className="bg-primary ring-primary/20 size-1.5 rounded-full ring-4" />
              Local-first · vos données ne quittent jamais votre machine
            </span>
            <h1
              className="font-heading anim-fade-up text-4xl font-extrabold tracking-tight sm:text-6xl"
              style={{ animationDelay: "80ms" }}
            >
              Sauvegardez vos bases de données{" "}
              <span className="text-primary">en un clic</span>
            </h1>
            <p
              className="text-muted-foreground anim-fade-up mx-auto mt-6 max-w-2xl text-lg leading-relaxed"
              style={{ animationDelay: "160ms" }}
            >
              DBDump est une application de bureau qui dumpe vos bases PostgreSQL, MySQL, SQLite et
              MongoDB avec les vrais outils officiels — sans ligne de commande, sans serveur, sans
              fuite de données.
            </p>
            <div
              className="anim-fade-up mt-9 flex flex-wrap justify-center gap-3"
              style={{ animationDelay: "240ms" }}
            >
              <Button asChild size="lg" className="shadow-soft">
                <a href="#download">
                  <Download className="size-4" />
                  {recLabel ? `Télécharger pour ${recLabel}` : "Télécharger"}
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#how">
                  Voir comment ça marche
                  <ArrowRight className="size-4" />
                </a>
              </Button>
            </div>
            <div
              className="text-muted-foreground anim-fade-up mt-6 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-sm"
              style={{ animationDelay: "320ms" }}
            >
              <span>✓ Gratuit &amp; open source</span>
              <span>✓ Aucun compte requis</span>
              <span>✓ macOS · Windows · Linux</span>
            </div>

            <div
              className="anim-fade-up mt-14 flex flex-wrap justify-center gap-3"
              style={{ animationDelay: "400ms" }}
            >
              {ENGINES.map((e) => (
                <span
                  key={e.name}
                  className="bg-card flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium"
                >
                  <span className="size-2.5 rounded" style={{ background: e.color }} />
                  {e.name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <SectionHead
              eyebrow="Pourquoi DBDump"
              title="Puissant comme la ligne de commande, simple comme un clic"
              subtitle="Toute la robustesse de pg_dump & co., dans une interface claire."
            />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }, i) => (
                <div
                  key={title}
                  className="bg-card shadow-soft hover:border-primary/50 reveal rounded-2xl border p-6 transition-[color,border-color,opacity,transform]"
                  style={{ transitionDelay: `${(i % 3) * 70}ms` }}
                >
                  <span className="bg-accent text-accent-foreground mb-4 flex size-11 items-center justify-center rounded-xl">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="font-heading text-base font-semibold">{title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="bg-sidebar/50 border-y px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <SectionHead eyebrow="En 4 étapes" title="De l'installation au dump en deux minutes" />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <div
                  key={s.title}
                  className="bg-card shadow-soft reveal rounded-2xl border p-6"
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <span className="bg-primary text-primary-foreground font-heading mb-4 flex size-8 items-center justify-center rounded-lg text-sm font-bold">
                    {i + 1}
                  </span>
                  <h3 className="font-heading text-base font-semibold">{s.title}</h3>
                  <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Download */}
        <section id="download" className="px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <SectionHead
              eyebrow="Téléchargement"
              title="Choisissez votre plateforme"
              subtitle={version ? `Dernière version : ${version}` : "Gratuit et prêt à l'emploi."}
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PLATFORMS.map((pf, i) => {
                const rec = pf.key === recommended;
                const Icon = pf.Icon;
                return (
                  <div
                    key={pf.key}
                    className={`bg-card shadow-soft reveal flex flex-col items-center rounded-2xl border p-6 text-center ${
                      rec ? "border-primary ring-primary/15 ring-1" : ""
                    }`}
                    style={{ transitionDelay: `${i * 70}ms` }}
                  >
                    <div className="text-primary h-4 text-[11px] font-semibold tracking-wider uppercase">
                      {rec ? "Recommandé" : ""}
                    </div>
                    <Icon className="text-foreground mt-1 size-9" />
                    <h3 className="font-heading mt-3 text-base font-semibold">{pf.name}</h3>
                    <div className="text-muted-foreground mb-4 text-xs">{pf.arch}</div>
                    <Button asChild className="w-full" variant={rec ? "default" : "outline"}>
                      <a href={hrefFor(pf.key)}>{pf.cta}</a>
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="text-muted-foreground mx-auto mt-7 max-w-2xl space-y-2 text-center text-sm">
              <p>
                Toutes les versions sont sur la{" "}
                <a href={RELEASES_PAGE} className="text-primary underline underline-offset-4">
                  page des releases
                </a>
                .
              </p>
              <p>
                <strong className="text-foreground">macOS</strong> — l&apos;app est signée avec un
                certificat Apple Developer et notarisée par Apple. Ouvrez le{" "}
                <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">.dmg</code> et
                glissez DBDump dans Applications : elle démarre sans avertissement.
              </p>
              <p>
                <strong className="text-foreground">Windows</strong> — SmartScreen peut afficher
                «&nbsp;Windows a protégé votre ordinateur&nbsp;» : cliquez{" "}
                <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                  Informations complémentaires
                </code>{" "}
                →{" "}
                <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                  Exécuter quand même
                </code>
                .
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="bg-sidebar/50 border-t px-6 py-20">
          <div className="mx-auto max-w-3xl">
            <SectionHead eyebrow="Documentation" title="Questions fréquentes" />
            <div className="grid gap-3">
              {FAQ.map((item, i) => (
                <details
                  key={item.q}
                  className="bg-card open:border-primary/40 group reveal rounded-xl border px-5"
                  style={{ transitionDelay: `${i * 60}ms` }}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 font-medium [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="text-primary text-xl transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="text-muted-foreground pb-4 text-sm leading-relaxed">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="text-muted-foreground border-t px-6 py-10 text-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="DBDump" className="size-7" width={28} height={28} />
            <span className="font-heading text-foreground font-bold">DBDump</span>
          </div>
          <div className="flex items-center gap-5">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-4" /> Sauvegardes de bases, en local
            </span>
            <a
              href={`https://github.com/${GITHUB_REPO}`}
              className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="reveal mx-auto mb-12 max-w-2xl text-center">
      <div className="text-primary mb-3 text-xs font-semibold tracking-widest uppercase">
        {eyebrow}
      </div>
      <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {subtitle && <p className="text-muted-foreground mt-3 text-lg">{subtitle}</p>}
    </div>
  );
}
