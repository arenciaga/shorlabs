import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-white">
            <div className="w-full max-w-md">
                <SignIn
                    appearance={{
                        elements: {
                            formButtonPrimary: "bg-gray-900 text-white hover:bg-gray-800",
                            card: "bg-white border border-gray-200 shadow-lg",
                            headerTitle: "text-gray-900",
                            headerSubtitle: "text-gray-500",
                            socialButtonsBlockButton: "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50",
                            formFieldLabel: "text-gray-700",
                            formFieldInput: "bg-white border-gray-200 text-gray-900",
                            footerActionLink: "text-gray-900 hover:text-gray-700",
                            identityPreviewText: "text-gray-900",
                            identityPreviewEditButton: "text-gray-600",
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
