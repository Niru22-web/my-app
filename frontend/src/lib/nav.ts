import {
  LayoutDashboard,
  Mail,
  ClipboardCheck,
  CalendarDays,
  ShieldCheck,
  Users,
  Landmark,
  Laptop,
  Headset,
  Clock,
  IdCard,
  Settings,
  BarChart3,
  Palmtree,
  Megaphone,
  Sparkles,
  Bug,
  MessageSquareHeart,
  type LucideIcon,
} from "lucide-react";
import type { RoleInfo } from "./roles";
import type { Action } from "./permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Other path prefixes that should highlight this item. */
  match?: string[];
  badge?: "unread";
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

type Can = (module: string, action?: Action) => boolean;

/**
 * Navigation for every role. Visibility rules mirror the legacy sidebar exactly,
 * so nobody gains or loses access as part of the redesign.
 */
export function buildNav(r: RoleInfo, can: Can): NavSection[] {
  const sections: NavSection[] = [
    {
      title: "Overview",
      items: [
        { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        ...(can("inbox") ? [{ label: "Inbox", href: "/inbox", icon: Mail, badge: "unread" as const }] : []),
        ...(can("calendar") ? [{ label: "Calendar", href: "/calendar", icon: CalendarDays }] : []),
        { label: "Announcements", href: "/announcements", icon: Megaphone },
        { label: "What’s new", href: "/releases", icon: Sparkles },
      ],
    },
    {
      title: "My Work",
      items: [
        { label: "Timesheet", href: "/timesheet", icon: ClipboardCheck },
        { label: "Attendance", href: "/attendance/dashboard", icon: Clock, match: ["/attendance"] },
        { label: "Leave Tracker", href: "/leave", icon: Palmtree },
        { label: "My Portal", href: "/portal/profile", icon: IdCard, match: ["/portal"] },
        { label: "Reports", href: "/reports/my", icon: BarChart3, match: ["/reports"] },
      ],
    },
    {
      title: "Operations",
      items: [
        ...(can("compliance") ? [{ label: "Compliance", href: "/compliance", icon: ShieldCheck }] : []),
        ...(can("employees") || can("clients") || can("projects") || can("jobs") || r.isAdmin || r.isHR || r.isAccounts || r.isIT
          ? [
              {
                label: "Management",
                href: r.isEmployee ? "/management/projects" : "/management/employees",
                icon: Users,
                match: ["/management"],
              },
            ]
          : []),
        ...(can("accounts") && (r.isAdmin || r.isAccounts)
          ? [{ label: "Accounts & Finance", href: "/accounts/dashboard", icon: Landmark, match: ["/accounts"] }]
          : []),
        ...(can("asset_management")
          ? [
              {
                label: r.isAssetRequester ? "Asset Requests" : "Asset Management",
                href: "/admin/asset-management/dashboard",
                icon: Laptop,
                match: ["/admin/asset-management"],
              },
            ]
          : []),
        ...(can("help_desk") ? [{ label: "Help Desk", href: "/help-desk", icon: Headset }] : []),
      ],
    },
  ];

  sections.push({
    title: "Portal",
    items: [
      { label: "Bug Tracker", href: "/bugs", icon: Bug },
      { label: "Feedback", href: "/feedback", icon: MessageSquareHeart },
    ],
  });

  if (r.isAdmin || r.isIT || r.isHR || can("admin_panel") || can("employees") || can("email_templates")) {
    sections.push({
      title: "Administration",
      items: [{ label: "Administration", href: "/admin-portal/dashboard", icon: Settings, match: ["/admin-portal"] }],
    });
  }

  return sections.filter((s) => s.items.length > 0);
}

export function isActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href || pathname.startsWith(item.href + "/")) return true;
  return (item.match ?? []).some((m) => pathname === m || pathname.startsWith(m + "/"));
}

const TITLES: [string, string][] = [
  ["/dashboard", "Dashboard"],
  ["/timesheet", "Timesheet"],
  ["/management/employees", "Employees"],
  ["/management/clients", "Clients"],
  ["/management/projects", "Projects"],
  ["/management/jobs", "Jobs"],
  ["/management", "Management"],
  ["/attendance", "Attendance"],
  ["/leave", "Leave Tracker"],
  ["/portal/reimbursements", "Reimbursements"],
  ["/portal/profile", "My Profile"],
  ["/reports", "Reports"],
  ["/portal", "My Portal"],
  ["/admin/asset-management", "Assets"],
  ["/admin-portal", "Administration"],
  ["/accounts", "Accounts & Finance"],
  ["/help-desk", "Help Desk"],
  ["/inbox", "Inbox"],
  ["/calendar", "Calendar"],
  ["/compliance", "Compliance"],
  ["/announcements", "Announcements"],
  ["/releases", "What’s new"],
  ["/bugs", "Bug Tracker"],
  ["/feedback", "Feedback"],
];

export function pageTitle(pathname: string): string {
  const p = pathname.toLowerCase();
  return TITLES.find(([prefix]) => p === prefix || p.startsWith(prefix + "/"))?.[1] ?? "ASA Portal";
}
