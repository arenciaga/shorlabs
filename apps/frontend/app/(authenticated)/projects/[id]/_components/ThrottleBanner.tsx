import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ThrottleBannerProps {
    onUpgradeClick: () => void
}

export function ThrottleBanner({ onUpgradeClick }: ThrottleBannerProps) {
    return (
        <div className="bg-red-50 border border-red-200 rounded-none p-5 mb-6">
            <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-none bg-red-100 flex items-center justify-center shrink-0">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                </div>
                <div className="flex-1">
                    <h3 className="font-semibold text-red-900">Project Paused</h3>
                    <p className="text-sm text-red-700 mt-1">
                        This project is paused because your organization has exceeded its Hobby plan quota.
                        Your endpoint will return errors until you upgrade or the billing period resets.
                    </p>
                    <Button
                        onClick={onUpgradeClick}
                        className="mt-3 bg-red-600 hover:bg-red-700 text-white rounded-full h-9 px-4 text-sm"
                    >
                        Upgrade to Restore
                    </Button>
                </div>
            </div>
        </div>
    )
}
