import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Municipal Debt Capacity & Repayment Planner (Indonesia)",
  description: "Interactive web app to size debt under 75% rule and DSCR with grace periods and reserves.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
