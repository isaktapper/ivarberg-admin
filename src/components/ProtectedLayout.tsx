'use client'

/**
 * Tillfällig genomsläppare. Skalet renderas numera av src/app/(admin)/layout.tsx.
 * Sidor som fortfarande wrappar sig i <ProtectedLayout> fungerar tills de skrivits om.
 */
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
