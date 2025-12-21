import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  Clock, 
  CheckCircle, 
  DollarSign, 
  Timer, 
  PlusCircle, 
  FileText,
  ArrowRight 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardStats, SrpRequestWithDetails } from "@shared/schema";

function formatIsk(amount: number): string {
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}B ISK`;
  }
  return `${amount}M ISK`;
}

function getStatusVariant(status: string) {
  switch (status) {
    case "approved": return "default";
    case "denied": return "destructive";
    case "processing": return "secondary";
    default: return "outline";
  }
}

function formatTimeAgo(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  return "Just now";
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  loading 
}: { 
  title: string; 
  value: string | number; 
  icon: React.ElementType; 
  loading?: boolean;
}) {
  return (
    <Card data-testid={`card-stat-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-bold font-mono">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/stats"],
  });

  const { data: recentRequests, isLoading: requestsLoading } = useQuery<SrpRequestWithDetails[]>({
    queryKey: ["/api/srp-requests/my/recent"],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your SRP activity and alliance statistics
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Pending Requests"
          value={stats?.pendingCount ?? 0}
          icon={Clock}
          loading={statsLoading}
        />
        <StatCard
          title="Approved Today"
          value={stats?.approvedToday ?? 0}
          icon={CheckCircle}
          loading={statsLoading}
        />
        <StatCard
          title="Total Paid Out"
          value={stats ? formatIsk(stats.totalPaidOut) : "0M ISK"}
          icon={DollarSign}
          loading={statsLoading}
        />
        <StatCard
          title="Avg. Processing"
          value={stats ? `${stats.averageProcessingHours}h` : "0h"}
          icon={Timer}
          loading={statsLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-testid="card-quick-actions">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button asChild className="justify-start" data-testid="button-new-request">
              <Link href="/new-request">
                <PlusCircle className="mr-2 h-4 w-4" />
                Submit New SRP Request
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start" data-testid="button-view-requests">
              <Link href="/my-requests">
                <FileText className="mr-2 h-4 w-4" />
                View My Requests
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card data-testid="card-recent-activity">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Recent Activity</CardTitle>
            <Button variant="ghost" size="sm" asChild data-testid="button-view-all">
              <Link href="/my-requests">
                View All
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {requestsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            ) : recentRequests && recentRequests.length > 0 ? (
              <div className="space-y-4">
                {recentRequests.slice(0, 5).map((request) => (
                  <div 
                    key={request.id} 
                    className="flex items-center justify-between"
                    data-testid={`row-request-${request.id}`}
                  >
                    <div>
                      <p className="font-medium">{request.shipType?.name || "Unknown Ship"}</p>
                      <p className="text-sm text-muted-foreground">
                        {request.createdAt && formatTimeAgo(request.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm">{request.iskAmount}M</span>
                      <Badge variant={getStatusVariant(request.status)}>
                        {request.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground" data-testid="text-no-activity">
                <FileText className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p>No recent activity</p>
                <p className="text-sm">Submit your first SRP request to get started</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
