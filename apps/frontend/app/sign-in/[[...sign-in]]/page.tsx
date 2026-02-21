import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
    return (
        <div className="brutalist-app min-h-dvh overflow-y-auto bg-white px-3 py-6 sm:px-6 sm:py-10 lg:px-8 lg:py-14">
            <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full items-center justify-center sm:min-h-[calc(100dvh-5rem)] lg:min-h-[calc(100dvh-7rem)]">
                <div className="w-full max-w-[440px] sm:max-w-[480px]">
                <SignIn
                    appearance={{
                        elements: {
                            rootBox: "w-full",
                            card: "w-full bg-white border-2 border-zinc-900 shadow-none rounded-none p-4 sm:p-6 lg:p-7",
                            formButtonPrimary: "w-full bg-zinc-900 text-white hover:bg-zinc-800 rounded-none h-10 sm:h-11 lg:h-12 text-sm sm:text-base font-mono tracking-wider uppercase",
                            headerTitle: "text-zinc-900 text-lg sm:text-2xl lg:text-[1.65rem] font-semibold font-mono uppercase tracking-wider",
                            headerSubtitle: "text-zinc-500 text-sm sm:text-base font-mono",
                            socialButtonsBlockButton: "w-full bg-white border-2 border-zinc-900 text-zinc-700 hover:bg-zinc-50 rounded-none h-10 sm:h-11 lg:h-12 text-sm sm:text-base font-mono",
                            socialButtonsBlockButtonText: "text-sm sm:text-base",
                            formFieldLabel: "text-zinc-700 text-[11px] sm:text-xs font-mono uppercase tracking-wider",
                            formFieldInput: "w-full bg-white border-2 border-zinc-900 text-zinc-900 rounded-none h-10 sm:h-11 lg:h-12 text-sm sm:text-base",
                            footer: "pt-2",
                            footerActionLink: "text-zinc-900 hover:text-zinc-700 text-sm font-mono",
                            footerActionText: "text-zinc-500 text-sm font-mono",
                            identityPreviewText: "text-zinc-900 text-sm font-mono",
                            identityPreviewEditButton: "text-zinc-600 text-sm font-mono",
                            dividerLine: "bg-zinc-900",
                            dividerText: "text-zinc-500 text-xs sm:text-sm font-mono uppercase tracking-wider",
                        },
                    }}
                    routing="path"
                    path="/sign-in"
                    signUpUrl="/create-account"
                    afterSignInUrl="/projects"
                />
            </div>
            </div>
        </div>
    );
}
