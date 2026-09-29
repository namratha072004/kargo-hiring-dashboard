import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Hiring dashboard" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <a href="/"><strong>Hiring</strong></a>
          <a href="/?role=PM">PM</a>
          <a href="/?role=SPM">SPM</a>
          <a href="/settings">Settings</a>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
