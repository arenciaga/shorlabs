"use client"

import { Terminal } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const FastAPIIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5">
    <path fill="#009688" d="M12 0C5.375 0 0 5.375 0 12c0 6.627 5.375 12 12 12 6.626 0 12-5.373 12-12 0-6.625-5.373-12-12-12zm-.624 21.62v-7.528H7.19L13.203 2.38v7.528h4.029L11.376 21.62z" />
  </svg>
)

const FlaskIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5">
    <path fill="#000000" d="M7.172 20.36c-.914-.72-1.89-1.41-2.556-2.38-1.402-1.712-2.248-3.787-2.616-5.94-.296-1.768-.18-3.588.248-5.34.026-.106.08-.202.076-.31V6c0-.55.45-1 1-1h.03c.03 0 .06.006.09.008.55.03.98.486.98 1.04v.342c.197 1.358.757 2.622 1.537 3.73.608.865 1.377 1.62 2.21 2.28 1.262.997 2.69 1.772 4.09 2.56.66.37 1.304.77 1.928 1.195 1.18.806 2.256 1.752 3.08 2.9.47.657.848 1.378 1.1 2.14.04.14.097.31.097.46 0 .55-.45 1-1 1H8.54c-.35 0-.67-.18-.854-.48l-.514-.815zm12.828 0c.55 0 1-.45 1-1 0-.55-.45-1-1-1h-6c-.55 0-1 .45-1 1 0 .55.45 1 1 1h6zM8 7c0-.55.45-1 1-1h6c.55 0 1 .45 1 1s-.45 1-1 1H9c-.55 0-1-.45-1-1z" />
  </svg>
)

const DjangoIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5">
    <path fill="#092E20" d="M11.146 0h3.924v18.166c-2.013.382-3.491.535-5.096.535-4.791 0-7.288-2.166-7.288-6.32 0-4.002 2.65-6.6 6.753-6.6.637 0 1.121.05 1.707.203zm0 9.143a3.894 3.894 0 00-1.325-.204c-1.988 0-3.134 1.223-3.134 3.365 0 2.09 1.096 3.236 3.109 3.236.433 0 .79-.025 1.35-.102V9.142zM21.314 6.06v9.098c0 3.134-.229 4.638-.917 5.937-.637 1.249-1.478 2.039-3.211 2.905l-3.644-1.733c1.733-.815 2.574-1.53 3.109-2.625.561-1.121.739-2.421.739-5.835V6.059h3.924zM17.39.021h3.924v4.026H17.39z" />
  </svg>
)

const NodeIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5">
    <path fill="#339933" d="M11.998 24c-.321 0-.641-.084-.922-.247L8.14 22.016c-.438-.245-.224-.332-.08-.383.585-.203.703-.25 1.328-.604.066-.037.152-.023.22.017l2.255 1.339a.29.29 0 00.272 0l8.795-5.076a.277.277 0 00.134-.238V6.921a.283.283 0 00-.137-.242l-8.791-5.072a.278.278 0 00-.271 0L3.075 6.68a.284.284 0 00-.139.241v10.15a.27.27 0 00.139.235l2.409 1.392c1.307.654 2.108-.116 2.108-.89V7.787c0-.142.114-.253.256-.253h1.115c.139 0 .255.11.255.253v10.021c0 1.745-.95 2.745-2.604 2.745-.508 0-.909 0-2.026-.551L2.28 18.675a1.854 1.854 0 01-.922-1.604V6.921c0-.659.353-1.275.922-1.603L11.075.241a1.926 1.926 0 011.846 0l8.794 5.077c.572.329.924.944.924 1.603v10.15c0 .659-.352 1.273-.924 1.604l-8.794 5.078a1.858 1.858 0 01-.923.247z" />
  </svg>
)

const ExpressIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5">
    <path fill="#000000" d="M24 18.588a1.529 1.529 0 01-1.895-.72l-3.45-4.771-.5-.667-4.003 5.444a1.466 1.466 0 01-1.802.708l5.158-6.92-4.798-6.251a1.595 1.595 0 011.9.666l3.576 4.83 3.596-4.81a1.435 1.435 0 011.788-.668L21.708 7.9l-2.522 3.283a.666.666 0 000 .994l4.804 6.412zM.002 11.576l.42-2.075c1.154-4.103 5.858-5.81 9.094-3.27 1.895 1.489 2.368 3.597 2.275 5.973H1.116C.943 16.447 4.005 19.009 7.92 17.7a4.078 4.078 0 002.582-2.876c.207-.666.548-.78 1.174-.588a5.417 5.417 0 01-2.589 3.957 6.272 6.272 0 01-7.306-.933 6.575 6.575 0 01-1.64-3.858c0-.235-.08-.455-.134-.666A88.33 88.33 0 010 11.577zm1.127-.286h9.654c-.06-3.076-2.001-5.258-4.59-5.278-2.882-.04-4.944 2.094-5.071 5.264z" />
  </svg>
)

const NextJsIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5">
    <path fill="#000000" d="M11.572 0c-.176 0-.31.001-.358.007a19.76 19.76 0 01-.364.033C7.443.346 4.25 2.185 2.228 5.012a11.875 11.875 0 00-2.119 5.243c-.096.659-.108.854-.108 1.747s.012 1.089.108 1.748c.652 4.506 3.86 8.292 8.209 9.695.779.251 1.6.422 2.534.525.363.04 1.935.04 2.299 0 1.611-.178 2.977-.577 4.323-1.264.207-.106.247-.134.219-.158-.02-.013-.9-1.193-1.955-2.62l-1.919-2.592-2.404-3.558a338.739 338.739 0 00-2.422-3.556c-.009-.002-.018 1.579-.023 3.51-.007 3.38-.01 3.515-.052 3.595a.426.426 0 01-.206.214c-.075.037-.14.044-.495.044H7.81l-.108-.068a.438.438 0 01-.157-.171l-.05-.106.006-4.703.007-4.705.072-.092a.645.645 0 01.174-.143c.096-.047.134-.051.54-.051.478 0 .558.018.682.154.035.038 1.337 1.999 2.895 4.361a10760.433 10760.433 0 004.735 7.17l1.9 2.879.096-.063a12.317 12.317 0 002.466-2.163 11.944 11.944 0 002.824-6.134c.096-.66.108-.854.108-1.748 0-.893-.012-1.088-.108-1.747-.652-4.506-3.859-8.292-8.208-9.695a12.597 12.597 0 00-2.499-.523A33.119 33.119 0 0011.573 0zm4.069 7.217c.347 0 .408.005.486.047a.473.473 0 01.237.277c.018.06.023 1.365.018 4.304l-.006 4.218-.744-1.14-.746-1.14v-3.066c0-1.982.01-3.097.023-3.15a.478.478 0 01.233-.296c.096-.05.13-.054.5-.054z" />
  </svg>
)

interface FrameworkItem {
  name: string
  icon: React.ComponentType
}

const CustomCommandsIcon = () => <Terminal className="h-3.5 w-3.5 text-foreground" />

const FRAMEWORKS: FrameworkItem[] = [
  { name: "NEXT.JS", icon: NextJsIcon },
  { name: "FASTAPI", icon: FastAPIIcon },
  { name: "EXPRESS", icon: ExpressIcon },
  { name: "FLASK", icon: FlaskIcon },
  { name: "DJANGO", icon: DjangoIcon },
  { name: "NODE.JS", icon: NodeIcon },
  { name: "CUSTOM COMMANDS", icon: CustomCommandsIcon },
]

function LogoBlock({ framework }: { framework: FrameworkItem }) {
  const Icon = framework.icon
  return (
    <div
      className="flex items-center justify-center px-5 sm:px-8 py-3 sm:py-4 border-r-2 border-foreground shrink-0"
    >
      <div className="flex items-center gap-2.5">
        <Icon />
        <span className="text-xs sm:text-sm font-mono tracking-[0.15em] uppercase text-foreground whitespace-nowrap">
          {framework.name}
        </span>
      </div>
    </div>
  )
}

export function GlitchMarquee() {
  return (
    <section className="w-full py-12 px-4 sm:px-6 sm:py-14 lg:px-12 lg:py-16">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground whitespace-nowrap">
            {"// FRAMEWORKS: SUPPORTED"}
          </span>
          <Separator className="flex-1" />
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground whitespace-nowrap">008</span>
        </div>

        <Card className="overflow-hidden border-2 border-foreground rounded-none bg-transparent py-0 shadow-none gap-0">
          <div className="flex" style={{ width: "max-content" }}>
            {[...FRAMEWORKS, ...FRAMEWORKS].map((framework, i) => (
              <LogoBlock
                key={`${framework.name}-${i}`}
                framework={framework}
              />
            ))}
          </div>
        </Card>
      </div>
    </section>
  )
}
