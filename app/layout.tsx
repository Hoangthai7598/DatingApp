import type { Metadata, Viewport } from "next";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/be-vietnam-pro/800.css";
import "./globals.css";

export const metadata: Metadata = {
  // Neutral on purpose: the tab and the link preview (Zalo, Messenger…) shouldn't give the surprise away.
  title: "Gửi em",
  description: "Em mở ra xem nhé 💌",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#4a0f25", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
