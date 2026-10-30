import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Football Coach AI | Your game, understood.", description: "AI-powered football performance analysis and personalised coaching." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
