"use client";

import {
  BriefcaseIcon,
  CalculatorIcon,
  ChevronsUpDownIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
  TargetIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "~/components/auth/auth-provider";
import { RequireAuth } from "~/components/auth/require-auth";
import { CadenceLogo } from "~/components/cadence-mark";
import { ModeToggle } from "~/components/mode-toggle";
import { ProfileDialog, UserAvatar } from "~/components/profile-dialog";
import { Badge } from "~/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Separator } from "~/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "~/components/ui/sidebar";
import { useExceptions } from "~/lib/data/hooks";
import { ROLE_META, type Role } from "~/lib/profile";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "openCases";
};

const NAV: Record<Role, NavItem[]> = {
  borrower: [
    { href: "/borrower", label: "Overview", icon: LayoutDashboardIcon },
    { href: "/borrower/kpis", label: "KPIs", icon: TargetIcon },
    { href: "/borrower/pricing", label: "Pricing", icon: ReceiptTextIcon },
    { href: "/borrower/what-if", label: "What-if", icon: CalculatorIcon },
  ],
  rm: [
    { href: "/rm", label: "Portfolio", icon: BriefcaseIcon },
    {
      href: "/rm/exceptions",
      label: "Exceptions",
      icon: InboxIcon,
      badge: "openCases",
    },
  ],
  risk: [
    { href: "/risk", label: "Portfolio", icon: LayoutDashboardIcon },
    { href: "/risk/governance", label: "AI governance", icon: ShieldCheckIcon },
  ],
};

/** The most specific nav entry matching the current path. */
function useActiveItem(role: Role): NavItem | undefined {
  const pathname = usePathname();
  return NAV[role]
    .filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Guarded layout shared by the role dashboards (/borrower, /rm, /risk). */
export function AppShell({
  roles,
  children,
}: {
  roles: Role[];
  children: React.ReactNode;
}) {
  return (
    <RequireAuth roles={roles}>
      <SidebarProvider>
        <AppSidebar />
        {/* min-w-0: let wide tables/charts scroll inside their cards instead
            of stretching the inset past the viewport (which ate the right
            padding). */}
        <SidebarInset className="min-w-0">
          <InsetHeader />
          <div className="flex w-full min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </RequireAuth>
  );
}

function AppSidebar() {
  const { profile } = useAuth();
  if (!profile) return null;
  const role = profile.role;
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Logo is exactly the collapsed button size (size-8) so it stays
                centred in icon mode; the label truncates away. */}
            <SidebarMenuButton
              size="lg"
              render={<Link href={ROLE_META[role].home} />}
              tooltip="Cadence"
            >
              <CadenceLogo className="size-8" />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">Cadence</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <Separator orientation="horizontal" />
        <NavGroup role={role} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavGroup({ role }: { role: Role }) {
  const active = useActiveItem(role);
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{ROLE_META[role].label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {NAV[role].map((item) => {
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={active?.href === item.href}
                  tooltip={item.label}
                  render={
                    <Link
                      href={item.href}
                      onClick={() => setOpenMobile(false)}
                    />
                  }
                >
                  <Icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
                {item.badge === "openCases" ? <OpenCasesBadge /> : null}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** Live count of cases awaiting the RM (rendered for RMs only). */
function OpenCasesBadge() {
  const { data } = useExceptions();
  const open = data.filter((e) => e.status === "open").length;
  return open > 0 ? <SidebarMenuBadge>{open}</SidebarMenuBadge> : null;
}

function NavUser() {
  const { user, profile, signOut } = useAuth();
  const { isMobile } = useSidebar();
  const [profileOpen, setProfileOpen] = useState(false);
  if (!user || !profile) return null;

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
                />
              }
            >
              <UserAvatar
                user={user}
                name={profile.fullName}
                className="size-8"
              />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">{profile.fullName}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {user.email}
                </span>
              </div>
              <ChevronsUpDownIcon className="ml-auto" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-56"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left">
                    <UserAvatar
                      user={user}
                      name={profile.fullName}
                      className="size-8"
                    />
                    <div className="grid flex-1 leading-tight">
                      <span className="text-foreground truncate font-medium">
                        {profile.fullName}
                      </span>
                      <span className="truncate text-xs">{user.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                  <UserRoundIcon />
                  My profile
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void signOut()}>
                <LogOutIcon />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}

function InsetHeader() {
  const { profile } = useAuth();
  const active = useActiveItem(profile?.role ?? "borrower");
  return (
    <header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 md:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-vertical:h-4" />
      <span className="text-sm font-medium">{active?.label ?? "Cadence"}</span>
      <div className="ml-auto flex items-center gap-2">
        {profile ? (
          <Badge variant="secondary">{ROLE_META[profile.role].label}</Badge>
        ) : null}
        <ModeToggle />
      </div>
    </header>
  );
}
