"use client";

import { Check, Languages } from "lucide-react";
import { LOCALES, LOCALE_NAMES, LOCALE_SHORT, landingPath, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { storeLocale } from "@/i18n/locale-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Sélecteur de langue.
 *
 *  Sur la landing, la langue fait partie de l'URL : chaque entrée est un vrai
 *  lien (`/` ou `/fr/`), donc partageable et indexable — le choix est aussi
 *  mémorisé pour l'app. Dans l'app, la langue bascule sur place. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, t, setLocale, fixed } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`text-muted-foreground h-8 gap-1.5 px-2 ${className ?? ""}`}
          aria-label={t.common.language}
        >
          <Languages className="size-4" />
          <span className="text-xs font-medium">{LOCALE_SHORT[locale]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {LOCALES.map((code) => (
          <LocaleItem
            key={code}
            code={code}
            active={code === locale}
            asLink={fixed}
            onSelect={setLocale}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LocaleItem({
  code,
  active,
  asLink,
  onSelect,
}: {
  code: Locale;
  active: boolean;
  asLink: boolean;
  onSelect: (locale: Locale) => void;
}) {
  const body = (
    <>
      <span className="flex-1">{LOCALE_NAMES[code]}</span>
      {active && <Check className="size-3.5" />}
    </>
  );

  // `hrefLang` renseigne la langue de la page visée ; le choix est mémorisé au
  // clic pour que l'app (et la prochaine visite) l'utilisent.
  if (asLink) {
    const href = landingPath(code);
    return (
      <DropdownMenuItem asChild className="px-2 py-1.5">
        <a
          href={href}
          hrefLang={code}
          onClick={(event) => {
            storeLocale(code);
            // Ouverture dans un nouvel onglet / une nouvelle fenêtre : on laisse
            // le navigateur faire.
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            // Un élément de menu Radix neutralise la navigation par défaut de
            // l'ancre : on la déclenche nous-mêmes. Le `href` reste vrai pour les
            // crawlers, le clic milieu et « ouvrir dans un nouvel onglet ».
            event.preventDefault();
            window.location.assign(href);
          }}
        >
          {body}
        </a>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem className="px-2 py-1.5" onSelect={() => onSelect(code)}>
      {body}
    </DropdownMenuItem>
  );
}
