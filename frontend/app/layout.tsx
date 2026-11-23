import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "AutoApply AI | Candidaturas inteligentes", description: "Seu copiloto de oportunidades e candidaturas com IA" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
