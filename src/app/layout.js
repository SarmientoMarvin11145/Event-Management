import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import ChatWidgetServer from "@/components/chat-widget-server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "KURO | Event management",
  description: "Manage events and attendance with KURO.",
  icons: { icon: "/kuro logo-edited.png" },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}<Suspense fallback={null}><ChatWidgetServer /></Suspense></body>
    </html>
  );
}
