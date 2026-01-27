"use client";

import { SignedIn, SignedOut } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import Link from "next/link";

import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { GitHubButton } from "@/components/GitHubButton";
import { BookDemoButton } from "@/components/BookDemoButton";

const CTASection = () => {
    return (
        <section className="relative w-full bg-white overflow-hidden py-24 sm:py-32">
            <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 text-center">
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-gray-900 tracking-tight">
                    Ready to deploy your backend?
                </h2>
                <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
                    Join developers building with Shorlabs today. Connect your GitHub and go live in minutes.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                    <SignedOut>
                        <GoogleSignInButton source="cta_section" />
                    </SignedOut>
                    <SignedIn>
                        <Link href="/projects">
                            <Button className="text-sm bg-gray-900 text-white hover:bg-gray-800 px-5 py-2.5 rounded-lg transition-colors">
                                Go to Projects
                            </Button>
                        </Link>
                    </SignedIn>

                    <GitHubButton />

                    <BookDemoButton>Schedule a Call</BookDemoButton>
                </div>
            </div>
        </section>
    );
};

export { CTASection };
