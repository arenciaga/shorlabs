"use client"

import { useEffect, useState } from "react"

const LEFT_LABELS = ["Connect", "Configure", "Deploy"]
const RIGHT_LABELS = ["Monitor", "Scale", "Optimize"]

function PillLabel({
  label,
  x,
  y,
  delay,
}: {
  label: string
  x: number
  y: number
  delay: number
}) {
  return (
    <g className="opacity-0 animate-fade-in" style={{ animationDelay: `${delay}s` }}>
      <rect
        x={x}
        y={y}
        width={80}
        height={26}
        rx={13}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      />
      <text
        x={x + 40}
        y={y + 17}
        textAnchor="middle"
        fill="currentColor"
        fontSize={10}
        fontFamily="var(--font-mono), monospace"
        fontWeight={500}
        letterSpacing="0.05em"
      >
        {label}
      </text>
    </g>
  )
}

export function WorkflowDiagram() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-[200px] w-full" />
  }

  const centerX = 400
  const centerY = 100

  return (
    <div className="relative w-full max-w-[800px] mx-auto">
      <svg
        viewBox="0 0 800 200"
        className="w-full h-auto"
        role="img"
        aria-label="Workflow diagram showing connected deployment stages"
      >
        {/* Left lines from center to left labels */}
        {LEFT_LABELS.map((_, i) => {
          const pillX = 60
          const pillY = 30 + i * 60
          return (
            <line
              key={`left-line-${i}`}
              x1={centerX - 40}
              y1={centerY}
              x2={pillX + 80}
              y2={pillY + 13}
              stroke="currentColor"
              strokeWidth={1}
              opacity={0.3}
              className="animate-draw-line"
              style={{ animationDelay: `${0.2 + i * 0.1}s` }}
            />
          )
        })}

        {/* Right lines from center to right labels */}
        {RIGHT_LABELS.map((_, i) => {
          const pillX = 660
          const pillY = 30 + i * 60
          return (
            <line
              key={`right-line-${i}`}
              x1={centerX + 40}
              y1={centerY}
              x2={pillX}
              y2={pillY + 13}
              stroke="currentColor"
              strokeWidth={1}
              opacity={0.3}
              className="animate-draw-line"
              style={{ animationDelay: `${0.2 + i * 0.1}s` }}
            />
          )
        })}

        {/* Data packets flowing along lines */}
        {LEFT_LABELS.map((_, i) => {
          const pillX = 60
          const pillY = 30 + i * 60
          return (
            <circle
              key={`left-packet-${i}`}
              r={3}
              fill="currentColor"
              opacity={0.6}
              cx={pillX + 80}
              cy={pillY + 13}
              className="animate-move-left"
              style={{ animationDelay: `${0.8 + i * 0.6}s` }}
            />
          )
        })}

        {RIGHT_LABELS.map((_, i) => {
          const pillX = 660
          const pillY = 30 + i * 60
          return (
            <circle
              key={`right-packet-${i}`}
              r={3}
              fill="currentColor"
              opacity={0.6}
              cx={centerX + 40}
              cy={centerY}
              className="animate-move-right"
              style={{ animationDelay: `${1.2 + i * 0.6}s` }}
            />
          )
        })}

        {/* Left pill labels */}
        {LEFT_LABELS.map((label, i) => (
          <PillLabel
            key={`left-${label}`}
            label={label}
            x={60}
            y={30 + i * 60}
            delay={0.1 + i * 0.1}
          />
        ))}

        {/* Right pill labels */}
        {RIGHT_LABELS.map((label, i) => (
          <PillLabel
            key={`right-${label}`}
            label={label}
            x={660}
            y={30 + i * 60}
            delay={0.1 + i * 0.1}
          />
        ))}

        {/* Center logo square */}
        <g>
          <rect
            x={centerX - 36}
            y={centerY - 36}
            width={72}
            height={72}
            fill="hsl(var(--muted))"
            stroke="currentColor"
            strokeWidth={1.5}
          />
          {/* Abstract logo shape */}
          <line x1={centerX} y1={centerY - 18} x2={centerX} y2={centerY + 18} stroke="currentColor" strokeWidth={3} />
          <line x1={centerX - 18} y1={centerY} x2={centerX + 18} y2={centerY} stroke="currentColor" strokeWidth={3} />
          <line x1={centerX - 12} y1={centerY - 12} x2={centerX + 12} y2={centerY + 12} stroke="currentColor" strokeWidth={2} />
          <line x1={centerX + 12} y1={centerY - 12} x2={centerX - 12} y2={centerY + 12} stroke="currentColor" strokeWidth={2} />
        </g>
      </svg>
    </div>
  )
}
