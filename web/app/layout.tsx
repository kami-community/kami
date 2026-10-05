import type { Metadata } from "next";
import { Domine, Source_Sans_3, Space_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const domine = Domine({
  variable: "--font-domine",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Kami — AI go-to-market agency",
  description:
    "Tell Kami what you built. It helps you find customers and get your product in front of the right people.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${domine.variable} ${sourceSans.variable} ${spaceMono.variable}`}>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
