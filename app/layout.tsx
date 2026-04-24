import type { Metadata } from "next";
import Script from "next/script";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "핏크닉 강사 아웃리치 매니저",
  description: "강사 모집 파이프라인 관리 도구",
  icons: {
    icon: "/teacher.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body
        style={{ fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', sans-serif" }}
        className="min-h-full flex flex-col bg-background text-foreground"
        suppressHydrationWarning
      >
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster position="bottom-right" richColors />
        </TooltipProvider>
        <Script
          src="/contact-widget.js"
          strategy="lazyOnload"
          data-site-name="핏크닉 아웃리치 웹"
        />
      </body>
    </html>
  );
}
