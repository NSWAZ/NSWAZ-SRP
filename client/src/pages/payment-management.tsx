import { useQuery, useMutation } from "@tanstack/react-query";
import { Wallet, Copy, Check, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PaymentSummary {
  seatUserId: number;
  mainCharacterId: number | null;
  mainCharacterName: string;
  totalPayout: number;
  requestCount: number;
  requestIds: string[];
}

function formatIsk(amount: number | null): string {
  if (amount === null || amount === undefined) return "-";
  if (amount >= 1000000000) {
    return `${(amount / 1000000000).toFixed(2)}B`;
  } else if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M`;
  }
  return `${amount.toLocaleString()}`;
}

export default function PaymentManagement() {
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const { data: summaries, isLoading } = useQuery<PaymentSummary[]>({
    queryKey: ["/api/payment/summary"],
    refetchOnMount: "always",
  });

  const markPaidMutation = useMutation({
    mutationFn: async (requestIds: string[]) => {
      const response = await apiRequest("POST", "/api/payment/mark-paid", { requestIds });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/srp-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "지급 완료",
        description: `${variables.length}건의 요청이 지급 완료로 변경되었습니다.`,
      });
      setProcessingId(null);
    },
    onError: () => {
      toast({
        title: "오류",
        description: "지급 상태 변경에 실패했습니다.",
        variant: "destructive",
      });
      setProcessingId(null);
    },
  });

  const totalAmount = summaries?.reduce((sum, s) => sum + s.totalPayout, 0) || 0;
  const totalUsers = summaries?.length || 0;
  const totalRequests = summaries?.reduce((sum, s) => sum + s.requestCount, 0) || 0;

  const copyToClipboard = async (amount: number, seatUserId: number) => {
    try {
      await navigator.clipboard.writeText(amount.toString());
      setCopiedId(seatUserId);
      toast({
        title: "복사됨",
        description: `${formatIsk(amount)} ISK가 클립보드에 복사되었습니다.`,
      });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({
        title: "복사 실패",
        description: "클립보드에 복사할 수 없습니다.",
        variant: "destructive",
      });
    }
  };

  const handleMarkPaid = (summary: PaymentSummary) => {
    setProcessingId(summary.seatUserId);
    markPaidMutation.mutate(summary.requestIds);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">지급 관리</h1>
        <p className="text-muted-foreground">
          승인된 SRP 요청의 지급 현황을 관리합니다
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="card-total-amount">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 지급 필요 금액</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-total-amount">
              {formatIsk(totalAmount)}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-total-users">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">지급 대상 인원</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-users">{totalUsers}명</div>
          </CardContent>
        </Card>

        <Card data-testid="card-total-requests">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">지급 예정 요청 수</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-requests">{totalRequests}건</div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-payment-table">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            지급 대기 목록
          </CardTitle>
          <CardDescription>
            메인 캐릭터별 지급 필요 금액 (금액 클릭 시 복사)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : summaries && summaries.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>메인 캐릭터</TableHead>
                    <TableHead className="text-center">지급 예정 요청</TableHead>
                    <TableHead className="text-right">지급 필요 금액</TableHead>
                    <TableHead className="text-right">지급 확인</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map((summary) => (
                    <TableRow key={summary.seatUserId} data-testid={`row-user-${summary.seatUserId}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {summary.mainCharacterId && (
                            <img
                              src={`https://images.evetech.net/characters/${summary.mainCharacterId}/portrait?size=32`}
                              alt=""
                              className="h-8 w-8 rounded-full"
                              data-testid={`img-portrait-${summary.seatUserId}`}
                            />
                          )}
                          <span className="font-medium" data-testid={`text-character-${summary.seatUserId}`}>{summary.mainCharacterName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" data-testid={`badge-request-count-${summary.seatUserId}`}>{summary.requestCount}건</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="font-mono text-lg font-bold text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30"
                              onClick={() => copyToClipboard(summary.totalPayout, summary.seatUserId)}
                              data-testid={`button-copy-${summary.seatUserId}`}
                            >
                              {formatIsk(summary.totalPayout)}
                              {copiedId === summary.seatUserId ? (
                                <Check className="ml-2 h-4 w-4" />
                              ) : (
                                <Copy className="ml-2 h-4 w-4 opacity-50" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>클릭하여 금액 복사</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleMarkPaid(summary)}
                          disabled={processingId === summary.seatUserId || markPaidMutation.isPending}
                          data-testid={`button-mark-paid-${summary.seatUserId}`}
                        >
                          {processingId === summary.seatUserId ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              처리 중
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              지급 확인
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center" data-testid="text-no-payments">
              <Wallet className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-semibold">지급 대기 없음</h3>
              <p className="mt-2 text-muted-foreground">
                현재 지급 예정인 요청이 없습니다
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
