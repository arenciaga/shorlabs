import { SignUp } from "@clerk/nextjs";

export default function CreateAccountPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-black">
            <div className="w-full max-w-md">
                <SignUp
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
                    path="/create-account"
                    signInUrl="/sign-in"
                    afterSignUpUrl="/projects"
                />
            </div>
        </div>
    );
}
