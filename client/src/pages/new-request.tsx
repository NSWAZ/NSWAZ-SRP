import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import { Loader2, HelpCircle, CheckCircle2, AlertCircle, ExternalLink, Calculator, Users, Calendar, MapPin } from "lucide-react";
import type { Fleet } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SrpCalculateResponse } from "@shared/schema";

interface ParsedKillmail {
  killmailId: number;
  shipTypeId: number;
  shipTypeName: string;
  shipTypeNameKo?: string;
  groupName?: string;
  iskValue: number;
  killmailTime: string;
  victimCharacterId?: number;
  victimCharacterName?: string;
  isOwnedCharacter?: boolean;
}

const formSchema = z.object({
  killmailUrl: z.string().url("올바른 URL을 입력해주세요").refine(
    (url) => url.includes("zkillboard.com"),
    "URL은 zKillboard에서 가져와야 합니다"
  ),
  operationType: z.enum(["solo", "fleet"]),
  isSpecialRole: z.boolean().default(false),
  fleetId: z.string().optional(),
  lossDescription: z.string().optional(),
}).refine(
  (data) => {
    if (data.operationType === "fleet") {
      return data.fleetId && data.fleetId.length > 0;
    }
    return true;
  },
  { message: "플릿 운용시 플릿 UUID를 입력해주세요", path: ["fleetId"] }
);

type FormValues = z.infer<typeof formSchema>;

