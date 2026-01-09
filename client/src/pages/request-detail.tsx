import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link, useSearch } from "wouter";
import { 
  ArrowLeft, 
  ExternalLink, 
  Clock, 
  User, 
  Ship,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Users,
  Calendar,
  MapPin
} from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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

function getStatusIcon(status: string) {
  switch (status) {
    case "approved": return <CheckCircle className="h-5 w-5 text-green-600" />;
    case "denied": return <XCircle className="h-5 w-5 text-red-600" />;
    case "processing": return <Clock className="h-5 w-5 text-blue-600" />;
    default: return <AlertCircle className="h-5 w-5 text-yellow-600" />;
  }
}

function formatIsk(amount: number): string {
  if (amount >= 1000000000) {
    return `${(amount / 1000000000).toFixed(2)}B ISK`;
  } else if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M ISK`;
  }
  return `${amount.toLocaleString()} ISK`;
}

function formatDate(date: string | Date | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ReviewAction = "approve" | "deny" | null;

export default function RequestDetail() {
  const [, params] = useRoute("/request/:id");
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const fromPage = searchParams.get("from");
  const { toast } = useToast();
  const { user } = useAuth();

  const [reviewDialog, setReviewDialog] = useState<{ open: boolean; action: ReviewAction }>({
    open: false,
    action: null,
  });
  const [reviewNote, setReviewNote] = useState("");
  const [payoutAmount, setPayoutAmount] = useState<number>(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculatedPayout, setCalculatedPayout] = useState<SrpCalculateResponse | null>(null);
  
  const handleBack = () => {
    if (fromPage === "all-requests") {
      setLocation("/all-requests");
    } else {
      setLocation("/my-requests");
    }
  };

  const { data: request, isLoading } = useQuery<SrpRequestWithDetails>({
    queryKey: [`/api/srp-requests/${params?.id}`],
    enabled: !!params?.id,
  });

  const { data: userRole } = useQuery<{ role: string }>({
    queryKey: ["/api/user/role"],
    enabled: !!user,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ 
      action, 
      note, 
      payout 
    }: { 
      action: "approve" | "deny"; 
      note: string; 
      payout?: number;
    }) => {
      return apiRequest("PATCH", `/api/srp-requests/${params?.id}/review`, {
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
      queryClient.invalidateQueries({ queryKey: ["/api/srp-requests"] });
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

  const openReviewDialog = (action: ReviewAction) => {
    setReviewDialog({ open: true, action });
    setPayoutAmount(0);
    setReviewNote("");
    setCalculatedPayout(null);
  };

  useEffect(() => {
    const calculatePayout = async () => {
      if (!reviewDialog.open || reviewDialog.action !== "approve" || !request) {
        return;
      }

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
  }, [reviewDialog.open, reviewDialog.action, request]);

  const closeDialog = () => {
    setReviewDialog({ open: false, action: null });
    setReviewNote("");
    setPayoutAmount(0);
    setCalculatedPayout(null);
  };

  const handleReview = () => {
    if (!reviewDialog.action) return;
    reviewMutation.mutate({
      action: reviewDialog.action,
      note: reviewNote,
      payout: reviewDialog.action === "approve" ? payoutAmount : undefined,
    });
  };

  const isAdmin = userRole?.role === "admin" || userRole?.role === "fc";
  const canReview = isAdmin && request?.status === "pending";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="text-center py-12" data-testid="text-not-found">
        <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
        <h2 className="mt-4 text-xl font-semibold">요청을 찾을 수 없음</h2>
        <p className="mt-2 text-muted-foreground">
          해당 요청이 존재하지 않거나 볼 권한이 없습니다.
        </p>
        <Button asChild className="mt-4">
          <Link href="/my-requests">나의 요청으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>뒤로 가기</TooltipContent>
        </Tooltip>
        <div className="flex-1">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">요청 상세</h1>
          <p className="text-muted-foreground">
            SRP 요청 ID: <span className="font-mono">{request.id.slice(0, 8)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon(request.status)}
          <Badge variant={getStatusVariant(request.status)} className="text-sm">
            {getStatusLabel(request.status).toUpperCase()}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-testid="card-request-info">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ship className="h-5 w-5" />
              손실 정보
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">함선 유형</Label>
                <p className="font-medium">
                  {request.shipData?.typeName || "알 수 없음"}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">그룹</Label>
                <p className="font-medium">{request.shipData?.groupName || "-"}</p>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">청구 금액</Label>
                <p className="font-mono text-lg font-bold">{formatIsk(request.iskAmount)}</p>
              </div>
              {request.payoutAmount && (
                <div>
                  <Label className="text-muted-foreground">지급 금액</Label>
                  <p className="font-mono text-lg font-bold text-green-600">
                    {formatIsk(request.payoutAmount)}
                  </p>
                </div>
              )}
            </div>
            <Separator />
            {request.fleet ? (
              <div className="space-y-3" data-testid="card-fleet-details">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-muted-foreground">플릿 정보</Label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-xs">작전명</Label>
                    <p className="font-medium">{request.fleet.operationName}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">FC</Label>
                    <p className="font-medium">{request.fleet.fcCharacterName}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-xs flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      일시
                    </Label>
                    <p className="text-sm">{formatDate(request.fleet.scheduledAt)}</p>
                  </div>
                  {request.fleet.location && (
                    <div>
                      <Label className="text-muted-foreground text-xs flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        장소
                      </Label>
                      <p className="text-sm">{request.fleet.location}</p>
                    </div>
                  )}
                </div>
                {request.fleet.description && (
                  <div>
                    <Label className="text-muted-foreground text-xs">설명</Label>
                    <p className="text-sm">{request.fleet.description}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">운용 유형</Label>
                  <p className="font-medium">{request.operationType === "solo" ? "솔로" : "플릿"}</p>
                </div>
              </div>
            )}
            <Separator />
            <div>
              <Label className="text-muted-foreground">손실 설명</Label>
              <p className="mt-1 text-sm">{request.lossDescription || "설명 없음"}</p>
            </div>
            <Separator />
            <div>
              <Label className="text-muted-foreground">킬메일</Label>
              <Button variant="outline" size="sm" asChild className="mt-2" data-testid="button-view-killmail">
                <a href={`https://zkillboard.com/kill/${request.killmailId}/`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  zKillboard에서 보기
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card data-testid="card-timeline">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                타임라인
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {request.processLogs && request.processLogs.length > 0 ? (
                [...request.processLogs].reverse().map((log, index) => {
                  const getLogStyle = (type: string) => {
                    switch (type) {
                      case "created": return { icon: <FileText className="h-4 w-4 text-primary" />, bg: "bg-primary/10", label: "요청 제출됨" };
                      case "approve": return { icon: <CheckCircle className="h-4 w-4 text-green-600" />, bg: "bg-green-100 dark:bg-green-900", label: "승인됨" };
                      case "deny": return { icon: <XCircle className="h-4 w-4 text-red-600" />, bg: "bg-red-100 dark:bg-red-900", label: "거부됨" };
                      case "pay": return { icon: <CheckCircle className="h-4 w-4 text-blue-600" />, bg: "bg-blue-100 dark:bg-blue-900", label: "지급 완료" };
                      default: return { icon: <Clock className="h-4 w-4 text-muted-foreground" />, bg: "bg-muted", label: type };
                    }
                  };
                  const style = getLogStyle(log.processType);
                  return (
                    <div key={index} className="flex items-start gap-4">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${style.bg}`}>
                        {style.icon}
                      </div>
                      <div>
                        <p className="font-medium">{style.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(log.occurredAt)}
                          {log.byMainChar && ` · ${log.byMainChar}`}
                        </p>
                        {log.note && (
                          <p className="mt-1 text-sm italic">"{log.note}"</p>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">타임라인 정보가 없습니다</p>
              )}
            </CardContent>
          </Card>

          {canReview && (
            <Card data-testid="card-admin-actions">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  관리자 작업
                </CardTitle>
                <CardDescription>
                  이 요청을 검토하고 승인하거나 거부하세요
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-3">
                <Button
                  onClick={() => openReviewDialog("approve")}
                  data-testid="button-approve"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  승인
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => openReviewDialog("deny")}
                  data-testid="button-deny"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  거부
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

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
                          {request?.operationType === "fleet" 
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
