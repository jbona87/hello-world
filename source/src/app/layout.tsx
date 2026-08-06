import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PromptLens V2.5.7",
  description: "Multi-reference visual analysis with a dropdown-driven prompt editor.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
