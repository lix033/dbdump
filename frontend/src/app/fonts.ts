import { Inter, Sora, Geist_Mono } from "next/font/google";

// Corps de texte : Inter, la référence des interfaces professionnelles —
// dense, neutre, parfaitement lisible aux petites tailles.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Titres : Sora, un grotesque géométrique à l'allure imposante et affirmée,
// qui donne du poids à la marque et aux en-têtes.
const sora = Sora({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Variables CSS des trois familles, à poser sur `<html>`. Instanciées une seule
 *  fois ici : chaque racine (`/`, `/fr/`, `/app/`) réutilise les mêmes fichiers. */
export const fontVariables = `${inter.variable} ${sora.variable} ${geistMono.variable}`;
