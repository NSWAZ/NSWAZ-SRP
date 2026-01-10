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
  if (amount >= 1000000000) {
    return `${(amount / 1000000000).toFixed(2)}B`;
  } else if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M`;
  }
  return `${amount.toLocaleString()}`;
}

function getStatusVariant(status: string) {
  switch (status) {
    case "approved": return "default";
    case "denied": return "destructive";
    case "processing": return "secondary";
    case "paid": return "secondary";
    default: return "outline";
  }
}

function getStatusClassName(status: string): string {
  if (status === "paid") {
    return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800";
  }
  return "";
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "approved": return "승인됨";
    case "denied": return "거부됨";
    case "processing": return "처리 중";
    case "pending": return "대기 중";
    case "paid": return "지급됨";
    default: return status;
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
  loading,
  isSiteWide = false
}: { 
  title: string; 
  value: string | number; 
  icon: React.ElementType; 
  loading?: boolean;
  isSiteWide?: boolean;
}) {
  return (
    <Card 
      data-testid={`card-stat-${title.toLowerCase().replace(/\s/g, "-")}`}
      className={isSiteWide ? "bg-muted/50 dark:bg-muted/20 border-dashed" : ""}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          {isSiteWide && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              전체
            </span>
          )}
        </div>
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
        <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">대시보드</h1>
        <p className="text-muted-foreground">
          당신의 SRP 활동 개요입니다.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="승인 대기중인 요청"
          value={stats?.pendingCount ?? 0}
          icon={Clock}
          loading={statsLoading}
        />
        <StatCard
          title="총 지급받은 ISK"
          value={stats ? formatIsk(stats.totalPaidOut) : "0M ISK"}
          icon={DollarSign}
          loading={statsLoading}
        />
        <StatCard
          title="오늘 승인된 요청 수"
          value={stats?.approvedToday ?? 0}
          icon={CheckCircle}
          loading={statsLoading}
          isSiteWide
        />
        <StatCard
          title="평균 처리 시간"
          value={stats ? `${stats.averageProcessingHours}h` : "0h"}
          icon={Timer}
          loading={statsLoading}
          isSiteWide
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-testid="card-quick-actions">
          <CardHeader>
            <CardTitle>빠른 행동</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button asChild className="justify-start" data-testid="button-new-request">
              <Link href="/new-request">
                <PlusCircle className="mr-2 h-4 w-4" />
                SRP 요청 제출하기
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start" data-testid="button-view-requests">
              <Link href="/my-requests">
                <FileText className="mr-2 h-4 w-4" />
                나의 요청 보기
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card data-testid="card-recent-activity">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>최근 요청한 킬메일</CardTitle>
            <Button variant="ghost" size="sm" asChild data-testid="button-view-all">
              <Link href="/my-requests">
                모두 보기
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
                    <div className="flex items-center gap-2">
                      <img 
                        src={`https://images.evetech.net/types/${request.shipTypeId}/icon?size=32`}
                        alt=""
                        className="h-6 w-6"
                      />
                      <div>
                        <p className="font-medium">
                          {request.shipData?.typeName || "알 수 없는 함선"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {(() => {
                            const createdLog = request.processLogs?.find(log => log.processType === "created");
                            return createdLog?.occurredAt ? formatTimeAgo(createdLog.occurredAt) : null;
                          })()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getStatusVariant(request.status)} className={getStatusClassName(request.status)}>
                        <span className="font-mono">{formatIsk(request.payoutAmount || 0)}</span>
                        <span className="ml-1">
                          {request.status === "paid" ? "지급됨" : 
                           request.status === "approved" ? "지급 예정" : 
                           request.status === "denied" ? "거부됨" : "심사 중"}
                        </span>
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground" data-testid="text-no-activity">
                <FileText className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p>최근 요청한 킬메일 없음</p>
                <p className="text-sm">첫 SRP 요청을 제출하여 시작하세요</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
