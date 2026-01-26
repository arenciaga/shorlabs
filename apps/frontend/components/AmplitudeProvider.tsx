'use client';

import { useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import {
    initAmplitude,
    setAmplitudeUserId,
    setAmplitudeUserProperties,
    resetAmplitudeUser,
    setAmplitudeOptOut,
} from '@/lib/amplitude';

interface AmplitudeProviderProps {
    children: React.ReactNode;
}

/**
 * AmplitudeProvider - Initializes Amplitude Analytics with Session Replay
 * 
 * This provider should wrap your app at a high level (inside ClerkProvider).
 * It handles:
 * - SDK initialization on mount
 * - User identification when authenticated
 * - User reset when logged out
 * - Syncing Clerk user data with Amplitude
 */
export function AmplitudeProvider({ children }: AmplitudeProviderProps) {
    const { isLoaded, isSignedIn, user } = useUser();
    const hasInitialized = useRef(false);
    const previousUserId = useRef<string | null>(null);

    // Initialize Amplitude on mount (client-side only)
    useEffect(() => {
        if (hasInitialized.current) return;

        const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;

        if (!apiKey) {
            console.warn(
                '[AmplitudeProvider] NEXT_PUBLIC_AMPLITUDE_API_KEY is not set. ' +
                'Analytics will not be tracked.'
            );
            return;
        }

        initAmplitude({
            apiKey,
            sessionReplayOptions: {
                // Capture 100% of sessions in development, adjust for production
                sampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 1.0,
                privacyConfig: {
                    defaultMaskLevel: 'medium',
                    // Block sensitive elements from recording
                    blockSelector: [
                        '.amp-block',
                        '[data-amp-block]',
                        '[data-sensitive]',
                    ],
                    // Mask text content for privacy
                    maskSelector: [
                        '.amp-mask',
                        '[data-amp-mask]',
                        'input[type="password"]',
                        'input[type="email"]',
                        '[data-private]',
                    ],
                    // Explicitly unmask certain elements
                    unmaskSelector: [
                        '.amp-unmask',
                        '[data-amp-unmask]',
                    ],
                },
            },
        });

        hasInitialized.current = true;
    }, []);

    // Handle user identification and de-identification
    useEffect(() => {
        if (!isLoaded || !hasInitialized.current) return;

        if (isSignedIn && user) {
            const userId = user.id;

            // BLOCKLIST: Don't track these user IDs (developers/test accounts)
            const BLOCKED_USER_IDS = [
                'user_38nWJoyCxzEptU1hhowxNskhxAj', // Your dev account
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
