import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FoodStories · WhatsApp bot prototype",
  description: "Clickable prototype of the WhatsApp conversations for FoodStories' inactive-customer segments.",
  robots: { index: false, follow: false }, // shared by link only
};

export const viewport: Viewport = { themeColor: "#008069" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
