"use client";

import Image from "next/image";
import { useSignIn, SignedIn, SignedOut } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { trackEvent } from "@/lib/amplitude";

import { GoogleSignInButton } from "@/components/GoogleSignInButton";

const HeroSection = () => {
    return (
        <section className="relative w-full bg-white overflow-hidden">
            {/* Hero Content */}
            <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 pt-28 sm:pt-32 pb-12 sm:pb-16">
                <div className="flex flex-col items-start space-y-6">
                    {/* Beta Badge */}
                    <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 border border-blue-100">
                        <span className="text-xs font-medium text-blue-700">
                            100% Open Source
                        </span>
                    </div>

                    {/* Headline */}
                    <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold text-gray-900 leading-[1.1] tracking-tight">
                        Deploy backends
                        <br />
                        <span className="text-gray-400">without the hassle.</span>
                    </h1>

                    {/* Subtitle */}
                    <p className="text-lg text-gray-500 max-w-xl leading-relaxed">
                        A modern platform for deploying, managing, and scaling your Python
                        and Node.js backends. Connect GitHub, configure, and go live.
                    </p>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-2">
                        <SignedOut>
                            <GoogleSignInButton source="hero_section" />
                        </SignedOut>
                        <SignedIn>
                            <Link href="/projects">
                                <Button className="text-sm bg-gray-900 text-white hover:bg-gray-800 px-5 py-2.5 rounded-lg transition-colors">
                                    Go to Projects
                                </Button>
                            </Link>
                        </SignedIn>

                        <Link href="https://github.com/aryankashyap0/shorlabs" target="_blank">
                            <Button
                                variant="outline"
                                className="group text-sm text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50 px-5 py-2.5 rounded-lg transition-colors"
                            >
                                View on GitHub
                                <ArrowRight className="w-4 h-4 ml-1.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                            </Button>
                        </Link>
                    </div>

                    {/* Small Text */}
                    <p className="text-sm text-gray-400">
                        Free tier available • No credit card required
                    </p>
                </div>
            </div>

            {/* Product Preview */}
            <div className="relative w-full">
                {/* Gradient Background */}
                <div className="absolute inset-0 bg-gradient-to-b from-white via-rose-50/50 to-rose-100/70" />

                {/* Screenshot Container */}
                <div className="relative w-full max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-16 sm:pb-24">
                    <div className="relative rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl shadow-gray-200/50 border border-gray-200/60">
                        <Image
                            src="/images/f.png"
                            alt="Shorlabs Dashboard"
                            width={1920}
                            height={1080}
                            className="w-full h-auto"
                            priority
                        />
                    </div>

                </div>
            </div>
        </section>
    );
};

export { HeroSection };
