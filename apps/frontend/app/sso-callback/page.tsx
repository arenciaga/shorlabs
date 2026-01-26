"use client";

import { AuthenticateWithRedirectCallback, useUser } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/amplitude";

export default function SSOCallback() {
    const { user, isLoaded } = useUser();
    const hasTracked = useRef(false);

    useEffect(() => {
        if (isLoaded && user && !hasTracked.current) {
            // Check if user was created recently (within last 10 seconds) = signup
            const isNewUser = user.createdAt &&
                (Date.now() - user.createdAt.getTime()) < 10000;

            trackEvent('Google Auth Completed', {
                auth_method: 'google',
                is_new_user: isNewUser,
                user_tier: 'free'
            });

            hasTracked.current = true;
        }
    }, [isLoaded, user]);

    return (
        <AuthenticateWithRedirectCallback
            afterSignInUrl="/projects"
            afterSignUpUrl="/projects"
        />
    );
}
