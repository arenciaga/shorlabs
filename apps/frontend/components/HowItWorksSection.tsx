"use client";

import { useState } from "react";

const steps = [
    {
        number: "01",
        title: "Connect",
        description: "Link your GitHub account and select a repository.",
        video: "/1.mp4",
    },
    {
        number: "02",
        title: "Configure",
        description: "Set project name, directory, and start command.",
        video: "/2.mp4",
    },
    {
        number: "03",
        title: "Customize",
        description: "Choose memory, timeout, and add environment variables.",
        video: "/3.mp4",
    },
    {
        number: "04",
        title: "Deploy",
        description: "One click. Your backend is live.",
        video: "/4.mp4",
    },
];

const HowItWorksSection = () => {
    const [activeStep, setActiveStep] = useState(0);

    return (
        <section className="relative w-full bg-gray-50">
            {/* Section Header */}
            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-10 sm:pb-14">
                <div className="text-center sm:text-left max-w-xl mx-auto sm:mx-0">
                    <span className="text-xs font-medium tracking-wider text-gray-400 uppercase">
                        How it works
                    </span>
                    <h2 className="mt-3 text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                        Deploy in four steps
                    </h2>
                    <p className="mt-3 text-gray-500 leading-relaxed">
                        From repository to production URL. No DevOps required.
                    </p>
                </div>
            </div>

            {/* Main Content */}
            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
                {/* Mobile & Tablet: Steps above video */}
                {/* Desktop: Steps on left, video on right */}
                <div className="flex flex-col lg:flex-row lg:gap-12">

                    {/* Steps Navigation */}
                    <div className="lg:w-1/3 mb-6 lg:mb-0">
                        {/* Mobile: Horizontal scroll | Tablet: 2x2 grid | Desktop: Vertical list */}
                        <div className="
                            flex gap-2
                            overflow-x-auto pb-2
                            sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0 sm:gap-3
                            lg:flex lg:flex-col lg:gap-0
                            -mx-4 px-4 sm:mx-0 sm:px-0
                        ">
                            {steps.map((step, index) => (
                                <button
                                    key={step.number}
                                    onClick={() => setActiveStep(index)}
                                    className={`
                                        group relative flex items-center gap-3 
                                        px-4 py-3 sm:px-3 sm:py-3 lg:px-4 lg:py-5
                                        rounded-xl lg:rounded-none
                                        transition-all duration-200 text-left 
                                        flex-shrink-0 sm:flex-shrink
                                        min-w-[120px] sm:min-w-0
                                        ${activeStep === index
                                            ? "bg-white shadow-sm sm:shadow-sm lg:shadow-none lg:bg-transparent"
                                            : "bg-white/50 sm:bg-white/60 lg:bg-transparent hover:bg-white sm:hover:bg-white lg:hover:bg-transparent"
                                        }
                                        ${index !== steps.length - 1 ? "lg:border-b lg:border-gray-200" : ""}
                                    `}
                                >
                                    {/* Step Number */}
                                    <span
                                        className={`
                                            flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full
                                            text-xs font-medium transition-all duration-200
                                            ${activeStep === index
                                                ? "bg-gray-900 text-white"
                                                : "bg-gray-200 text-gray-500 group-hover:bg-gray-300"
                                            }
                                        `}
                                    >
                                        {step.number}
                                    </span>

                                    {/* Step Info */}
                                    <div className="flex-1 min-w-0">
                                        <span
                                            className={`
                                                block text-sm font-medium transition-colors duration-200
                                                ${activeStep === index ? "text-gray-900" : "text-gray-600"}
                                            `}
                                        >
                                            {step.title}
                                        </span>
                                        {/* Description - Desktop only */}
                                        <span className="hidden lg:block text-xs text-gray-400 mt-0.5 leading-relaxed">
                                            {step.description}
                                        </span>
                                    </div>

                                    {/* Active Indicator - Desktop only */}
                                    <div
                                        className={`
                                            hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full
                                            transition-all duration-200
                                            ${activeStep === index ? "bg-gray-900" : "bg-transparent"}
                                        `}
                                    />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Video Display */}
                    <div className="lg:w-2/3">
                        <div className="relative rounded-xl sm:rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-sm">
                            <video
                                key={steps[activeStep].video}
                                src={steps[activeStep].video}
                                autoPlay
                                muted
                                loop
                                playsInline
                                className="w-full h-auto"
                            >
                                Your browser does not support the video tag.
                            </video>
                        </div>

                        {/* Description - Mobile & Tablet only */}
                        <p className="lg:hidden text-center text-sm text-gray-500 mt-4 px-4">
                            {steps[activeStep].description}
                        </p>

                        {/* Progress Indicators */}
                        <div className="flex items-center gap-1.5 mt-5 sm:mt-6 justify-center lg:justify-start">
                            {steps.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() => setActiveStep(index)}
                                    className={`
                                        h-1 rounded-full transition-all duration-300
                                        ${activeStep === index
                                            ? "w-6 sm:w-8 bg-gray-900"
                                            : "w-1.5 bg-gray-300 hover:bg-gray-400"
                                        }
                                    `}
                                    aria-label={`Go to step ${index + 1}`}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export { HowItWorksSection };
