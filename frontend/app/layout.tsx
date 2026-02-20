import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kontrola vstupních dat – Online ocenění RD | Česká spořitelna",
  description: "Kontrola vstupních dat pro online ocenění rodinných domů – AI validační systém",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
