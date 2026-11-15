import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "KeyStudio3D · Loja",
  description: "Peças em impressão 3D sob medida: catálogo completo e pedido direto pelo WhatsApp, sem cadastro.",
  manifest: "/manifest-loja.json",
  openGraph: {
    title: "KeyStudio3D · Loja",
    description: "Peças em impressão 3D sob medida: catálogo completo e pedido direto pelo WhatsApp, sem cadastro.",
    images: [{ url: "/brand/keystudio3d-logo.png", width: 1000, height: 916 }],
  },
};

export const viewport: Viewport = {
  themeColor: "#faf8f5",
};

export default function LojaLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${sans.variable} ${display.variable}`}>{children}</div>;
}
