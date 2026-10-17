import { AppShell } from '@/components/shell/AppShell'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
