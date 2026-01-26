"use client";

import { Button } from "@/components/ui/button";
import { Menu, X, Github } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/amplitude";

export default function SectionNavigation() {
    const [open, setOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 10);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);



    return (
        <header
            className={`fixed inset-x-0 top-0 z-50 transition-all duration-200 ${scrolled
                ? "bg-white/95 backdrop-blur-sm border-b border-gray-100"
                : "bg-transparent"
                }`}
        >
            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
                <div className="flex h-14 items-center justify-between">
                    {/* Left: Navigation Links */}
                    <nav className="hidden md:flex items-center gap-6">
                        <a
                            href="#features"
                            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            Features
                        </a>
                        <a
                            href="#pricing"
                            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            Pricing
                        </a>
                    </nav>

                    {/* Center: Logo */}
                    <Link
                        href="/"
                        className="absolute left-1/2 -translate-x-1/2 flex items-center"
                    >
                        <span className="text-lg font-semibold tracking-tight text-gray-900">
                            shorlabs
                        </span>
                    </Link>

                    {/* Right: CTA */}
                    <div className="hidden md:flex items-center gap-4">
                        <a
                            href="https://github.com/aryankashyap0/shorlabs"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-500 hover:text-gray-900 transition-colors"
                            aria-label="GitHub"
                        >
                            <Github className="w-5 h-5" strokeWidth={1.5} />
                        </a>
                        <Link href="mailto:kashyaparyan093@gmail.com">
                            <Button
                                className="text-sm bg-gray-900 text-white hover:bg-gray-800 px-4 py-2 rounded-lg transition-colors"
                            >
                                Contact Us
                            </Button>
                        </Link>
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="flex items-center md:hidden">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-gray-900 hover:bg-gray-100 rounded-lg"
                            aria-label="Toggle Menu"
                            onClick={() => setOpen(!open)}
                        >
                            {!open ? (
                                <Menu className="h-5 w-5" strokeWidth={1.5} />
                            ) : (
                                <X className="h-5 w-5" strokeWidth={1.5} />
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            <div
                className={`md:hidden absolute inset-x-0 top-14 bg-white border-b border-gray-100 transition-all duration-200 ease-out overflow-hidden ${open ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"
                    }`}
            >
                <nav className="flex flex-col px-4 py-4 space-y-2">
                    <a
                        href="#features"
                        onClick={() => setOpen(false)}
                        className="text-sm text-gray-600 hover:text-gray-900 py-2 transition-colors"
                    >
                        Features
                    </a>
                    <a
                        href="#pricing"
                        onClick={() => setOpen(false)}
                        className="text-sm text-gray-600 hover:text-gray-900 py-2 transition-colors"
                    >
                        Pricing
                    </a>
                    <div className="pt-2 border-t border-gray-100">
                        <Link href="mailto:kashyaparyan093@gmail.com" className="w-full">
                            <Button className="w-full text-sm bg-gray-900 text-white hover:bg-gray-800 py-2.5 rounded-lg transition-colors">
                                Contact Us
                            </Button>
                        </Link>
                    </div>
                </nav>
            </div>
        </header>
    );
}
