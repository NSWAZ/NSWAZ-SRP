import { useLocation, Link } from "wouter";
import { 
  LayoutDashboard, 
  PlusCircle, 
  FileText, 
  ClipboardCheck, 
  Settings,
  Shield,
  Rocket,
  Users
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import type { DashboardStats } from "@shared/schema";

const memberItems = [
  { title: "대시보드", url: "/", icon: LayoutDashboard },
  { title: "새 요청", url: "/new-request", icon: PlusCircle },
  { title: "나의 요청", url: "/my-requests", icon: FileText },
];

const fcItems = [
  { title: "플릿 관리", url: "/fleet-management", icon: Users },
  { title: "요청 관리", url: "/all-requests", icon: ClipboardCheck },
];

const adminItems = [
  { title: "함선 유형 관리", url: "/ship-types", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  
  const { data: userRole } = useQuery<{ role: string }>({
    queryKey: ["/api/user/role"],
    enabled: !!user,
  });

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["/api/stats"],
    enabled: !!user,
  });

  const isAdmin = userRole?.role === "admin" || userRole?.role === "fc";
  const pendingCount = stats?.pendingCount || 0;

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary">
            <Rocket className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold" data-testid="text-alliance-name">Nisuwa Cartel</span>
            <span className="text-sm text-muted-foreground">SRP Manager</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {memberItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2">
              <Users className="h-3 w-3" />
              FC 도구
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {fcItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={location === item.url}>
                      <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        {item.title === "요청 관리" && pendingCount > 0 && (
                          <Badge variant="destructive" className="ml-auto" data-testid="badge-pending-count">
                            {pendingCount}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {userRole?.role === "admin" && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2">
              <Shield className="h-3 w-3" />
              관리자 도구
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={location === item.url}>
                      <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex flex-col gap-2">
          {user && (
            <span className="text-sm font-medium" data-testid="text-main-character-name">
              {user.characterName}
            </span>
          )}
          {userRole && (
            <Badge 
              variant={userRole.role === "admin" ? "default" : "secondary"}
              data-testid="badge-user-role"
            >
              {userRole.role.toUpperCase()}
            </Badge>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
