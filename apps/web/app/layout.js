import "../styles/globals.css";
import { Inter } from "next/font/google";
import { Providers } from "../components/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Wizard Recruiting OS",
  description:
    "Orchestrate full-funnel recruiting campaigns with LLM-powered automation."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="bg-neutral-100 text-neutral-900">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
