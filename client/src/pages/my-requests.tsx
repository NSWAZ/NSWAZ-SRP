import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PlusCircle, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SrpRequestWithDetails } from "@shared/schema";

function getStatusVariant(status: string): "default" | "destructive" | "secondary" | "outline" {
  switch (status) {
    case "approved": return "default";
    case "denied": return "destructive";
    case "processing": return "secondary";
    default: return "outline";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "approved": return "승인됨";
    case "denied": return "거부됨";
    case "processing": return "처리 중";
    case "pending": return "대기 중";
    default: return status;
  }
}

function formatDate(date: string | Date | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatIsk(amount: number): string {
  if (amount >= 1000000000) {
    return `${(amount / 1000000000).toFixed(2)}B`;
  } else if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M`;
  }
  return `${amount.toLocaleString()}`;
}

function getOperationTypeLabel(type: string): string {
  return type === "fleet" ? "플릿" : "솔로";
}

export default function MyRequests() {
  const { data: requests, isLoading } = useQuery<SrpRequestWithDetails[]>({
    queryKey: ["/api/srp-requests/my"],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">나의 요청</h1>
          <p className="text-muted-foreground">
            SRP 요청 내역과 상태를 확인하세요
          </p>
        </div>
        <Button asChild data-testid="button-new-request">
          <Link href="/new-request">
            <PlusCircle className="mr-2 h-4 w-4" />
            새 요청
          </Link>
        </Button>
      </div>

      <Card data-testid="card-requests-table">
        <CardHeader>
          <CardTitle>요청 기록</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : requests && requests.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>함선</TableHead>
                    <TableHead>캐릭터</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                    <TableHead className="text-right">지급액</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id} data-testid={`row-request-${request.id}`}>
                      <TableCell className="font-mono text-sm">
                        {formatDate(request.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <img 
                            src={`https://images.evetech.net/types/${request.shipTypeId}/icon?size=32`}
                            alt=""
                            className="h-6 w-6"
                          />
                          <span className="font-medium">
                            {request.shipData?.typeName || "알 수 없음"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {request.victimCharacterName || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={request.operationType === "fleet" ? "secondary" : "outline"} className="text-xs">
                          {getOperationTypeLabel(request.operationType)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatIsk(request.iskAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {request.payoutAmount ? formatIsk(request.payoutAmount) : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(request.status)}>
                          {getStatusLabel(request.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            data-testid={`button-view-killmail-${request.id}`}
                          >
                            <a
                              href={`https://zkillboard.com/kill/${request.killmailId}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            data-testid={`button-view-details-${request.id}`}
                          >
                            <Link href={`/request/${request.id}`}>
                              <FileText className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center" data-testid="text-no-requests">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-semibold">아직 요청이 없습니다</h3>
              <p className="mt-2 text-muted-foreground">
                첫 SRP 요청을 제출하여 시작하세요
              </p>
              <Button asChild className="mt-4" data-testid="button-submit-first">
                <Link href="/new-request">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  요청 제출하기
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
