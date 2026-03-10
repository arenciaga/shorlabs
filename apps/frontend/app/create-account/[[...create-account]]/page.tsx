import { SignUp } from "@clerk/nextjs";

export default function CreateAccountPage() {
    return (
        <div className="brutalist-app min-h-dvh overflow-y-auto bg-white px-3 py-6 sm:px-6 sm:py-10 lg:px-8 lg:py-14">
            <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full items-center justify-center sm:min-h-[calc(100dvh-5rem)] lg:min-h-[calc(100dvh-7rem)]">
                <div className="w-full max-w-[440px] sm:max-w-[480px]">
                <SignUp
                    routing="path"
                    path="/create-account"
                    signInUrl="/sign-in"
                    afterSignUpUrl="/projects"
                />
            </div>
            </div>
        </div>
    );
}
