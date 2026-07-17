import type { Metadata } from "next";
import { Inter, Sora, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

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

export const metadata: Metadata = {
  title: "DBDump",
  description: "Sauvegardez vos bases PostgreSQL, MySQL, SQLite et MongoDB en local.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${inter.variable} ${sora.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Toaster position="bottom-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
