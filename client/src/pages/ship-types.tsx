import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Rocket } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ShipType } from "@shared/schema";

const SHIP_CATEGORIES = [
  "frigate",
  "destroyer",
  "cruiser",
  "battlecruiser",
  "battleship",
  "capital",
  "industrial",
  "other",
];

const shipFormSchema = z.object({
  name: z.string().min(1, "Ship name is required"),
  category: z.string().min(1, "Category is required"),
  baseValue: z.coerce.number().min(0, "Base value must be 0 or higher"),
});

type ShipFormValues = z.infer<typeof shipFormSchema>;

export default function ShipTypes() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingShip, setEditingShip] = useState<ShipType | null>(null);
  const [deleteShip, setDeleteShip] = useState<ShipType | null>(null);

  const { data: ships, isLoading } = useQuery<ShipType[]>({
    queryKey: ["/api/ship-types"],
  });

  const form = useForm<ShipFormValues>({
    resolver: zodResolver(shipFormSchema),
    defaultValues: {
      name: "",
      category: "",
      baseValue: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ShipFormValues) => {
      return apiRequest("POST", "/api/ship-types", data);
    },
    onSuccess: () => {
      toast({ title: "Ship type added" });
      queryClient.invalidateQueries({ queryKey: ["/api/ship-types"] });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ShipFormValues }) => {
      return apiRequest("PATCH", `/api/ship-types/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Ship type updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/ship-types"] });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/ship-types/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Ship type deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/ship-types"] });
      setDeleteShip(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openCreateDialog = () => {
    setEditingShip(null);
    form.reset({ name: "", category: "", baseValue: 0 });
    setDialogOpen(true);
  };

  const openEditDialog = (ship: ShipType) => {
    setEditingShip(ship);
    form.reset({
      name: ship.name,
      category: ship.category,
      baseValue: ship.baseValue,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingShip(null);
    form.reset();
  };

  const onSubmit = (data: ShipFormValues) => {
    if (editingShip) {
      updateMutation.mutate({ id: editingShip.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Ship Types</h1>
          <p className="text-muted-foreground">
            Manage the ship types available for SRP requests
          </p>
        </div>
        <Button onClick={openCreateDialog} data-testid="button-add-ship">
          <Plus className="mr-2 h-4 w-4" />
          Add Ship Type
        </Button>
      </div>

      <Card data-testid="card-ships-table">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Ship Registry
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : ships && ships.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ship Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Base Value</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ships.map((ship) => (
                    <TableRow key={ship.id} data-testid={`row-ship-${ship.id}`}>
                      <TableCell className="font-medium">{ship.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{ship.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {ship.baseValue}M ISK
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(ship)}
                            data-testid={`button-edit-${ship.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteShip(ship)}
                            data-testid={`button-delete-${ship.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center" data-testid="text-no-ships">
              <Rocket className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-semibold">No ship types configured</h3>
              <p className="mt-2 text-muted-foreground">
                Add ship types to allow members to submit SRP requests
              </p>
              <Button onClick={openCreateDialog} className="mt-4" data-testid="button-add-first-ship">
                <Plus className="mr-2 h-4 w-4" />
                Add Ship Type
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent data-testid="dialog-ship-form">
          <DialogHeader>
            <DialogTitle>
              {editingShip ? "Edit Ship Type" : "Add Ship Type"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ship Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Drake" data-testid="input-ship-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-ship-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SHIP_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat.charAt(0).toUpperCase() + cat.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="baseValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base Value (in millions ISK)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 100"
                        data-testid="input-ship-value"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending} data-testid="button-save-ship">
                  {isPending ? "Saving..." : editingShip ? "Update" : "Add"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteShip} onOpenChange={(open) => !open && setDeleteShip(null)}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Ship Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteShip?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteShip && deleteMutation.mutate(deleteShip.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
