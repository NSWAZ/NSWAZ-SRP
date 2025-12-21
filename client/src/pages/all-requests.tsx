import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  ExternalLink, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock,
  Filter 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
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

function formatDate(date: string | Date | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  const { data: requests, isLoading } = useQuery<SrpRequestWithDetails[]>({
    queryKey: [`/api/srp-requests/all/${statusFilter}`],
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

  const openReviewDialog = (request: SrpRequestWithDetails, action: ReviewAction) => {
    setReviewDialog({ open: true, request, action });
    setPayoutAmount(request.iskAmount);
    setReviewNote("");
  };

  const closeDialog = () => {
    setReviewDialog({ open: false, request: null, action: null });
    setReviewNote("");
    setPayoutAmount(0);
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
        <h1 className="text-3xl font-bold" data-testid="text-page-title">All Requests</h1>
        <p className="text-muted-foreground">
          Review and manage SRP requests from alliance members
        </p>
      </div>

      <Card data-testid="card-filters">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Filter by status:</Label>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-status-filter">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-requests-table">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Request Queue
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
                    <TableHead>Date</TableHead>
                    <TableHead>Pilot</TableHead>
                    <TableHead>Ship</TableHead>
                    <TableHead>Fleet / FC</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow key={request.id} data-testid={`row-request-${request.id}`}>
                      <TableCell className="font-mono text-sm">
                        {formatDate(request.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {request.pilotName || "Unknown"}
                      </TableCell>
                      <TableCell>
                        {request.shipType?.name || "Unknown"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex flex-col">
                          <span>{request.fleetName || "-"}</span>
                          <span className="text-xs">{request.fcName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {request.iskAmount}M
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(request.status)}>
                          {request.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {request.status === "pending" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openReviewDialog(request, "approve")}
                                data-testid={`button-approve-${request.id}`}
                              >
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openReviewDialog(request, "deny")}
                                data-testid={`button-deny-${request.id}`}
                              >
                                <XCircle className="h-4 w-4 text-red-600" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            data-testid={`button-killmail-${request.id}`}
                          >
                            <a
                              href={request.killmailUrl}
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
                            data-testid={`button-details-${request.id}`}
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
              <Clock className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-semibold">No requests found</h3>
              <p className="mt-2 text-muted-foreground">
                {statusFilter !== "all" 
                  ? `No ${statusFilter} requests at this time`
                  : "The request queue is empty"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

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
