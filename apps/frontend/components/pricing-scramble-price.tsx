"use client"

import { useEffect, useState } from "react"

export function ScramblePrice({ target, prefix = "$" }: { target: string; prefix?: string }) {
    const [display, setDisplay] = useState(target.replace(/[0-9]/g, "0"))

    useEffect(() => {
        let iterations = 0
        const maxIterations = 18
        const interval = setInterval(() => {
            if (iterations >= maxIterations) {
                setDisplay(target)
                clearInterval(interval)
                return
            }

            setDisplay(
                target
                    .split("")
                    .map((char, i) => {
                        if (!/[0-9]/.test(char)) return char
                        if (iterations > maxIterations - 5 && i < iterations - (maxIterations - 5)) return char
                        return String(Math.floor(Math.random() * 10))
                    })
                    .join("")
            )
            iterations++
        }, 50)

        return () => clearInterval(interval)
    }, [target])

    return (
        <span className="font-mono font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
            {prefix}
            {display}
        </span>
    )
}
