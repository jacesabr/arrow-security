import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClientProviders } from "../components/ClientProviders";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Arrow Security — Operations Portal",
  description: "Security operations management for tenant admins",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={inter.className}>
        {/* mapbox-gl CSS is imported by the components that need it
            (GeofenceMap, ShiftReplayMap, /map page) so it ships with the
            chunks that actually use the map and we keep the document head
            free of CDN dependencies. */}
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
