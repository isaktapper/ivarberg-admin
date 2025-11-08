import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function generateEventId() {
  return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Get the public frontend URL
 * Always returns https://ivarberg.nu (without trailing slash)
 */
export function getFrontendUrl(): string {
  // Force the correct URL - ignore env variable if it's wrong
  return 'https://ivarberg.nu'
}
