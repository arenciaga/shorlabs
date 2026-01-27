"use client";

import { useSignIn } from "@clerk/nextjs";
import { trackEvent } from "@/lib/amplitude";

interface GoogleSignInButtonProps {
    className?: string;
    text?: string;
    source?: string;
}

// Google "G" logo SVG
const GoogleLogo = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
            fill="#4285F4"
        />
        <path
            d="M9.003 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.26c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9.003 18z"
            fill="#34A853"
        />
        <path
            d="M3.964 10.712A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.33z"
            fill="#FBBC05"
        />
        <path
            d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.428 0 9.002 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29c.708-2.127 2.692-3.71 5.036-3.71z"
            fill="#EA4335"
        />
    </svg>
);

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
        <button
            onClick={handleGoogleSignIn}
            disabled={!isLoaded}
            className={`
                inline-flex items-center justify-center gap-3
                h-10 px-6
                bg-white text-zinc-700 font-medium text-sm
                border border-zinc-300
                rounded-full
                shadow-sm
                hover:bg-zinc-50 hover:shadow
                active:bg-zinc-100
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-150
                cursor-pointer
                ${className}
            `}
        >
            <GoogleLogo />
            <span>{text}</span>
        </button>
    );
};
