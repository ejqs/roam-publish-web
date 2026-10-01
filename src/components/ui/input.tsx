import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-[30px] w-full min-w-0 rounded-sm border-0 bg-card px-2.5 py-1 text-base shadow-[inset_0_0_0_1px_var(--input),inset_0_1px_1px_rgba(17,20,24,0.2)] transition-shadow outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_2px_color-mix(in_oklab,var(--ring)_40%,transparent),inset_0_1px_1px_rgba(17,20,24,0.2)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
