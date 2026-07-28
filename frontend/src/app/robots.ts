import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Export statique : le fichier est généré au build, jamais à la demande.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // UI embarquée par l'app desktop, servie en 404 par nginx : rien à explorer.
      disallow: "/app/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
