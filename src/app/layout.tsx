import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoicePilot — Multilingual AI Voice Receptionist",
  description:
    "A multilingual voice receptionist that understands code-mixed English, Chinese and Malay, and books appointments over a call. Built on the AssemblyAI Voice Agent API. lablab.ai × AssemblyAI Voice Agent Hackathon demo.",
};

export const viewport: Viewport = {
  themeColor: "#06070c",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
