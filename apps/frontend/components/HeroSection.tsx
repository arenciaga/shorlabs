"use client";

import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { GoogleSignInButton } from "@/components/GoogleSignInButton";

const HeroSection = () => {
    const { isLoaded, isSignedIn } = useAuth();

    return (
        <section className="relative w-full bg-white overflow-hidden">
            {/* Hero Content */}
            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 lg:pt-32 pb-10 sm:pb-14 lg:pb-16">
                <div className="flex flex-col items-center sm:items-start text-center sm:text-left space-y-5 sm:space-y-6">
                    {/* View on GitHub badge */}
                    <a
                        href="https://github.com/aryankashyap0/shorlabs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-3 py-1.5 rounded-full bg-gray-50 border border-gray-100 text-xs font-medium text-gray-600 hover:text-gray-900 hover:border-gray-200 hover:bg-gray-100 transition-colors"
                    >
                        View on GitHub
                    </a>

                    {/* Headline */}
                    <h1 className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-gray-900 leading-[1.15] tracking-tight max-w-2xl">
                        The Full-Stack Deployment Platform
                    </h1>

                    {/* Subtitle */}
                    <p className="text-base sm:text-lg text-gray-500 max-w-lg leading-relaxed">
                        Deploy your frontend and backend from one place. Serverless, so you only pay when your code runs.
                    </p>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row items-center gap-3 pt-1 w-full sm:w-auto">
                        {!isLoaded ? (
                            <div className="h-10 w-full sm:w-auto sm:px-6 bg-zinc-100 rounded-full animate-pulse" style={{ minWidth: '186px' }} />
                        ) : isSignedIn ? (
                            <Link href="/projects" className="w-full sm:w-auto">
                                <Button className="group w-full sm:w-auto text-sm bg-gray-900 text-white hover:bg-gray-800 px-6 h-10 rounded-full shadow-sm transition-all duration-200">
                                    <span>Go to Projects</span>
                                    <ArrowRight className="w-4 h-4 ml-2 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.5} />
                                </Button>
                            </Link>
                        ) : (
                            <>
                                <Link href="/sign-in" className="w-full sm:w-auto">
                                    <Button className="group w-full sm:w-auto text-sm bg-gray-900 text-white hover:bg-gray-800 px-6 h-10 rounded-full shadow-sm transition-all duration-200">
                                        <span>Get started</span>
                                        <ArrowRight className="w-4 h-4 ml-2 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.5} />
                                    </Button>
                                </Link>
                                <GoogleSignInButton
                                    source="hero"
                                    text="Continue With Google"
                                    className="w-full sm:w-auto"
                                />
                            </>
                        )}
                    </div>

                    {/* Frameworks supported */}
                    <div className="flex flex-col sm:flex-row items-center sm:items-center gap-3 sm:gap-4 pt-6 sm:pt-8 w-full sm:w-auto">
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Frameworks supported
                        </span>
                        <div className="flex items-center gap-4 sm:gap-5">
                            {[
                                { name: "Next.js", icon: "https://cdn.simpleicons.org/nextdotjs/000000" },
                                { name: "React", icon: "https://cdn.simpleicons.org/react/61DAFB" },
                                { name: "FastAPI", icon: "https://cdn.simpleicons.org/fastapi/009688" },
                                { name: "Express", icon: "https://cdn.simpleicons.org/express/000000" },
                                { name: "Flask", icon: "https://cdn.simpleicons.org/flask/000000" },
                                { name: "Django", icon: "https://cdn.simpleicons.org/django/092E20" },
                            ].map(({ name, icon }) => (
                                <img
                                    key={name}
                                    src={icon}
                                    alt={name}
                                    title={name}
                                    className="h-6 w-6 sm:h-7 sm:w-7 opacity-90 hover:opacity-100 transition-opacity"
                                    width={28}
                                    height={28}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Product Preview */}
            <div className="relative w-full">
                {/* Gradient Background */}
                <div className="absolute inset-0 bg-gradient-to-b from-white via-gray-50/80 to-gray-100/50" />

                {/* Video Container */}
                <div className="relative w-full max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-8 pb-12 sm:pb-16 lg:pb-24">
                    <div className="relative rounded-lg sm:rounded-xl lg:rounded-2xl overflow-hidden shadow-xl sm:shadow-2xl shadow-gray-200/60 border border-gray-200/80 transition-shadow duration-300 hover:shadow-2xl hover:shadow-gray-300/50">
                        <video
                            src="/Shorlabs-Demo.mp4"
                            autoPlay
                            muted
                            loop
                            playsInline
                            preload="metadata"
                            className="w-full h-auto"
                            width={1920}
                            height={1080}
                        >
                            Your browser does not support the video tag.
                        </video>
                    </div>
                </div>
            </div>
        </section>
    );
};

export { HeroSection };
