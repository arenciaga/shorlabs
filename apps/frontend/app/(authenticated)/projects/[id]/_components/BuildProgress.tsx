import { Zap, Check, Loader2 } from "lucide-react"
import { BUILD_STEPS } from "./constants"

interface BuildProgressProps {
    currentStatus: string
}

export function BuildProgress({ currentStatus }: BuildProgressProps) {
    const currentStepIndex = BUILD_STEPS.indexOf(currentStatus)

    return (
        <div className="bg-zinc-50 rounded-none border border-zinc-200 p-4 sm:p-6 mb-6 sm:mb-8 overflow-hidden">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-none bg-blue-900 flex items-center justify-center shrink-0">
                        <Zap className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-zinc-900">Building your project</h3>
                        <p className="text-sm text-zinc-500">Step {currentStepIndex + 1} of {BUILD_STEPS.length}</p>
                    </div>
                </div>
            </div>

            {/* Progress Steps */}
            <div className="relative overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
                <div className="relative min-w-[400px]">
                    <div className="absolute top-4 left-0 right-0 h-0.5 bg-zinc-100" />
                    <div
                        className="absolute top-4 left-0 h-0.5 bg-zinc-900 transition-all duration-500"
                        style={{ width: `${(currentStepIndex / (BUILD_STEPS.length - 1)) * 100}%` }}
                    />
                    <div className="relative flex justify-between">
                        {BUILD_STEPS.map((step, index) => {
                            const isComplete = index < currentStepIndex
                            const isCurrent = step === currentStatus
                            return (
                                <div key={step} className="flex flex-col items-center">
                                    <div className={`
                                    w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center z-10 transition-all
                                    ${isComplete ? "bg-zinc-900 text-white" : ""}
                                    ${isCurrent ? "bg-zinc-900 text-white ring-4 ring-zinc-100" : ""}
                                    ${!isComplete && !isCurrent ? "bg-zinc-100 text-zinc-400" : ""}
                                `}>
                                        {isComplete ? (
                                            <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                        ) : isCurrent ? (
                                            <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                                        ) : (
                                            <span className="text-xs font-medium">{index + 1}</span>
                                        )}
                                    </div>
                                    <span className={`text-[10px] sm:text-xs mt-2 font-medium ${isCurrent || isComplete ? "text-zinc-900" : "text-zinc-400"}`}>
                                        {step.charAt(0) + step.slice(1).toLowerCase()}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}
