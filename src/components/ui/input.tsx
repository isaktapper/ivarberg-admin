import * as React from "react"
import { cn } from "@/lib/utils"

const inputBase =
  "h-10 w-full min-w-0 rounded-[8px] border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-sea focus:outline-none focus:ring-2 focus:ring-sea/20 disabled:cursor-not-allowed disabled:bg-sand-soft disabled:text-ink-muted aria-invalid:border-poppy aria-invalid:bg-[#FFF8F4]"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(inputBase, className)} {...props} />
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(inputBase, "h-auto min-h-24 resize-y py-2.5 leading-relaxed", className)}
      {...props}
    />
  )
}

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        inputBase,
        "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2214%22 height=%2214%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236B7385%22 stroke-width=%222.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[length:14px] bg-[right_10px_center] bg-no-repeat pr-8",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

function Label({ className, children, required, hint, ...props }: React.ComponentProps<"label"> & { required?: boolean; hint?: string }) {
  return (
    <label data-slot="label" className={cn("text-[13px] font-medium text-ink", className)} {...props}>
      {children}
      {required ? <span className="ml-0.5 text-poppy">*</span> : null}
      {hint ? <span className="ml-1.5 font-normal text-ink-muted">· {hint}</span> : null}
    </label>
  )
}

/** Etikett + kontroll + hjälptext/fel i en kolumn. */
function Field({
  label,
  htmlFor,
  required,
  hint,
  help,
  error,
  className,
  children,
}: {
  label?: React.ReactNode
  htmlFor?: string
  required?: boolean
  hint?: string
  help?: React.ReactNode
  error?: string | null
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor} required={required} hint={hint}>
          {label}
        </Label>
      ) : null}
      {children}
      {error ? (
        <span className="text-xs text-poppy">{error}</span>
      ) : help ? (
        <span className="text-xs text-ink-muted">{help}</span>
      ) : null}
    </div>
  )
}

function Checkbox({ className, label, ...props }: React.ComponentProps<"input"> & { label?: React.ReactNode }) {
  const box = <input type="checkbox" className={cn("size-4 shrink-0 cursor-pointer rounded border-line accent-sea", className)} {...props} />
  if (!label) return box
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-[13px] text-ink">
      {box}
      {label}
    </label>
  )
}

export { Input, Textarea, Select, Label, Field, Checkbox, inputBase }
