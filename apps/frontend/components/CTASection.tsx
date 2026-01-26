"use client";

import { useSignIn, SignedIn, SignedOut } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { trackEvent } from "@/lib/amplitude";

const CTASection = () => {
    const { signIn, isLoaded } = useSignIn();

    const handleGitHubSignIn = async () => {
        if (!isLoaded || !signIn) return;

        trackEvent("GitHub Auth Started", {
            source: "cta_section",
        });

        await signIn.authenticateWithRedirect({
            strategy: "oauth_github",
            redirectUrl: "/sso-callback",
            redirectUrlComplete: "/projects",
        });
    };

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
                        <Button
                            onClick={handleGitHubSignIn}
                            disabled={!isLoaded}
                            className="text-sm bg-gray-900 text-white hover:bg-gray-800 px-5 py-2.5 rounded-lg transition-colors"
                        >
                            Get Started
                        </Button>
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
            </div>
        </section>
    );
};

export { CTASection };
