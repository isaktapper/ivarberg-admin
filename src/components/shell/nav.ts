import {
  LayoutDashboard,
  Calendar,
  CheckSquare,
  Lightbulb,
  Copy,
  Star,
  Instagram,
  Users,
  Globe,
  Download,
  Bell,
  BarChart3,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  key: string
  label: string
  href: string
  icon: LucideIcon
  /** Nyckel i badge-räknarna (se Sidebar) */
  badge?: 'review' | 'tips' | 'alerts'
  /** Matcha även undersidor */
  prefix?: boolean
}

export interface NavGroup {
  label?: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  { items: [{ key: 'dashboard', label: 'Översikt', href: '/', icon: LayoutDashboard }] },
  {
    label: 'Evenemang',
    items: [
      { key: 'events', label: 'Alla events', href: '/events', icon: Calendar },
      { key: 'review', label: 'Granska', href: '/events/review', icon: CheckSquare, badge: 'review', prefix: true },
      { key: 'tips', label: 'Tips från besökare', href: '/admin/tips', icon: Lightbulb, badge: 'tips', prefix: true },
      { key: 'duplicates', label: 'Dubletter', href: '/events/duplicates', icon: Copy, prefix: true },
      { key: 'hero', label: 'Hero på startsidan', href: '/admin/hero-featured', icon: Star, prefix: true },
    ],
  },
  {
    label: 'Innehåll',
    items: [
      { key: 'instagram', label: 'Instagram', href: '/instagram', icon: Instagram, prefix: true },
      { key: 'organizers', label: 'Arrangörer', href: '/organizers', icon: Users, prefix: true },
      { key: 'pages', label: 'Arrangörssidor', href: '/organizer-pages', icon: Globe, prefix: true },
    ],
  },
  {
    label: 'Källor',
    items: [
      { key: 'scrapers', label: 'Scrapers', href: '/scrapers', icon: Download, prefix: true },
      { key: 'alerts', label: 'Larm', href: '/admin/alerts', icon: Bell, badge: 'alerts', prefix: true },
    ],
  },
  {
    label: 'Analys',
    items: [
      { key: 'stats', label: 'Statistik', href: '/events/statistics', icon: BarChart3, prefix: true },
      { key: 'settings', label: 'Inställningar', href: '/admin/settings/notifications', icon: SlidersHorizontal, prefix: true },
    ],
  },
]

export const ALL_NAV_ITEMS = NAV.flatMap((g) => g.items)

/** Brödsmulor per route-prefix (längsta matchning vinner) */
export const CRUMBS: { prefix: string; crumbs: string[] }[] = [
  { prefix: '/events/review', crumbs: ['Evenemang', 'Granska'] },
  { prefix: '/events/duplicates', crumbs: ['Evenemang', 'Dubletter'] },
  { prefix: '/events/statistics', crumbs: ['Analys', 'Statistik'] },
  { prefix: '/events/new', crumbs: ['Evenemang', 'Alla events', 'Nytt event'] },
  { prefix: '/events', crumbs: ['Evenemang', 'Alla events'] },
  { prefix: '/admin/tips', crumbs: ['Evenemang', 'Tips från besökare'] },
  { prefix: '/admin/hero-featured', crumbs: ['Evenemang', 'Hero på startsidan'] },
  { prefix: '/admin/alerts', crumbs: ['Källor', 'Larm'] },
  { prefix: '/admin/settings', crumbs: ['Analys', 'Inställningar'] },
  { prefix: '/instagram', crumbs: ['Innehåll', 'Instagram'] },
  { prefix: '/organizer-pages/new', crumbs: ['Innehåll', 'Arrangörssidor', 'Ny sida'] },
  { prefix: '/organizer-pages', crumbs: ['Innehåll', 'Arrangörssidor'] },
  { prefix: '/organizers/new', crumbs: ['Innehåll', 'Arrangörer', 'Ny arrangör'] },
  { prefix: '/organizers', crumbs: ['Innehåll', 'Arrangörer'] },
  { prefix: '/scrapers', crumbs: ['Källor', 'Scrapers'] },
  { prefix: '/', crumbs: ['Översikt'] },
]

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === '/') return pathname === '/'
  if (item.prefix) return pathname === item.href || pathname.startsWith(item.href + '/')
  // "Alla events" ska inte lysa på /events/review etc.
  if (item.href === '/events') return pathname === '/events' || /^\/events\/(new|\d+)/.test(pathname)
  return pathname === item.href
}
