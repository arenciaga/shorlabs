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
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const updateViewport = () => {
      setIsMobile(window.innerWidth < 768)
    }
    updateViewport()
    window.addEventListener("resize", updateViewport)
    return () => {
      window.removeEventListener("resize", updateViewport)
    }
  }, [])

  const centerX = isMobile ? 180 : 400
  const centerY = isMobile ? 120 : 100
  const pillXLeft = isMobile ? 8 : 60
  const pillXRight = isMobile ? 272 : 660
  const pillWidth = isMobile ? 80 : 80
  const rowGap = isMobile ? 72 : 60
  const startY = isMobile ? 18 : 30
  const viewWidth = isMobile ? 360 : 800
  const viewHeight = isMobile ? 260 : 200

  return (
    <div className="relative w-full mx-auto">
      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        className="w-full h-auto"
        role="img"
        aria-label="Workflow diagram showing connected deployment stages"
      >
        {LEFT_LABELS.map((_, i) => {
          const pillY = startY + i * rowGap
          return (
            <line
              key={`left-line-${i}`}
              x1={centerX - 40}
              y1={centerY}
              x2={pillXLeft + pillWidth}
              y2={pillY + 13}
              stroke="currentColor"
              strokeWidth={1}
              opacity={0.3}
              className="animate-draw-line"
              style={{ animationDelay: `${0.2 + i * 0.1}s` }}
            />
          )
        })}

        {RIGHT_LABELS.map((_, i) => {
          const pillY = startY + i * rowGap
          return (
            <line
              key={`right-line-${i}`}
              x1={centerX + 40}
              y1={centerY}
              x2={pillXRight}
              y2={pillY + 13}
              stroke="currentColor"
              strokeWidth={1}
              opacity={0.3}
              className="animate-draw-line"
              style={{ animationDelay: `${0.2 + i * 0.1}s` }}
            />
          )
        })}

        {LEFT_LABELS.map((_, i) => {
          const pillY = startY + i * rowGap
          return (
            <circle
              key={`left-packet-${i}`}
              r={3}
              fill="currentColor"
              opacity={0.6}
              cx={pillXLeft + pillWidth}
              cy={pillY + 13}
              className={isMobile ? "" : "animate-move-left"}
              style={{ animationDelay: `${0.8 + i * 0.6}s` }}
            />
          )
        })}

        {RIGHT_LABELS.map((_, i) => {
          return (
            <circle
              key={`right-packet-${i}`}
              r={3}
              fill="currentColor"
              opacity={0.6}
              cx={centerX + 40}
              cy={centerY}
              className={isMobile ? "" : "animate-move-right"}
              style={{ animationDelay: `${1.2 + i * 0.6}s` }}
            />
          )
        })}

        {LEFT_LABELS.map((label, i) => (
          <PillLabel
            key={`left-${label}`}
            label={label}
            x={pillXLeft}
            y={startY + i * rowGap}
            delay={0.1 + i * 0.1}
          />
        ))}

        {RIGHT_LABELS.map((label, i) => (
          <PillLabel
            key={`right-${label}`}
            label={label}
            x={pillXRight}
            y={startY + i * rowGap}
            delay={0.1 + i * 0.1}
          />
        ))}

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
