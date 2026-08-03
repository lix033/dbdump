"use client";

import { useEffect, useState } from "react";
import { Activity, CalendarClock, Database, HardDrive } from "lucide-react";
import type { ComponentType } from "react";
import { getBackend } from "@/lib/backend";
import type { Connection } from "@/lib/types";
import { useI18n } from "@/i18n/provider";
import { Logo } from "@/components/logo";
import { ConnectionsView } from "@/components/connections-view";
import { SchedulesView } from "@/components/schedules-view";
import { DestinationsView } from "@/components/destinations-view";
import { MonitoringView } from "@/components/monitoring-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";

/** Les écrans de l'app. Le rail de gauche en expose un par entrée ; chacun
 *  apporte sa propre liste et son propre panneau de détail. */
type Section = "connections" | "schedules" | "destinations" | "monitoring";

const SECTIONS: { id: Section; Icon: ComponentType<{ className?: string }> }[] = [
  { id: "connections", Icon: Database },
  { id: "schedules", Icon: CalendarClock },
  { id: "destinations", Icon: HardDrive },
  { id: "monitoring", Icon: Activity },
];

export default function Page() {
  const backend = getBackend();
  const [section, setSection] = useState<Section>("connections");

  // Les connexions vivent ici : les deux écrans s'en servent (l'un les édite,
  // l'autre les vise depuis une programmation).
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    backend.loadConnections().then((list) => {
      setConnections(list);
      setLoaded(true);
    });
  }, [backend]);

  return (
    <div className="bg-background flex h-dvh">
      <Rail section={section} onSection={setSection} />
      {section === "connections" && (
        <ConnectionsView connections={connections} loaded={loaded} onChange={setConnections} />
      )}
      {section === "schedules" && <SchedulesView connections={connections} />}
      {section === "destinations" && <DestinationsView />}
      {section === "monitoring" && <MonitoringView />}
    </div>
  );
}

function Rail({
  section,
  onSection,
}: {
  section: Section;
  onSection: (section: Section) => void;
}) {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t.common.appName}
      className="bg-sidebar flex w-[5.5rem] shrink-0 flex-col items-center gap-1 border-r py-3"
    >
      <Logo className="mb-3 size-8" label={t.common.appName} />
      {SECTIONS.map(({ id, Icon }) => {
        const active = id === section;
        return (
          <button
            key={id}
            onClick={() => onSection(id)}
            aria-current={active ? "page" : undefined}
            className={`flex w-[4.5rem] flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition-colors ${
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
                : "text-muted-foreground hover:bg-sidebar-accent/60"
            }`}
          >
            <Icon className="size-5" />
            <span className="w-full truncate text-center">{t.app.nav[id]}</span>
          </button>
        );
      })}

      {/* Préférences d'affichage : au pied du rail, communes à tous les écrans. */}
      <div className="mt-auto flex flex-col items-center gap-0.5">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </nav>
  );
}
