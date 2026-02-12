"use client";

import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { GoogleSignInButton } from "@/components/GoogleSignInButton";

const CTASection = () => {
    const { isLoaded, isSignedIn } = useAuth();

    return (
        <section className="relative w-full bg-white">
            {/* Top border line */}
            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
                <div className="border-t border-gray-100" />
            </div>

            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
                <div className="flex flex-col items-center text-center">
                    {/* Small label */}
                    <span className="text-xs font-medium tracking-wider text-gray-400 uppercase mb-6">
                        Get Started
                    </span>

                    {/* Main headline */}
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-gray-900 tracking-tight max-w-xl">
                        Start deploying in minutes.
                    </h2>

                    {/* Subtitle */}
                    <p className="mt-4 text-gray-500 max-w-md leading-relaxed">
                        Connect your repository and go live. No infrastructure to manage, no complexity to handle.
                    </p>

                    {/* CTA Buttons */}
                    <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                        {!isLoaded ? (
                            <div className="h-10 w-full sm:w-auto bg-zinc-100 rounded-full animate-pulse" style={{ minWidth: '186px' }} />
                        ) : isSignedIn ? (
                            <Link href="/projects" className="w-full sm:w-auto">
                                <Button className="group w-full sm:w-auto text-sm bg-gray-900 text-white hover:bg-gray-800 px-6 h-10 rounded-full shadow-sm transition-all duration-200">
                                    <span>Go to Projects</span>
                                    <ArrowRight className="w-4 h-4 ml-2 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.5} />
                                </Button>
                            </Link>
                        ) : (
                            <>
                                <Link href="/sign-in" className="w-full sm:w-auto">
                                    <Button className="group w-full sm:w-auto text-sm bg-gray-900 text-white hover:bg-gray-800 px-6 h-10 rounded-full shadow-sm transition-all duration-200">
                                        <span>Get started</span>
                                        <ArrowRight className="w-4 h-4 ml-2 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.5} />
                                    </Button>
                                </Link>
                                <GoogleSignInButton
                                    source="cta_section"
                                    text="Continue With Google"
                                    className="w-full sm:w-auto"
                                />
                            </>
                        )}
                    </div>

                    {/* Trust signal */}
                    <p className="mt-8 text-xs text-gray-400">
                        Free tier included • No credit card required
                    </p>
                </div>
            </div>
        </section>
    );
};

export { CTASection };
