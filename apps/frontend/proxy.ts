import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

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
    '/feed.xml'
])

export default clerkMiddleware(async (auth, req) => {
    // Redirect non-www to www in production
    // This is critical for GitHub App callbacks: GitHub redirects to shorlabs.com/new
    // but Clerk session cookies are on www.shorlabs.com
    const host = req.headers.get('host') || ''
    if (host === 'shorlabs.com') {
        const url = new URL(req.url)
        url.host = 'www.shorlabs.com'
        return NextResponse.redirect(url, 301)
    }

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
