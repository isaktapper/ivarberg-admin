import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-sea text-white font-semibold hover:bg-sea-dark",
        secondary: "border border-line bg-white text-ink hover:bg-sand-soft",
        outline: "border border-line bg-white text-ink hover:bg-sand-soft",
        ghost: "text-ink-soft hover:bg-stone hover:text-ink",
        destructive: "border border-poppy-line bg-white text-poppy hover:bg-poppy-light",
        success: "bg-kelp text-white font-semibold hover:bg-[#155A3B]",
        link: "text-sea underline-offset-4 hover:underline px-0",
        dark: "bg-ink text-white hover:bg-navy",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-3 text-xs gap-1.5",
        lg: "h-10 px-4 text-sm",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  children,
  disabled,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Comp>
  )
}

export { Button, buttonVariants }
