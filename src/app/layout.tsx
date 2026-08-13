import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LENGOLF Layout Studio — One Bangkok Unit 1225",
  description:
    "Interactive floor-plan tool for trialling golf-simulator bay arrangements in the One Bangkok unit.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The canvas has its own pinch/zoom model; browser zoom on top of it fights
  // the pointer maths and makes measurement feel unreliable on iPad.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
