import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import { Loader2, HelpCircle } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ShipType } from "@shared/schema";

const formSchema = z.object({
  shipTypeId: z.string().min(1, "Please select a ship type"),
  killmailUrl: z.string().url("Please enter a valid URL").refine(
    (url) => url.includes("zkillboard.com") || url.includes("esi.evetech.net"),
    "URL must be from zKillboard or EVE ESI"
  ),
  iskAmount: z.coerce.number().min(1, "ISK amount must be at least 1 million"),
  fleetName: z.string().min(1, "Fleet name is required"),
  fcName: z.string().min(1, "FC name is required"),
  lossDescription: z.string().min(10, "Please provide a description of at least 10 characters"),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewRequest() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: shipTypes, isLoading: shipsLoading } = useQuery<ShipType[]>({
    queryKey: ["/api/ship-types"],
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      shipTypeId: "",
      killmailUrl: "",
      iskAmount: 0,
      fleetName: "",
      fcName: "",
      lossDescription: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      return apiRequest("POST", "/api/srp-requests", data);
    },
    onSuccess: () => {
      toast({
        title: "Request Submitted",
        description: "Your SRP request has been submitted for review.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/srp-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setLocation("/my-requests");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit request",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormValues) => {
    mutation.mutate(data);
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">New SRP Request</h1>
        <p className="text-muted-foreground">
          Submit a request for ship replacement reimbursement
        </p>
      </div>

      <Card data-testid="card-request-form">
        <CardHeader>
          <CardTitle>Request Details</CardTitle>
          <CardDescription>
            Fill out all required fields to submit your SRP claim. Make sure to provide accurate
            information to speed up the approval process.
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
                      Killmail URL
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Find your loss on zkillboard.com and copy the URL</p>
                        </TooltipContent>
                      </Tooltip>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://zkillboard.com/kill/..."
                        data-testid="input-killmail-url"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Link from zKillboard or EVE ESI
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="shipTypeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ship Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-ship-type">
                          <SelectValue placeholder="Select the ship you lost" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {shipsLoading ? (
                          <SelectItem value="loading" disabled>Loading...</SelectItem>
                        ) : shipTypes && shipTypes.length > 0 ? (
                          shipTypes.map((ship) => (
                            <SelectItem key={ship.id} value={ship.id} data-testid={`option-ship-${ship.id}`}>
                              {ship.name} ({ship.category})
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>No ships available</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="iskAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loss Value (in millions ISK)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 150 for 150M ISK"
                        data-testid="input-isk-amount"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Total value of your loss including hull and fittings
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="fleetName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fleet Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Stratop Defense Fleet"
                          data-testid="input-fleet-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="fcName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>FC Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Fleet commander name"
                          data-testid="input-fc-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="lossDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loss Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the circumstances of your loss..."
                        className="min-h-[100px] resize-none"
                        data-testid="textarea-description"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Briefly explain how the ship was lost during the operation
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={mutation.isPending}
                  data-testid="button-submit"
                >
                  {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {mutation.isPending ? "Submitting..." : "Submit Request"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/my-requests")}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
