import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mobile IDE",
  description: "A local editor for Flutter and React Native projects"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
