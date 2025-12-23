import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  ExternalLink, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock,
  Filter,
  Users,
  User
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SrpRequestWithDetails, SrpCalculateResponse } from "@shared/schema";

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
    hour: "2-digit",
    minute: "2-digit",
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

type ReviewAction = "approve" | "deny" | null;

export default function AllRequests() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reviewDialog, setReviewDialog] = useState<{
    open: boolean;
    request: SrpRequestWithDetails | null;
    action: ReviewAction;
  }>({ open: false, request: null, action: null });
  const [reviewNote, setReviewNote] = useState("");
  const [payoutAmount, setPayoutAmount] = useState<number>(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculatedPayout, setCalculatedPayout] = useState<SrpCalculateResponse | null>(null);

  const { data: requests, isLoading } = useQuery<SrpRequestWithDetails[]>({
    queryKey: [`/api/srp-requests/all/${statusFilter}`],
    refetchOnMount: "always",
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ 
      id, 
      action, 
      note, 
      payout 
    }: { 
      id: string; 
      action: "approve" | "deny"; 
      note: string; 
      payout?: number;
    }) => {
      return apiRequest("PATCH", `/api/srp-requests/${id}/review`, {
        status: action === "approve" ? "approved" : "denied",
        reviewerNote: note,
        payoutAmount: action === "approve" ? payout : undefined,
      });
    },
    onSuccess: () => {
      toast({
        title: "요청 업데이트 완료",
        description: `요청이 ${reviewDialog.action === "approve" ? "승인" : "거부"}되었습니다.`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/srp-requests/all/${statusFilter}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "오류",
        description: error.message || "요청 업데이트에 실패했습니다",
        variant: "destructive",
      });
    },
  });

  const openReviewDialog = (request: SrpRequestWithDetails, action: ReviewAction) => {
    setReviewDialog({ open: true, request, action });
    setPayoutAmount(0);
    setReviewNote("");
    setCalculatedPayout(null);
  };

  useEffect(() => {
    const calculatePayout = async () => {
      if (!reviewDialog.open || reviewDialog.action !== "approve" || !reviewDialog.request) {
        return;
      }

      const request = reviewDialog.request;
      setIsCalculating(true);
      
      try {
        const response = await fetch("/api/killmail/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            shipTypeId: request.shipTypeId,
            iskValue: request.iskAmount,
            operationType: request.operationType,
            isSpecialRole: request.isSpecialRole || false,
            groupName: request.shipData?.groupName || null,
          }),
        });

        if (response.ok) {
          const data: SrpCalculateResponse = await response.json();
          setPayoutAmount(Math.round(data.estimatedPayout));
          setCalculatedPayout(data);
        } else {
          setPayoutAmount(request.iskAmount);
          setCalculatedPayout(null);
        }
      } catch (error) {
        console.error("Failed to calculate payout:", error);
        setPayoutAmount(request.iskAmount);
        setCalculatedPayout(null);
      } finally {
        setIsCalculating(false);
      }
    };

    calculatePayout();
  }, [reviewDialog.open, reviewDialog.action, reviewDialog.request]);

  const closeDialog = () => {
    setReviewDialog({ open: false, request: null, action: null });
    setReviewNote("");
    setPayoutAmount(0);
    setCalculatedPayout(null);
  };

  const handleReview = () => {
    if (!reviewDialog.request || !reviewDialog.action) return;
    reviewMutation.mutate({
      id: reviewDialog.request.id,
      action: reviewDialog.action,
      note: reviewNote,
      payout: reviewDialog.action === "approve" ? payoutAmount : undefined,
    });
  };

  const filteredRequests = requests;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">전체 요청</h1>
        <p className="text-muted-foreground">
          얼라이언스 멤버의 SRP 요청을 검토하고 관리하세요
        </p>
      </div>

      <Card data-testid="card-filters">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">상태 필터:</Label>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-status-filter">
                <SelectValue placeholder="전체 상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="pending">대기 중</SelectItem>
                <SelectItem value="processing">처리 중</SelectItem>
                <SelectItem value="approved">승인됨</SelectItem>
                <SelectItem value="denied">거부됨</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-requests-table">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            요청 대기열
          </CardTitle>
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
          ) : filteredRequests && filteredRequests.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>요청 날짜</TableHead>
                    <TableHead>파일럿</TableHead>
                    <TableHead>로스 함선</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>함대 / FC</TableHead>
                    <TableHead className="text-right">로스 금액</TableHead>
                    <TableHead className="text-right">지급 금액</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow key={request.id} data-testid={`row-request-${request.id}`}>
                      <TableCell className="font-mono text-sm">
                        {formatDate(request.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {request.pilotName || "알 수 없음"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <img 
                            src={`https://images.evetech.net/types/${request.shipTypeId}/icon?size=32`}
                            alt=""
                            className="h-6 w-6"
                          />
                          <span>{request.shipData?.typeName || "알 수 없음"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={request.operationType === "fleet" ? "secondary" : "outline"} 
                          className={`text-xs ${request.operationType === "solo" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800" : ""}`}
                        >
                          {request.operationType === "fleet" ? (
                            <><Users className="h-3 w-3 mr-1" />플릿</>
                          ) : (
                            <><User className="h-3 w-3 mr-1" />솔로</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex flex-col">
                          <span>{request.fleet?.operationName || "-"}</span>
                          <span className="text-xs">{request.fleet?.fcCharacterName || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatIsk(request.iskAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {request.payoutAmount ? (
                          <span className="text-green-600 dark:text-green-400">{formatIsk(request.payoutAmount)}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(request.status)}>
                          {getStatusLabel(request.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {request.status === "pending" && (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openReviewDialog(request, "approve")}
                                    data-testid={`button-approve-${request.id}`}
                                  >
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>승인</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openReviewDialog(request, "deny")}
                                    data-testid={`button-deny-${request.id}`}
                                  >
                                    <XCircle className="h-4 w-4 text-red-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>거부</TooltipContent>
                              </Tooltip>
                            </>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                                data-testid={`button-killmail-${request.id}`}
                              >
                                <a
                                  href={`https://zkillboard.com/kill/${request.killmailId}/`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>zKillboard에서 보기</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                                data-testid={`button-details-${request.id}`}
                              >
                                <Link href={`/request/${request.id}?from=all-requests`}>
                                  <FileText className="h-4 w-4" />
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>상세 보기</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center" data-testid="text-no-requests">
              <Clock className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-semibold">요청 없음</h3>
              <p className="mt-2 text-muted-foreground">
                {statusFilter !== "all" 
                  ? `현재 ${getStatusLabel(statusFilter)} 요청이 없습니다`
                  : "요청 대기열이 비어있습니다"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={reviewDialog.open} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent data-testid="dialog-review">
          <DialogHeader>
            <DialogTitle>
              요청 {reviewDialog.action === "approve" ? "승인" : "거부"}
            </DialogTitle>
            <DialogDescription>
              {reviewDialog.action === "approve"
                ? "지급 금액을 설정하고 메모를 추가하세요."
                : "거부 사유를 입력해주세요."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {reviewDialog.action === "approve" && (
              <div className="space-y-3">
                {isCalculating ? (
                  <div className="flex items-center justify-center py-4">
                    <span className="text-sm text-muted-foreground">SRP 금액 계산 중...</span>
                  </div>
                ) : (
                  <>
                    {calculatedPayout && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {reviewDialog.request?.operationType === "fleet" 
                            ? (calculatedPayout.breakdown.isSpecialRole ? "플릿 + 특수롤 (100%)" : "플릿 (50%)")
                            : calculatedPayout.breakdown.isSpecialShipClass 
                              ? "솔로잉 + 지원함급 (100%)" 
                              : "솔로잉 (25%)"
                          }
                          {(() => {
                            const { baseValue, operationMultiplier, finalAmount, maxPayout } = calculatedPayout.breakdown;
                            const calculatedAmount = baseValue * operationMultiplier;
                            if (finalAmount < calculatedAmount && maxPayout < calculatedAmount) {
                              const reductionPercent = Math.round((1 - finalAmount / calculatedAmount) * 100);
                              return <span className="text-amber-600 dark:text-amber-400 ml-2">함급 제한 -{reductionPercent}%</span>;
                            }
                            return null;
                          })()}
                        </span>
                      </div>
                    )}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="payout">지급 금액</Label>
                        <span className="text-lg font-bold text-primary">{formatIsk(payoutAmount)}</span>
                      </div>
                      <Input
                        id="payout"
                        type="number"
                        value={payoutAmount}
                        onChange={(e) => setPayoutAmount(Number(e.target.value))}
                        disabled={isCalculating}
                        className="font-mono"
                        data-testid="input-payout-amount"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="note">
                {reviewDialog.action === "approve" ? "메모 (선택사항)" : "거부 사유"}
              </Label>
              <Textarea
                id="note"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder={
                  reviewDialog.action === "approve"
                    ? "추가 메모를 작성하세요..."
                    : "이 요청을 거부하는 이유를 설명해주세요..."
                }
                className="min-h-[80px]"
                data-testid="textarea-review-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-review">
              취소
            </Button>
            <Button
              onClick={handleReview}
              disabled={reviewMutation.isPending || (reviewDialog.action === "deny" && !reviewNote)}
              variant={reviewDialog.action === "approve" ? "default" : "destructive"}
              data-testid="button-confirm-review"
            >
              {reviewMutation.isPending ? "처리 중..." : 
                reviewDialog.action === "approve" ? "승인" : "거부"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
