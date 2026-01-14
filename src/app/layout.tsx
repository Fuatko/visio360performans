import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VISIO 360° - Performans Değerlendirme Sistemi",
  description: "360 Derece Performans Değerlendirme ve Kişisel Gelişim Sistemi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
