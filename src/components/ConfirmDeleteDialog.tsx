"use client";

/**
 * ConfirmDeleteDialog — minimal confirm step before DELETE /api/items/:id.
 *
 * Controlled: parent owns open state and the item.
 */

import { useState } from "react";
import { toast } from "sonner";

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
import { deleteItem } from "@/lib/api";
import type { Item } from "@/lib/db/schema";

type Props = {
  item: Item | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
};

export function ConfirmDeleteDialog({
  item,
  open,
  onOpenChange,
  onDeleted,
}: Props) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!item || submitting) return;
    setSubmitting(true);
    try {
      await deleteItem(item.id);
      toast.success(`Removed: ${item.name ?? `SKU ${item.sku}`}`);
      onDeleted?.();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete item</AlertDialogTitle>
          <AlertDialogDescription>
            {item
              ? `Stop watching ${item.name ?? `SKU ${item.sku}`}? Event history is also removed.`
              : "Stop watching this item?"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="sm" disabled={submitting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
