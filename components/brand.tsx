import { cn } from "@/lib/utils"

export function Brand({
  className,
  size = "md",
}: {
  className?: string
  size?: "sm" | "md" | "lg"
}) {
  const icit =
    size === "lg" ? "text-4xl" : size === "md" ? "text-2xl" : "text-lg"
  const sub =
    size === "lg" ? "text-[13px]" : size === "md" ? "text-xs" : "text-[10px]"
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex flex-col leading-none">
        <span className={cn("font-mono font-bold tracking-[0.18em] text-foreground", icit)}>
          ICIT
        </span>
        <span className={cn("font-mono uppercase tracking-[0.42em] text-muted-foreground", sub)}>
          Drone
        </span>
      </div>
    </div>
  )
}

export function DroneGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="5" cy="5" r="2.4" />
      <circle cx="19" cy="5" r="2.4" />
      <circle cx="5" cy="19" r="2.4" />
      <circle cx="19" cy="19" r="2.4" />
      <path d="M7 7l3 3m4 0l3-3M7 17l3-3m4 0l3 3" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1.2" />
    </svg>
  )
}
