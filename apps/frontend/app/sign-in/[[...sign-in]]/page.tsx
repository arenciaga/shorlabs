import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-black">
            <div className="w-full max-w-md">
                <SignIn
                    appearance={{
                        elements: {
                            formButtonPrimary: "bg-white text-black hover:bg-gray-100",
                            card: "bg-zinc-900 border border-zinc-800",
                            headerTitle: "text-white",
                            headerSubtitle: "text-zinc-400",
                            socialButtonsBlockButton: "bg-zinc-800 border border-zinc-700 text-white hover:bg-zinc-700",
                            formFieldLabel: "text-white",
                            formFieldInput: "bg-zinc-800 border-zinc-700 text-white",
                            footerActionLink: "text-white hover:text-zinc-300",
                            identityPreviewText: "text-white",
                            identityPreviewEditButton: "text-white",
                        },
                    }}
                    routing="path"
                    path="/sign-in"
                    signUpUrl="/create-account"
                    afterSignInUrl="/projects"
                />
            </div>
        </div>
    );
}