export default function NewRequest() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [parsedData, setParsedData] = useState<ParsedKillmail | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [calculatedPayout, setCalculatedPayout] = useState<SrpCalculateResponse | null>(null);
  const [fleetData, setFleetData] = useState<Fleet | null>(null);
  const [fleetError, setFleetError] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fleetDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      killmailUrl: "",
      operationType: "fleet",
      isSpecialRole: false,
      fleetId: "",
      lossDescription: "",
    },
  });

  const operationType = form.watch("operationType");
  const isSpecialRole = form.watch("isSpecialRole");
  const killmailUrl = form.watch("killmailUrl");
  const fleetId = form.watch("fleetId");

  // Reset isSpecialRole when switching to solo
  useEffect(() => {
    if (operationType === "solo") {
      form.setValue("isSpecialRole", false);
      setFleetData(null);
      setFleetError(null);
    }
  }, [operationType, form]);

  // Fleet lookup with debounce
  useEffect(() => {
    if (fleetDebounceRef.current) {
      clearTimeout(fleetDebounceRef.current);
    }

    if (!fleetId || operationType !== "fleet") {
      setFleetData(null);
      setFleetError(null);
      return;
    }

    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(fleetId)) {
      setFleetData(null);
      setFleetError(null);
      return;
    }

    fleetDebounceRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/fleets/${fleetId}`, { credentials: "include" });
        if (response.ok) {
          const data = await response.json() as Fleet;
          setFleetData(data);
          setFleetError(null);
        } else {
          setFleetData(null);
          setFleetError("유효하지 않은 플릿 UUID입니다");
        }
      } catch {
        setFleetData(null);
        setFleetError("플릿 정보를 가져오는데 실패했습니다");
      }
    }, 300);

    return () => {
      if (fleetDebounceRef.current) {
        clearTimeout(fleetDebounceRef.current);
      }
    };
  }, [fleetId, operationType]);

  const parseMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/killmail/parse", { url });
      return response.json() as Promise<ParsedKillmail>;
    },
    onSuccess: (data) => {
      setParsedData(data);
      setParseError(null);
    },
    onError: (error: Error) => {
      setParsedData(null);
      setParseError(error.message || "킬메일 파싱에 실패했습니다");
      setCalculatedPayout(null);
    },
  });

  const calculateMutation = useMutation({
    mutationFn: async (data: { shipTypeId: number; iskValue: number; operationType: string; isSpecialRole: boolean; groupName?: string }) => {
      const response = await apiRequest("POST", "/api/killmail/calculate", data);
      return response.json() as Promise<SrpCalculateResponse>;
    },
    onSuccess: (data) => {
      setCalculatedPayout(data);
    },
    onError: () => {
      setCalculatedPayout(null);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      if (!parsedData) {
        throw new Error("킬메일 정보를 먼저 파싱해주세요");
      }
      if (data.operationType === "fleet" && !fleetData) {
        throw new Error("유효한 플릿 UUID를 입력해주세요");
      }
      return apiRequest("POST", "/api/srp-requests", {
        killmailId: parsedData.killmailId,
        shipTypeId: parsedData.shipTypeId,
        iskAmount: parsedData.iskValue,
        operationType: data.operationType,
        isSpecialRole: data.isSpecialRole ? 1 : 0,
        fleetId: data.operationType === "fleet" ? data.fleetId : null,
        lossDescription: data.lossDescription,
        victimCharacterId: parsedData.victimCharacterId,
        victimCharacterName: parsedData.victimCharacterName,
      });
    },
    onSuccess: () => {
      toast({
        title: "요청 제출 완료",
        description: "SRP 요청이 검토를 위해 제출되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/srp-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setLocation("/my-requests");
    },
    onError: (error: Error) => {
      toast({
        title: "오류",
        description: error.message || "요청 제출에 실패했습니다",
        variant: "destructive",
      });
    },
  });

  // Debounced killmail URL parsing
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!killmailUrl) {
      setParsedData(null);
      setParseError(null);
      setCalculatedPayout(null);
      return;
    }

    if (killmailUrl.includes("zkillboard.com/kill/")) {
      setParseError(null);
      debounceTimerRef.current = setTimeout(() => {
        parseMutation.mutate(killmailUrl);
      }, 500);
    } else {
      setParsedData(null);
      setCalculatedPayout(null);
      debounceTimerRef.current = setTimeout(() => {
        setParseError("유효한 zKillboard URL을 입력하세요 (예: https://zkillboard.com/kill/123456789/)");
      }, 500);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [killmailUrl]);

  // Calculate payout when parsed data or options change
  useEffect(() => {
    if (parsedData) {
      calculateMutation.mutate({
        shipTypeId: parsedData.shipTypeId,
        iskValue: parsedData.iskValue,
        operationType,
        isSpecialRole,
        groupName: parsedData.groupName,
      });
    }
  }, [parsedData, operationType, isSpecialRole]);

  const onSubmit = (data: FormValues) => {
    if (!parsedData) {
      toast({
        title: "오류",
        description: "킬메일 정보를 먼저 파싱해주세요",
        variant: "destructive",
      });
      return;
    }
    submitMutation.mutate(data);
  };

  const formatIsk = (value: number) => {
    return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ISK`;
  };

  const isParsing = parseMutation.isPending;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">새 SRP 요청</h1>
        <p className="text-muted-foreground">
          함선 손실에 대한 보상 요청을 제출하세요
        </p>
      </div>

      <Card data-testid="card-request-form">
        <CardHeader>
          <CardTitle>요청 세부사항</CardTitle>
          <CardDescription>
            킬메일 URL을 입력하면 함선 정보와 손실 금액이 자동으로 입력됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="killmailUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      킬메일 URL
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="mb-2">
                            <a 
                              href="https://forums.nisuwaz.com/t/srp/965" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-primary underline inline-flex items-center gap-1"
                            >
                              SRP 신청 방법 가이드
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            를 참고하여 킬메일 URL을 복사하세요.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="https://zkillboard.com/kill/..."
                          data-testid="input-killmail-url"
                          disabled={isParsing}
                          {...field}
                        />
                        {isParsing && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormDescription>
                      URL 입력 후 자동으로 정보를 가져옵니다
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isParsing && (
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="status-parsing">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>킬메일 정보 가져오는 중...</span>
                </div>
              )}

              {parseError && (
                <div className="flex items-center gap-2 text-destructive" data-testid="status-parse-error">
                  <AlertCircle className="h-4 w-4" />
                  <span>{parseError}</span>
                </div>
              )}

              {parsedData && (
                <Card className="bg-muted/50" data-testid="card-parsed-killmail">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-2 mb-3">
                      <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                      <span className="font-medium">킬메일 정보 확인됨</span>
                    </div>
                    <div className="grid gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">함선:</span>
                        <span className="font-medium" data-testid="text-parsed-ship">
                          {parsedData.shipTypeName}
                          {parsedData.groupName && (
                            <span className="text-muted-foreground ml-1">
                              ({parsedData.groupName})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">손실 금액:</span>
                        <span className="font-medium" data-testid="text-parsed-value">
                          {formatIsk(parsedData.iskValue)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">손실 시각:</span>
                        <span data-testid="text-parsed-time">
                          {new Date(parsedData.killmailTime).toLocaleString("ko-KR")}
                        </span>
                      </div>
                      {parsedData.victimCharacterName && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">피해자:</span>
                          <span data-testid="text-victim-character">
                            {parsedData.victimCharacterName}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {parsedData && parsedData.isOwnedCharacter === false && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive" data-testid="warning-not-owned-character">
                  <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <div className="font-medium">본인 캐릭터가 아닙니다</div>
                    <div className="text-muted-foreground">
                      본인 캐릭터의 로스만 SRP 신청하실 수 있습니다. 본인 캐릭터가 맞으시다면{" "}
                      <a 
                        href="https://forums.nisuwaz.com/t/seat/224" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary underline inline-flex items-center gap-1"
                      >
                        SeAT 알트 추가 가이드
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      를 참고하여 시트에 알트를 추가하신 후, 이 사이트 로그아웃 → 로그인을 해 주세요.
                    </div>
                  </div>
                </div>
              )}

              <FormField
                control={form.control}
                name="operationType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>운용 유형</FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="flex gap-4"
                        data-testid="radio-operation-type"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="fleet" id="fleet" data-testid="radio-fleet" />
                          <Label htmlFor="fleet" className="cursor-pointer">플릿</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="solo" id="solo" data-testid="radio-solo" />
                          <Label htmlFor="solo" className="cursor-pointer">솔로잉</Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormDescription>
                      {operationType === "solo" 
                        ? "솔로잉 로스는 25% 보상" 
                        : "플릿에서 발생한 로스는 50% 보상"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {operationType === "fleet" && (
                <>
                  <FormField
                    control={form.control}
                    name="fleetId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          플릿 UUID
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>FC에게 받은 플릿 UUID를 붙여넣으세요. UUID는 FC 도구에서 생성됩니다.</p>
                            </TooltipContent>
                          </Tooltip>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="예: 12345678-1234-1234-1234-123456789abc"
                            className="font-mono"
                            data-testid="input-fleet-uuid"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          FC에게 받은 플릿 UUID를 입력하세요
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {fleetError && (
                    <div className="flex items-center gap-2 text-destructive" data-testid="status-fleet-error">
                      <AlertCircle className="h-4 w-4" />
                      <span>{fleetError}</span>
                    </div>
                  )}

                  {fleetData && (
                    <Card className="bg-muted/50" data-testid="card-fleet-info">
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-2 mb-3">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                          <span className="font-medium">플릿 정보 확인됨</span>
                        </div>
                        <div className="grid gap-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">작전명:</span>
                            <span className="font-medium" data-testid="text-fleet-operation">
                              {fleetData.operationName}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">FC:</span>
                            <span data-testid="text-fleet-fc">
                              {fleetData.fcCharacterName}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">일시:</span>
                            <span data-testid="text-fleet-time">
                              {new Date(fleetData.scheduledAt).toLocaleString("ko-KR")}
                            </span>
                          </div>
                          {fleetData.location && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">장소:</span>
                              <span data-testid="text-fleet-location">{fleetData.location}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <FormField
                    control={form.control}
                    name="isSpecialRole"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start gap-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-special-role"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="cursor-pointer">
                            특수롤 (Logi, Tackle, Scout 등)
                          </FormLabel>
                          <FormDescription>
                            특수롤 수행시 50% 추가 보상
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </>
              )}

              <FormField
                control={form.control}
                name="lossDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>추가 내용 (선택)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="당시 상황에 대해 기술하고 싶은 내용이 있다면 자유롭게 적어주세요."
                        className="min-h-[100px] resize-none"
                        data-testid="textarea-description"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      (작성이 어려우신 경우 비워두셔도 좋습니다.)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {calculatedPayout && parsedData && (
                <Card className="bg-primary/5 border-primary/20" data-testid="card-calculated-payout">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Calculator className="h-5 w-5 text-primary" />
                      <span className="font-medium">예상 SRP 지급액</span>
                    </div>
                    <div className="text-2xl font-bold text-primary" data-testid="text-estimated-payout">
                      {formatIsk(calculatedPayout.estimatedPayout)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-2 space-y-1">
                      <div>
                        {operationType === "fleet" 
                          ? (calculatedPayout.breakdown.isSpecialRole ? "플릿 + 특수롤 (100%)" : "플릿 (50%)")
                          : calculatedPayout.breakdown.isSpecialShipClass 
                            ? "솔로잉 + 지원함급 보너스 (100%)" 
                            : "솔로잉 (25%)"
                        }
                      </div>
                      {(() => {
                        const { baseValue, operationMultiplier, finalAmount, maxPayout } = calculatedPayout.breakdown;
                        const calculatedAmount = baseValue * operationMultiplier;
                        if (finalAmount < calculatedAmount && maxPayout < calculatedAmount) {
                          const reductionPercent = Math.round((1 - finalAmount / calculatedAmount) * 100);
                          return (
                            <div className="text-amber-600 dark:text-amber-400">
                              함급별 총액 제한 (-{reductionPercent}%)
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={
                    submitMutation.isPending || 
                    !parsedData || 
                    isParsing || 
                    parsedData?.isOwnedCharacter === false ||
                    (operationType === "fleet" && !fleetData)
                  }
                  data-testid="button-submit"
                >
                  {submitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {submitMutation.isPending ? "제출 중..." : "요청 제출"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/my-requests")}
                  data-testid="button-cancel"
                >
                  취소
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
