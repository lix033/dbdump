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
  Star,
} from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AppleIcon, WindowsIcon, LinuxIcon, GitHubIcon } from "@/components/os-icons";
import { AppPreview } from "@/components/app-preview";
import { GITHUB_REPO, RELEASES_PAGE, REPO_URL } from "@/lib/site";
import { useI18n } from "@/i18n/provider";
import { formatNumber } from "@/i18n/format";
import type { FaqId, FeatureId, OsKey, StepId } from "@/i18n/dictionary-types";

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

/** Vrai dès que la page a quitté le haut : l'en-tête gagne alors sa bordure et
 *  son ombre, et reste transparent tant qu'on est sur le hero. Même approche que
 *  ci-dessus : abonnement externe, pas de setState dans un effet. */
function useScrolled(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("scroll", onChange, { passive: true });
      return () => window.removeEventListener("scroll", onChange);
    },
    () => window.scrollY > 8,
    () => false,
  );
}

// Ordre d'affichage et habillage : le texte, lui, vient du dictionnaire. Ajouter
// une entrée ici sans la traduire ne compile pas.
const PLATFORMS: { key: OsKey; Icon: ComponentType<{ className?: string }> }[] = [
  { key: "mac-arm", Icon: AppleIcon },
  { key: "mac-intel", Icon: AppleIcon },
  { key: "windows", Icon: WindowsIcon },
  { key: "linux", Icon: LinuxIcon },
];

const FEATURES: { id: FeatureId; Icon: ComponentType<{ className?: string }> }[] = [
  { id: "local", Icon: Lock },
  { id: "tools", Icon: Settings2 },
  { id: "pgdump", Icon: Package },
  { id: "passwords", Icon: KeyRound },
  { id: "options", Icon: SlidersHorizontal },
  { id: "progress", Icon: Radio },
];

const STEPS: StepId[] = ["install", "connect", "folder", "run"];

const FAQ: FaqId[] = ["tools", "privacy", "engines", "warning"];

const ENGINES = [
  { name: "PostgreSQL", color: "var(--engine-postgres)", tool: "pg_dump" },
  { name: "MySQL", color: "var(--engine-mysql)", tool: "mysqldump" },
  { name: "MariaDB", color: "var(--engine-mysql)", tool: "mysqldump" },
  { name: "SQLite", color: "var(--engine-sqlite)", tool: "sqlite3" },
  { name: "MongoDB", color: "var(--engine-mongodb)", tool: "mongodump" },
];

