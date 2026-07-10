import type { Metadata } from "next";
import { Fraunces, Public_Sans } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import Navbar from "@/components/Navbar";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});
const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kiwi Learning",
  description:
    "Upload your material. Kiwi builds lessons, flashcards, and quizzes from it — and tracks how ready you actually are.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${publicSans.variable}`}>
      <body className="min-h-screen">
        <Navbar />
        {children}
      </body>
    </html>
  );
}
