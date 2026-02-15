'use client';

import { useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import {
    setAmplitudeUserId,
    setAmplitudeUserProperties,
    resetAmplitudeUser,
    setAmplitudeOptOut,
} from '@/lib/amplitude';

interface AmplitudeProviderProps {
    children: React.ReactNode;
}

/**
 * AmplitudeProvider - Syncs Clerk user with Amplitude (per Next.js installation guide).
 * SDK is initialized at module load in @/lib/amplitude so events are captured from first load.
 */
export function AmplitudeProvider({ children }: AmplitudeProviderProps) {
    const { isLoaded, isSignedIn, user } = useUser();
    const previousUserId = useRef<string | null>(null);

    // Handle user identification and de-identification (init is done in lib/amplitude at module load)
    useEffect(() => {
        if (!isLoaded) return;

        if (isSignedIn && user) {
            const userId = user.id;

            // BLOCKLIST: Don't track these user IDs (developers/test accounts)
            const BLOCKED_USER_IDS = [
                'user_38nfbFavjwbdg73ZL769Atirc7B', // Your dev account
            ];

            if (BLOCKED_USER_IDS.includes(userId)) {
                console.log('[AmplitudeProvider] User is in blocklist, skipping tracking');
                // Opt out this user completely
                setAmplitudeOptOut(true);
                previousUserId.current = userId;
                return;
            }

            // Only update if user has changed
            if (previousUserId.current !== userId) {
                // Re-enable tracking in case it was disabled
                setAmplitudeOptOut(false);

                // Set user ID
                setAmplitudeUserId(userId);

                // Set user properties for segmentation
                setAmplitudeUserProperties({
                    // Basic info
                    email: user.primaryEmailAddress?.emailAddress,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    fullName: user.fullName,
                    username: user.username,

                    // Account metadata
                    createdAt: user.createdAt?.toISOString(),
                    lastSignInAt: user.lastSignInAt?.toISOString(),

                    // Profile info (if available)
                    imageUrl: user.imageUrl,
                    hasImage: user.hasImage,

                    // External accounts (e.g., GitHub)
                    externalAccounts: user.externalAccounts?.map((acc) => ({
                        provider: acc.provider,
                        username: acc.username,
                    })),
                });

                previousUserId.current = userId;
            }
        } else if (!isSignedIn && previousUserId.current !== null) {
            // User logged out - reset identity
            resetAmplitudeUser();
            previousUserId.current = null;
        }
    }, [isLoaded, isSignedIn, user]);

    return <>{children}</>;
}

export default AmplitudeProvider;
