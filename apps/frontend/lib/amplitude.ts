'use client';

import * as amplitude from '@amplitude/analytics-browser';
import { sessionReplayPlugin } from '@amplitude/plugin-session-replay-browser';

// Types for Amplitude configuration
export interface AmplitudeConfig {
    apiKey: string;
    userId?: string;
    options?: amplitude.Types.BrowserOptions;
    sessionReplayOptions?: {
        sampleRate?: number;
        privacyConfig?: {
            blockSelector?: string[];
            maskSelector?: string[];
            unmaskSelector?: string[];
            defaultMaskLevel?: 'light' | 'medium' | 'conservative';
        };
    };
}

// BLOCKLIST: User IDs to never track (developers/test accounts)
const BLOCKED_USER_IDS = [
    'user_36du5zsH7hJSnz3kcMP5gKUcYBn',
    'user_38SRkeyxKR9WZYOgmZo10kou14O',
];

// Singleton to track initialization
let isInitialized = false;

// Queue events that fire before init so they are not lost
type QueuedEvent = { name: string; properties?: Record<string, unknown> };
const eventQueue: QueuedEvent[] = [];
const MAX_QUEUE_SIZE = 50;

/**
 * Initialize Amplitude Analytics with Session Replay
 * Should only be called once on the client side
 */
export function initAmplitude(config: AmplitudeConfig): void {
    if (typeof window === 'undefined') {
        // Don't run on server
        return;
    }

    if (isInitialized) {
        console.warn('[Amplitude] Already initialized, skipping...');
        return;
    }

    const { apiKey, userId, options, sessionReplayOptions } = config;

    if (!apiKey) {
        console.error('[Amplitude] API key is required');
        return;
    }

    try {
        // Initialize Amplitude FIRST
        amplitude.init(apiKey, userId, {
            // Autocapture settings for comprehensive analytics
            autocapture: {
                sessions: true,          // Track session start/end
                pageViews: true,         // Track page views
                formInteractions: true,  // Track form interactions
                fileDownloads: true,     // Track file downloads
                elementInteractions: true, // Track element clicks
            },
            // Performance and behavior settings
            flushIntervalMillis: 1000,   // Flush events every second
            flushQueueSize: 30,          // Flush when queue reaches 30 events
            minIdLength: 1,              // Minimum user/device ID length
            // Cookie settings for cross-session tracking
            cookieOptions: {
                expiration: 365,           // 1 year cookie expiration
                sameSite: 'Lax',
            },
            // Enable fetching remote config
            fetchRemoteConfig: true,
            ...options,
        });

        // THEN add Session Replay Plugin (so it uses the same device ID)
        const sessionReplay = sessionReplayPlugin({
            sampleRate: sessionReplayOptions?.sampleRate ?? 1.0, // Default to 100% capture
            privacyConfig: sessionReplayOptions?.privacyConfig ?? {
                defaultMaskLevel: 'medium',
                // Mask sensitive elements by default
                maskSelector: ['.amp-mask', '[data-amp-mask]'],
                unmaskSelector: ['.amp-unmask', '[data-amp-unmask]'],
                blockSelector: ['.amp-block', '[data-amp-block]'],
            },
        });

        amplitude.add(sessionReplay);

        isInitialized = true;

        // Replay events that were queued before init
        while (eventQueue.length > 0) {
            const queued = eventQueue.shift();
            if (queued) amplitude.track(queued.name, queued.properties);
        }

        // Flush on page unload so we don't lose events when user leaves
        if (typeof window !== 'undefined') {
            const flushOnUnload = () => amplitude.flush();
            window.addEventListener('pagehide', flushOnUnload);
            window.addEventListener('beforeunload', flushOnUnload);
        }

        console.log('[Amplitude] Initialized successfully');
    } catch (error) {
        console.error('[Amplitude] Initialization failed:', error);
    }
}

/**
 * Set the user ID after authentication
 */
export function setAmplitudeUserId(userId: string | undefined): void {
    if (typeof window === 'undefined' || !isInitialized) return;

    if (userId) {
        // Check if user is blocked
        if (BLOCKED_USER_IDS.includes(userId)) {
            console.log(`[Amplitude] User ${userId} is blocked from tracking`);
            amplitude.setOptOut(true);
            return;
        }

        amplitude.setUserId(userId);
        console.log('[Amplitude] User ID set:', userId);
    }
}

