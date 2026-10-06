import type { Metadata } from "next";
import { Geist_Mono, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

// Tipografía de DESIGN.md. next/font sirve las fuentes desde el propio dominio:
// el navegador del cliente no hace peticiones a Google.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Solo para el nombre de la barbería y títulos de páginas públicas.
const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reservas para barberías",
  description: "Reserva tu cita en la barbería en pocos pasos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${playfair.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
