import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const inter = Inter({
  variable: "--font-sans-fallback",
  subsets: ["latin"],
});

export const metadata = {
  title: "ULAB Research Network",
  description: "Discover ULAB faculty by research domain and explore connections.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} antialiased min-h-screen flex flex-col`}
      >
        <Navbar />
        <main className="flex-1">
          {children}
        </main>
        <footer className="bg-slate-900 text-slate-400 py-8 text-center text-sm">
          <p>© {new Date().getFullYear()} University of Liberal Arts Bangladesh.</p>
        </footer>
      </body>
    </html>
  );
}
