import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Catálogo",
  description: "Catálogo de produtos com pedido direto pelo WhatsApp.",
  manifest: undefined,
  openGraph: {
    title: "Catálogo",
    description: "Catálogo de produtos com pedido direto pelo WhatsApp.",
    images: [{ url: "/brand/keystudio3d-logo.png", width: 1000, height: 916 }],
  },
};

export const viewport: Viewport = {
  themeColor: "#faf8f5",
};

export default function LojaLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${sans.variable} ${display.variable}`}>{children}</div>;
}
