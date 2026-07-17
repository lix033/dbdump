import type { NextConfig } from "next";

// Tauri sert le frontend comme fichiers statiques : aucun serveur Next au runtime.
// `trailingSlash` fait exporter chaque route en `.../index.html` (donc `/app` →
// `out/app/index.html`), ce que Tauri sait charger comme fenêtre de l'app.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