export function LandingPage() {
  const { locale, t } = useI18n();
  const copy = t.landing;
  const [links, setLinks] = useState<Partial<Record<OsKey, string>>>({});
  const [version, setVersion] = useState<string | null>(null);
  const [stars, setStars] = useState<number | null>(null);
  const recommended = useDetectedOs();
  const scrolled = useScrolled();

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
    // Liens directs + nombre d'étoiles via l'API GitHub (silencieux si aucune
    // release, dépôt privé ou hors-ligne : la page reste complète sans).
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

    (async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!res.ok) return;
        const repo = await res.json();
        if (typeof repo.stargazers_count === "number") setStars(repo.stargazers_count);
      } catch {
        /* la pastille d'étoiles est simplement omise */
      }
    })();
  }, []);

  const hrefFor = (key: OsKey) => links[key] ?? RELEASES_PAGE;
  const recLabel = recommended ? copy.download.platforms[recommended].name : null;

  return (
    <div className="bg-background text-foreground min-h-dvh">
      {/* Header — transparent sur le hero, il se pose dès qu'on défile. */}
      <header
        className={`sticky top-0 z-50 backdrop-blur transition-[background-color,border-color,box-shadow] duration-300 ${
          scrolled
            ? "bg-background/80 shadow-soft border-b"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
          <Link href="#top" className="group flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon.png"
              alt={t.common.appName}
              className="size-9 transition-transform duration-300 group-hover:scale-110"
              width={36}
              height={36}
            />
            <span className="font-heading text-lg font-extrabold tracking-tight">
              {t.common.appName}
            </span>
          </Link>
          <nav className="text-muted-foreground ml-auto hidden gap-7 text-sm md:flex">
            <a href="#features" className="hover:text-foreground transition-colors">
              {copy.nav.features}
            </a>
            <a href="#how" className="hover:text-foreground transition-colors">
              {copy.nav.how}
            </a>
            <a href="#faq" className="hover:text-foreground transition-colors">
              {copy.nav.docs}
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="text-muted-foreground hover:text-foreground hover:border-primary/40 hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:inline-flex"
            >
              <GitHubIcon className="size-3.5" />
              {t.common.github}
              {stars !== null && (
                <span className="text-foreground inline-flex items-center gap-1 tabular-nums">
                  <Star className="size-3 fill-current" />
                  {formatNumber(stars, locale)}
                </span>
              )}
            </a>
            <LanguageSwitcher />
            <ThemeToggle />
            <Button asChild size="sm" className="shadow-soft">
              <a href="#download">
                <Download className="size-4" />
                {t.common.download}
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="relative -mt-16 overflow-hidden px-6 pt-32 pb-16 text-center">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="bg-grid absolute inset-0" />
            <div className="bg-primary/15 glow-pulse absolute -top-48 left-1/2 size-[720px] -translate-x-1/2 rounded-full blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-3xl">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="bg-card/80 text-muted-foreground hover:border-primary/40 hover:text-foreground anim-fade-up mb-7 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs backdrop-blur transition-colors"
            >
              <span className="relative flex size-1.5">
                <span className="bg-primary animate-ping-soft absolute inset-0 rounded-full" />
                <span className="bg-primary relative size-1.5 rounded-full" />
              </span>
              {copy.hero.badge}
              <ArrowRight className="size-3" />
            </a>
            <h1
              className="font-heading anim-fade-up text-4xl font-extrabold tracking-tight text-balance sm:text-6xl"
              style={{ animationDelay: "80ms" }}
            >
              {copy.hero.titleLead} <span className="text-primary">{copy.hero.titleAccent}</span>
            </h1>
            <p
              className="text-muted-foreground anim-fade-up mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pretty"
              style={{ animationDelay: "160ms" }}
            >
              {copy.hero.subtitle}
            </p>
            <div
              className="anim-fade-up mt-9 flex flex-wrap justify-center gap-3"
              style={{ animationDelay: "240ms" }}
            >
              <Button asChild size="lg" className="shadow-soft">
                <a href="#download">
                  <Download className="size-4" />
                  {recLabel ? copy.hero.downloadFor(recLabel) : t.common.download}
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#how">
                  {copy.hero.seeHow}
                  <ArrowRight className="size-4" />
                </a>
              </Button>
            </div>
            <div
              className="text-muted-foreground anim-fade-up mt-6 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-sm"
              style={{ animationDelay: "320ms" }}
            >
              <span>{copy.hero.bulletFree}</span>
              <span>{copy.hero.bulletNoAccount}</span>
              <span>{copy.hero.bulletPlatforms}</span>
            </div>
          </div>

          {/* Aperçu de l'app : la promesse rendue concrète avant tout scroll. */}
          <div
            className="anim-fade-up relative mx-auto mt-16 max-w-4xl"
            style={{ animationDelay: "420ms" }}
          >
            <div
              aria-hidden
              className="bg-primary/20 absolute -inset-x-10 -top-6 bottom-8 rounded-[3rem] blur-3xl"
            />
            <div className="relative">
              <AppPreview />
            </div>
            {/* Fond en dégradé sous la fenêtre : elle se fond dans la section. */}
            <div
              aria-hidden
              className="from-background pointer-events-none absolute inset-x-0 -bottom-1 h-24 bg-gradient-to-t to-transparent"
            />
          </div>
        </section>

        {/* Bandeau des moteurs supportés */}
        <section className="border-y py-8">
          <p className="text-muted-foreground mb-6 text-center text-xs font-semibold tracking-widest uppercase">
            {copy.marquee.title}
          </p>
          <div className="fade-edges overflow-hidden">
            <div className="animate-marquee flex w-max gap-4">
              {[0, 1].map((copyIndex) => (
                <div key={copyIndex} className="flex gap-4" aria-hidden={copyIndex === 1}>
                  {ENGINES.map((e) => (
                    <span
                      key={e.name}
                      className="bg-card flex shrink-0 items-center gap-2.5 rounded-xl border px-5 py-2.5"
                    >
                      <span className="size-2.5 rounded" style={{ background: e.color }} />
                      <span className="text-sm font-medium">{e.name}</span>
                      <code className="text-muted-foreground font-mono text-xs">{e.tool}</code>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHead
              eyebrow={copy.features.eyebrow}
              title={copy.features.title}
              subtitle={copy.features.subtitle}
            />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ id, Icon }, i) => (
                <div
                  key={id}
                  className="bg-card shadow-soft hover:border-primary/50 card-hover reveal group rounded-2xl border p-6"
                  style={{ transitionDelay: `${(i % 3) * 70}ms` }}
                >
                  <span className="bg-accent text-accent-foreground group-hover:bg-primary group-hover:text-primary-foreground mb-4 flex size-11 items-center justify-center rounded-xl transition-colors duration-300">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="font-heading text-base font-semibold">
                    {copy.features.items[id].title}
                  </h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {copy.features.items[id].text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="bg-sidebar/50 border-y px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHead eyebrow={copy.steps.eyebrow} title={copy.steps.title} />
            <div className="relative grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {/* Fil qui relie les étapes sur grand écran. */}
              <div
                aria-hidden
                className="via-border pointer-events-none absolute top-11 right-8 left-8 hidden h-px bg-gradient-to-r from-transparent to-transparent lg:block"
              />
              {STEPS.map((id, i) => (
                <div
                  key={id}
                  className="bg-card shadow-soft card-hover hover:border-primary/50 reveal relative rounded-2xl border p-6"
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <span className="bg-primary text-primary-foreground font-heading mb-4 flex size-8 items-center justify-center rounded-lg text-sm font-bold">
                    {i + 1}
                  </span>
                  <h3 className="font-heading text-base font-semibold">
                    {copy.steps.items[id].title}
                  </h3>
                  <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                    {copy.steps.items[id].text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Download */}
        <section id="download" className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHead
              eyebrow={copy.download.eyebrow}
              title={copy.download.title}
              subtitle={
                version ? copy.download.latestVersion(version) : copy.download.subtitleDefault
              }
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PLATFORMS.map(({ key, Icon }, i) => {
                const rec = key === recommended;
                const platform = copy.download.platforms[key];
                return (
                  <div
                    key={key}
                    className={`bg-card shadow-soft card-hover reveal flex flex-col items-center rounded-2xl border p-6 text-center ${
                      rec ? "border-primary ring-primary/15 ring-1" : "hover:border-primary/50"
                    }`}
                    style={{ transitionDelay: `${i * 70}ms` }}
                  >
                    <div className="text-primary h-4 text-[11px] font-semibold tracking-wider uppercase">
                      {rec ? copy.download.recommended : ""}
                    </div>
                    <Icon className="text-foreground mt-1 size-9" />
                    <h3 className="font-heading mt-3 text-base font-semibold">{platform.name}</h3>
                    <div className="text-muted-foreground mb-4 text-xs">{platform.arch}</div>
                    <Button asChild className="mt-auto w-full" variant={rec ? "default" : "outline"}>
                      <a href={hrefFor(key)}>{platform.cta}</a>
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="text-muted-foreground mx-auto mt-7 max-w-2xl space-y-2 text-center text-sm">
              <p>
                {copy.download.notes.releasesBefore}
                <a href={RELEASES_PAGE} className="text-primary underline underline-offset-4">
                  {copy.download.notes.releasesLink}
                </a>
                {copy.download.notes.releasesAfter}
              </p>
              <p>
                <strong className="text-foreground">{copy.download.notes.macosLabel}</strong>
                {copy.download.notes.macosText1}
                <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                  {copy.download.notes.macosCode}
                </code>
                {copy.download.notes.macosText2}
              </p>
              <p>
                <strong className="text-foreground">{copy.download.notes.windowsLabel}</strong>
                {copy.download.notes.windowsText1}
                <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                  {copy.download.notes.windowsCode1}
                </code>
                {copy.download.notes.windowsText2}
                <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                  {copy.download.notes.windowsCode2}
                </code>
                {copy.download.notes.windowsText3}
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="bg-sidebar/50 border-t px-6 py-24">
          <div className="mx-auto max-w-3xl">
            <SectionHead eyebrow={copy.faq.eyebrow} title={copy.faq.title} />
            <div className="grid gap-3">
              {FAQ.map((id, i) => (
                <details
                  key={id}
                  className="bg-card open:border-primary/40 hover:border-primary/30 group reveal rounded-xl border px-5 transition-colors"
                  style={{ transitionDelay: `${i * 60}ms` }}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 font-medium [&::-webkit-details-marker]:hidden">
                    {copy.faq.items[id].q}
                    <span className="text-primary shrink-0 text-xl transition-transform duration-300 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="text-muted-foreground pb-4 text-sm leading-relaxed">
                    {copy.faq.items[id].a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Dernier appel à l'action */}
        <section className="relative overflow-hidden border-t px-6 py-24">
          <div
            aria-hidden
            className="bg-primary/12 glow-pulse pointer-events-none absolute -bottom-56 left-1/2 size-[620px] -translate-x-1/2 rounded-full blur-3xl"
          />
          <div className="reveal relative mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              {copy.cta.title}
            </h2>
            <p className="text-muted-foreground mt-4 text-lg text-pretty">{copy.cta.subtitle}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="shadow-soft">
                <a href="#download">
                  <Download className="size-4" />
                  {recLabel ? copy.hero.downloadFor(recLabel) : copy.cta.download}
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
                  <GitHubIcon className="size-4" />
                  {copy.cta.viewCode}
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="text-muted-foreground border-t px-6 py-10 text-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt={t.common.appName} className="size-7" width={28} height={28} />
            <span className="font-heading text-foreground font-bold">{t.common.appName}</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-4" /> {copy.footer.tagline}
            </span>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
            >
              <GitHubIcon className="size-4" />
              {t.common.github}
            </a>
            <LanguageSwitcher className="-my-1" />
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
      <h2 className="font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {subtitle && <p className="text-muted-foreground mt-3 text-lg text-pretty">{subtitle}</p>}
    </div>
  );
}
