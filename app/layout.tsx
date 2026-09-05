import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import "./globals.css";

import { cn } from "@/lib/utils";

const notoSans = Noto_Sans({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Roam Publish",
  description: "Share your roam research pages and blocks",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en" className={cn("font-sans", notoSans.variable)}
    // className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#FFF]">{children}</body>
    </html>
  );
}
