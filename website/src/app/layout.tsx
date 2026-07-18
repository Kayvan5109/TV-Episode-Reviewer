import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Episode Ranker",
  description: "Rank your favorite TV shows' episodes against each other.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Required by TMDB's API terms of use — see Docs/Risks.md's note on TMDB attribution. */}
        <footer className="border-t border-black/10 px-6 py-3 dark:border-white/20">
          <p className="text-xs text-black/50 dark:text-white/50">
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
        </footer>
      </body>
    </html>
  );
}
