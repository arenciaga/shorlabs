import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page Not Found",
  description: "The page you are looking for does not exist.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-muted-foreground mb-6">
        404
      </span>
      <h1 className="text-2xl sm:text-3xl font-mono font-bold uppercase tracking-tight text-foreground mb-4">
        Page Not Found
      </h1>
      <p className="text-xs sm:text-sm font-mono text-muted-foreground mb-8 text-center max-w-md">
        The page you are looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="text-xs sm:text-sm font-mono tracking-wider uppercase bg-foreground text-background px-6 py-2.5 hover:opacity-90 transition-opacity"
      >
        Back to Home
      </Link>
    </div>
  );
}