/**
 * Set user properties for segmentation and analysis
 */
export function setAmplitudeUserProperties(properties: Record<string, unknown>): void {
    if (typeof window === 'undefined' || !isInitialized) return;

    const identify = new amplitude.Identify();
    Object.entries(properties).forEach(([key, value]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        identify.set(key, value as any);
    });
    amplitude.identify(identify);
}

/**
 * Track a custom event.
 * If Amplitude is not yet initialized, the event is queued and sent after init.
 */
export function trackEvent(
    eventName: string,
    eventProperties?: Record<string, unknown>
): void {
    if (typeof window === 'undefined') return;

    // Queue event if not initialized yet (replayed after init)
    if (!isInitialized) {
        if (eventQueue.length < MAX_QUEUE_SIZE) {
            eventQueue.push({ name: eventName, properties: eventProperties });
        }
        if (process.env.NODE_ENV === 'development') {
            console.debug(`[Amplitude] Queued event (pre-init): ${eventName}`);
        }
        return;
    }

    // Check if current user is blocked
    const currentUserId = amplitude.getUserId();
    if (currentUserId && BLOCKED_USER_IDS.includes(currentUserId)) {
        console.log(`[Amplitude] Blocked tracking event "${eventName}" for user ${currentUserId}`);
        return;
    }

    amplitude.track(eventName, eventProperties);
}

/**
 * Track revenue events
 */
export function trackRevenue(
    productId: string,
    price: number,
    quantity: number = 1,
    revenueType?: string
): void {
    if (typeof window === 'undefined' || !isInitialized) return;

    const revenue = new amplitude.Revenue()
        .setProductId(productId)
        .setPrice(price)
        .setQuantity(quantity);

    if (revenueType) {
        revenue.setRevenueType(revenueType);
    }

    amplitude.revenue(revenue);
}

/**
 * Reset user identity on logout
 */
export function resetAmplitudeUser(): void {
    if (typeof window === 'undefined' || !isInitialized) return;

    amplitude.reset();
    console.log('[Amplitude] User identity reset');
}

/**
 * Opt user out of tracking (for privacy compliance)
 */
export function setAmplitudeOptOut(optOut: boolean): void {
    if (typeof window === 'undefined' || !isInitialized) return;

    amplitude.setOptOut(optOut);
}

/**
 * Flush events immediately (useful before page unload)
 */
export function flushAmplitudeEvents(): void {
    if (typeof window === 'undefined' || !isInitialized) return;

    amplitude.flush();
}

/**
 * Get the current session ID
 */
export function getAmplitudeSessionId(): number | undefined {
    if (typeof window === 'undefined' || !isInitialized) return undefined;

    return amplitude.getSessionId();
}

/**
 * Get the current device ID
 */
export function getAmplitudeDeviceId(): string | undefined {
    if (typeof window === 'undefined' || !isInitialized) return undefined;

    return amplitude.getDeviceId();
}

// Export amplitude instance for advanced usage
export { amplitude };

/**
 * Default session replay config (used when initializing at module load).
 * Matches Amplitude Next.js guide: init when module loads so events aren't lost.
 */
function getDefaultSessionReplayOptions(): AmplitudeConfig['sessionReplayOptions'] {
    return {
        sampleRate: 1.0, // Capture 100% of sessions
        privacyConfig: {
            defaultMaskLevel: 'medium',
            blockSelector: ['.amp-block', '[data-amp-block]', '[data-sensitive]'],
            maskSelector: [
                '.amp-mask',
                '[data-amp-mask]',
                'input[type="password"]',
                'input[type="email"]',
                '[data-private]',
            ],
            unmaskSelector: ['.amp-unmask', '[data-amp-unmask]'],
        },
    };
}

// Official Next.js pattern: initialize when module loads on client so SDK is ready
// before any component effects run. See https://amplitude.com/docs/sdks/frameworks/nextjs-installation-guide
if (typeof window !== 'undefined') {
    const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
    if (apiKey) {
        initAmplitude({
            apiKey,
            sessionReplayOptions: getDefaultSessionReplayOptions(),
        });
    }
}

/** Placeholder component to ensure amplitude module is loaded from root layout (official Next.js pattern). */
export const Amplitude = () => null;
