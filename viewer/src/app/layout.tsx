import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Collaboration graphs · local",
  description: "Local viewer for collaboration graphs built during subagent-driven development.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Static file, loaded synchronously so the stored theme applies
            before first paint. Copied from web/public/theme.js. The viewer
            has no ThemeToggle (no src/components/ui/ here, and none is
            planned) - this only honors a stored/system preference if one is
            ever set; dark mode otherwise comes entirely from globals.css's
            prefers-color-scheme. */}
        <script src="/theme.js" />
      </head>
      <body>
        <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
