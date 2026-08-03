/** Marque DBDump en SVG inline : nette à toute taille, sans requête réseau (l'app
 *  de bureau tourne hors ligne) et sans fond, donc lisible sur clair comme sur
 *  sombre. Les fichiers dérivés (favicon, icônes d'app, image Open Graph) sont
 *  générés depuis `brand/logo.svg`, qui reprend exactement ces tracés. */

type LogoProps = {
  className?: string;
  /** Libellé accessible. Sans lui, la marque est décorative : c'est le cas quand
   *  le nom « DBDump » est déjà écrit juste à côté. */
  label?: string;
};

export function Logo({ className, label }: LogoProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      {/* Corps du cylindre : côtés droits, calottes elliptiques. */}
      <path
        fill="#61b548"
        d="M72.3 111L72.3 401A183.7 89.6 0 0 0 439.7 401L439.7 111A183.7 89.6 0 0 0 72.3 111Z"
      />
      {/* Bandes sombres : deux arcs de la même ellipse, l'un descendant, l'autre remontant. */}
      <path
        fill="#186b45"
        d="M72.3 158.6A183.7 89.6 0 0 0 439.7 158.6L439.7 214.6A183.7 89.6 0 0 1 72.3 214.6Z"
      />
      <path
        fill="#186b45"
        d="M72.3 259.4A183.7 89.6 0 0 0 439.7 259.4L439.7 314.8A183.7 89.6 0 0 1 72.3 314.8Z"
      />
      <circle fill="#186b45" cx="256" cy="432.4" r="14" />
      {/* La flèche « dump » : elle descend dans la base. */}
      <path fill="#ffffff" d="M238.6 206.7H273.4V269.4H322.1L256 378.1L189.9 269.4H238.6Z" />
    </svg>
  );
}
