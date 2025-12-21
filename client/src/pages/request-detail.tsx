import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { 
  ArrowLeft, 
  ExternalLink, 
  Clock, 
  User, 
  Ship,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { SrpRequestWithDetails } from "@shared/schema";

function getStatusVariant(status: string) {
  switch (status) {
    case "approved": return "default";
    case "denied": return "destructive";
    case "processing": return "secondary";
    default: return "outline";
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

function formatDate(date: string | Date | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-US", {
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
  const { toast } = useToast();
  const { user } = useAuth();

  const [reviewDialog, setReviewDialog] = useState<{ open: boolean; action: ReviewAction }>({
    open: false,
    action: null,
  });
  const [reviewNote, setReviewNote] = useState("");
  const [payoutAmount, setPayoutAmount] = useState<number>(0);

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
        title: "Request Updated",
        description: `Request has been ${reviewDialog.action === "approve" ? "approved" : "denied"}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/srp-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update request",
        variant: "destructive",
      });
    },
  });

  const openReviewDialog = (action: ReviewAction) => {
    setReviewDialog({ open: true, action });
    setPayoutAmount(request?.iskAmount || 0);
    setReviewNote("");
  };

  const closeDialog = () => {
    setReviewDialog({ open: false, action: null });
    setReviewNote("");
    setPayoutAmount(0);
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
        <h2 className="mt-4 text-xl font-semibold">Request Not Found</h2>
        <p className="mt-2 text-muted-foreground">
          This request doesn't exist or you don't have permission to view it.
        </p>
        <Button asChild className="mt-4">
          <Link href="/my-requests">Back to My Requests</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/my-requests")} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Request Details</h1>
          <p className="text-muted-foreground">
            SRP Request ID: <span className="font-mono">{request.id.slice(0, 8)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon(request.status)}
          <Badge variant={getStatusVariant(request.status)} className="text-sm">
            {request.status.toUpperCase()}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-testid="card-request-info">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ship className="h-5 w-5" />
              Loss Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Ship Type</Label>
                <p className="font-medium">{request.shipType?.name || "Unknown"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Category</Label>
                <p className="font-medium">{request.shipType?.category || "-"}</p>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Claimed Amount</Label>
                <p className="font-mono text-lg font-bold">{request.iskAmount}M ISK</p>
              </div>
              {request.payoutAmount && (
                <div>
                  <Label className="text-muted-foreground">Payout Amount</Label>
                  <p className="font-mono text-lg font-bold text-green-600">
                    {request.payoutAmount}M ISK
                  </p>
                </div>
              )}
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Fleet Name</Label>
                <p className="font-medium">{request.fleetName || "-"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">FC Name</Label>
                <p className="font-medium">{request.fcName || "-"}</p>
              </div>
            </div>
            <Separator />
            <div>
              <Label className="text-muted-foreground">Loss Description</Label>
              <p className="mt-1 text-sm">{request.lossDescription || "No description provided"}</p>
            </div>
            <Separator />
            <div>
              <Label className="text-muted-foreground">Killmail</Label>
              <Button variant="outline" size="sm" asChild className="mt-2" data-testid="button-view-killmail">
                <a href={request.killmailUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View on zKillboard
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
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Request Submitted</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(request.createdAt)}
                  </p>
                </div>
              </div>
              {request.reviewedAt && (
                <div className="flex items-start gap-4">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    request.status === "approved" ? "bg-green-100" : "bg-red-100"
                  }`}>
                    {request.status === "approved" ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">
                      {request.status === "approved" ? "Approved" : "Denied"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(request.reviewedAt)}
                    </p>
                    {request.reviewerNote && (
                      <p className="mt-1 text-sm italic">"{request.reviewerNote}"</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {canReview && (
            <Card data-testid="card-admin-actions">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Admin Actions
                </CardTitle>
                <CardDescription>
                  Review this request and approve or deny it
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-3">
                <Button
                  onClick={() => openReviewDialog("approve")}
                  data-testid="button-approve"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => openReviewDialog("deny")}
                  data-testid="button-deny"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Deny
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
              {reviewDialog.action === "approve" ? "Approve" : "Deny"} Request
            </DialogTitle>
            <DialogDescription>
              {reviewDialog.action === "approve"
                ? "Set the payout amount and add any notes for this approval."
                : "Provide a reason for denying this request."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {reviewDialog.action === "approve" && (
              <div className="space-y-2">
                <Label htmlFor="payout">Payout Amount (in millions ISK)</Label>
                <Input
                  id="payout"
                  type="number"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(Number(e.target.value))}
                  data-testid="input-payout-amount"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="note">
                {reviewDialog.action === "approve" ? "Notes (optional)" : "Denial Reason"}
              </Label>
              <Textarea
                id="note"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder={
                  reviewDialog.action === "approve"
                    ? "Add any additional notes..."
                    : "Explain why this request is being denied..."
                }
                className="min-h-[80px]"
                data-testid="textarea-review-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-review">
              Cancel
            </Button>
            <Button
              onClick={handleReview}
              disabled={reviewMutation.isPending || (reviewDialog.action === "deny" && !reviewNote)}
              variant={reviewDialog.action === "approve" ? "default" : "destructive"}
              data-testid="button-confirm-review"
            >
              {reviewMutation.isPending ? "Processing..." : 
                reviewDialog.action === "approve" ? "Approve" : "Deny"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
