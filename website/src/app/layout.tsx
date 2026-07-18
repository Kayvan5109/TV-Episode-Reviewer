import type { Metadata } from "next";
import Link from "next/link";
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
        <footer className="flex items-center justify-between border-t border-black/10 px-6 py-3 dark:border-white/20">
          {/* Required by TMDB's API terms of use — see Docs/Risks.md's note on TMDB attribution. */}
          <p className="text-xs text-black/50 dark:text-white/50">
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
          <Link href="/privacy" className="text-xs text-black/50 underline dark:text-white/50">
            Privacy
          </Link>
        </footer>
      </body>
    </html>
  );
}
