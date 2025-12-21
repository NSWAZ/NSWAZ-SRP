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
  });
}

export default function MyRequests() {
  const { data: requests, isLoading } = useQuery<SrpRequestWithDetails[]>({
    queryKey: ["/api/srp-requests/my"],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">My Requests</h1>
          <p className="text-muted-foreground">
            Track the status of your SRP submissions
          </p>
        </div>
        <Button asChild data-testid="button-new-request">
          <Link href="/new-request">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Request
          </Link>
        </Button>
      </div>

      <Card data-testid="card-requests-table">
        <CardHeader>
          <CardTitle>Request History</CardTitle>
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
                    <TableHead>Date</TableHead>
                    <TableHead>Ship</TableHead>
                    <TableHead>Fleet</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Payout</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id} data-testid={`row-request-${request.id}`}>
                      <TableCell className="font-mono text-sm">
                        {formatDate(request.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {request.shipType?.name || "Unknown"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {request.fleetName || "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {request.iskAmount}M
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {request.payoutAmount ? `${request.payoutAmount}M` : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(request.status)}>
                          {request.status}
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
              <h3 className="mt-4 text-lg font-semibold">No requests yet</h3>
              <p className="mt-2 text-muted-foreground">
                Submit your first SRP request to get started
              </p>
              <Button asChild className="mt-4" data-testid="button-submit-first">
                <Link href="/new-request">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Submit Request
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
