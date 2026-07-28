"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useMounted } from "@/lib/use-is-browser";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";

/** Bascule clair/sombre. L'icône n'apparaît qu'après montage, pour éviter
 *  d'afficher la mauvaise avant de connaître le thème résolu. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  const mounted = useMounted();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? t.common.themeToLight : t.common.themeToDark}
    >
      {mounted && isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
