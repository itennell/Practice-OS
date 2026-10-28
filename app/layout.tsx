import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Practice-OS",
  description: "Aeon, an AI co-owner for your private practice.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full font-sans">
        {/* "Larger text" (set in onboarding) before the first paint, on every page. */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("po-text-size")==="large")document.documentElement.dataset.textSize="large"}catch(e){}` }} />
        {children}
      </body>
    </html>
  );
}
