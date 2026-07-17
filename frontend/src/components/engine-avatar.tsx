import { ENGINE_UI, engineTint } from "@/lib/engine-ui";
import type { EngineId } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: "size-8 rounded-lg", icon: "size-4" },
  md: { box: "size-10 rounded-xl", icon: "size-5" },
  lg: { box: "size-12 rounded-2xl", icon: "size-6" },
} as const;

/** Carré arrondi teinté à la couleur du moteur, avec son icône. Donne à chaque
 *  base une identité visuelle immédiate, à la manière des icônes de workspace. */
export function EngineAvatar({
  engine,
  size = "md",
  className,
}: {
  engine: EngineId;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { icon: Icon, color } = ENGINE_UI[engine];
  const s = SIZES[size];
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center", s.box, className)}
      style={engineTint(color)}
    >
      <Icon className={s.icon} strokeWidth={2} />
    </span>
  );
}
