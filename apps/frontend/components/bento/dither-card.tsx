import { Card } from "@/components/ui/card"

export function DitherCard() {
  return (
    <Card className="flex flex-col h-full rounded-none border-0 bg-transparent py-0 shadow-none gap-0">
      <div className="flex items-center justify-between border-b-2 border-foreground px-3 sm:px-4 py-2">
        <span className="text-[10px] tracking-widest text-muted-foreground uppercase">
          deployment.visual
        </span>
        <span className="text-[10px] tracking-widest text-muted-foreground">LIVE</span>
      </div>
      <div className="flex-1 flex items-center justify-center bg-background overflow-hidden">
        <video
          className="w-full h-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
        >
          <source src="/1.mp4" type="video/mp4" />
        </video>
      </div>
    </Card>
  )
}
