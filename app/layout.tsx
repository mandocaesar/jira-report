import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jira Sprint Report",
  description: "Track sprint utilization metrics and team mandays with Indonesian public holiday support",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 min-h-screen`}>
        <Sidebar>
          {children}
        </Sidebar>
        <Analytics />
      </body>
    </html>
  );
}
