"use client";

import { useSignIn } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/amplitude";

interface GoogleSignInButtonProps {
    className?: string;
    text?: string;
    source?: string;
}

export const GoogleSignInButton = ({
    className = "",
    text = "Continue with Google",
    source = "unknown",
}: GoogleSignInButtonProps) => {
    const { signIn, isLoaded } = useSignIn();

    const handleGoogleSignIn = async () => {
        if (!isLoaded || !signIn) return;

        trackEvent("Google Auth Started", {
            source,
        });

        await signIn.authenticateWithRedirect({
            strategy: "oauth_google",
            redirectUrl: "/sso-callback",
            redirectUrlComplete: "/projects",
        });
    };

    return (
        <Button
            onClick={handleGoogleSignIn}
            disabled={!isLoaded}
            className={`text-sm bg-gray-900 text-white hover:bg-gray-800 px-5 py-2.5 rounded-lg transition-colors ${className}`}
        >
            {text}
        </Button>
    );
};
