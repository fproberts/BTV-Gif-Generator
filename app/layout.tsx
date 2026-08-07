import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Boogie Board — Send Live Photos & Captions",
  description: "Send images and short text messages to the screen in real time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${outfit.variable} font-sans antialiased bg-[#14110f] text-[#f4ebe1] selection:bg-[#c85a32] selection:text-white min-h-screen relative`}
      >
        {/* Warm Subtle Ambient Glow */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-[#c85a32]/5 rounded-full blur-[140px]" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[300px] bg-[#6b7c4d]/5 rounded-full blur-[160px]" />
        </div>

        <div className="relative z-10">
          {children}
        </div>

        <Toaster position="bottom-right" theme="dark" richColors closeButton />
      </body>
    </html>
  );
}
