import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ECHO",
  description: "Live Korean · English · Chinese interpreting, three columns",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
