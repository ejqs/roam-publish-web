import type { Metadata } from "next";
import Script from "next/script";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { UMAMI_WEBSITE_ID } from "@/lib/umami";
import "./globals.css";

export const metadata: Metadata = {
  // Makes link-preview image and page URLs absolute, as chat apps and feeds need.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "Roam Publish",
  description: "Publish Roam Research pages and blocks to the web.",
  appleWebApp: { title: "Roam Publish" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AnnouncementBanner />
          {children}
          <Toaster />
        </ThemeProvider>
        {process.env.NODE_ENV === "production" && (
          <Script
            src="https://cloud.umami.is/script.js"
            data-website-id={UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
