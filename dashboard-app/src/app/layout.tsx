import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yantric | AI Voice Agent Platform",
  description: "Create your AI voice agent in minutes. No technical knowledge required. Yantric handles everything.",
  keywords: ["AI Voice Agent", "AI Receptionist", "Business AI", "Yantric", "Voice AI SaaS"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#060608] text-white font-sans antialiased overflow-x-hidden selection:bg-[#7C3AED]/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
