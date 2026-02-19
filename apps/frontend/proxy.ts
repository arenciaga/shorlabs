import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
    '/sign-in(.*)',
    '/create-account(.*)',
    '/sso-callback(.*)',
    '/privacy-policy(.*)',
    '/terms-of-service(.*)',
    '/blog(.*)',
    '/',
    '/sitemap.xml',
    '/robots.txt',
    '/feed.xml',
    '/new(.*)', // GitHub App installation callback lands here with ?installation_id=...
])

export default clerkMiddleware(async (auth, req) => {
    if (!isPublicRoute(req)) {
        await auth.protect()
    }
})

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|robots\\.txt|sitemap\\.xml|feed\\.xml|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|mp3|wav|ogg|webm|mov)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
}
