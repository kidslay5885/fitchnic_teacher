import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, onChange, onCompositionEnd, ...props }: React.ComponentProps<"textarea">) {
  // 한국어 IME 조합 중 포커스를 잃으면 마지막 글자가 사라지는 문제 방지
  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    onCompositionEnd?.(e)
    if (onChange) {
      onChange(e as unknown as React.ChangeEvent<HTMLTextAreaElement>)
    }
  }

  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      onChange={onChange}
      onCompositionEnd={handleCompositionEnd}
      {...props}
    />
  )
}

export { Textarea }
