import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIP Continuation — Discovery Engine",
  description:
    "Labels public investor conversation against a fixed schema and counts where SIP continuation breaks down.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
