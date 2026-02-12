import type { Metadata } from "next";
import "./globals.css";
import { SwRegister } from "@/components/pwa/sw-register";

export const metadata: Metadata = {
  title: "VISIO 360° - Performans Değerlendirme Sistemi",
  description: "360 Derece Performans Değerlendirme ve Kişisel Gelişim Sistemi",
  applicationName: "VISIO 360°",
  manifest: "/manifest.webmanifest",
  themeColor: "#1d4ed8",
  appleWebApp: { capable: true, title: "VISIO 360°", statusBarStyle: "default" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="light">
      <body className="font-sans antialiased">
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
