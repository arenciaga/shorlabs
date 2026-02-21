"use client"

export function ScramblePrice({ target, prefix = "$" }: { target: string; prefix?: string }) {
    return (
        <span className="font-mono font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
            {prefix}
            {target}
        </span>
    )
}
