"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCalApi } from "@calcom/embed-react";
import { useEffect } from "react";

interface BookDemoButtonProps {
    className?: string;
    size?: "default" | "sm" | "lg" | "icon";
    children?: React.ReactNode;
}

const BookDemoButton = ({
    className,
    size = "default",
    children = "Schedule a Call"
}: BookDemoButtonProps) => {
    useEffect(() => {
        (async function () {
            const cal = await getCalApi({ namespace: "shorlabs-demo" });
            cal("ui", { hideEventTypeDetails: false, layout: "month_view" });
        })();
    }, []);

    return (
        <Button
            className={cn(
                "bg-black hover:bg-neutral-800 text-white border border-black font-bold",
                className
            )}
            size={size}
            data-cal-namespace="shorlabs-demo"
            data-cal-link="aryan-kashyap/shorlabs-demo"
            data-cal-config='{"layout":"month_view","useSlotsViewOnSmallScreen":"true"}'
        >
            {children}
        </Button>
    );
};

export { BookDemoButton };
