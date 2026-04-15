import type { Metadata } from "next";
import { Syne, JetBrains_Mono, DM_Serif_Display } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["400", "600", "700", "800"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500", "600"],
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  variable: "--font-serif-display",
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Phantom — Code comes alive",
  description: "AI-generated 3Blue1Brown-style animated explanations of code. Paste any function, watch it animate.",
  openGraph: {
    title: "Phantom",
    description: "Watch your code come alive",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${jetbrains.variable} ${dmSerif.variable}`}>
      <body>
        {children}
      </body>
    </html>
  );
}
