"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Subject } from "@/lib/data";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/** Create a new subject (subject = null) or rename an existing one. */
export function SubjectDialog({
  open,
  onOpenChange,
  subject,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject?: Subject | null;
  onSaved: (subject: Subject) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setName(subject?.name ?? "");
  }, [open, subject]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    const sb = getSupabaseBrowser();
    const res = subject
      ? await sb.from("subjects").update({ name: trimmed }).eq("id", subject.id).select().single()
      : await sb.from("subjects").insert({ name: trimmed }).select().single();
    setBusy(false);
    if (res.error) {
      toast.error(subject ? "Could not rename the subject." : "Could not create the subject.");
      return;
    }
    onSaved(res.data as Subject);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{subject ? "Rename subject" : "New subject"}</DialogTitle>
            <DialogDescription>
              {subject
                ? "Choose a new name for this subject."
                : "Group the PDFs for one subject together, for example “Biology – Cells”."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="subject-name">Name</Label>
            <Input
              id="subject-name"
              autoFocus
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. IPA – Sistem Pencernaan"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Loader2 className="animate-spin" />}
              {subject ? "Save" : "Create subject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Deletes a subject with all its documents, notes, quizzes and stored PDFs. */
export function DeleteSubjectDialog({
  subject,
  onOpenChange,
  onDeleted,
}: {
  subject: Subject | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!subject) return;
    setBusy(true);
    const sb = getSupabaseBrowser();
    const { data: docs } = await sb.from("documents").select("storage_path").eq("subject_id", subject.id);
    const paths = (docs ?? []).map((d) => d.storage_path).filter(Boolean) as string[];
    if (paths.length) await sb.storage.from("pdfs").remove(paths);
    const { error } = await sb.from("subjects").delete().eq("id", subject.id);
    setBusy(false);
    if (error) {
      toast.error("Could not delete the subject.");
      return;
    }
    toast.success(`Deleted “${subject.name}”.`);
    onDeleted(subject.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={!!subject} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{subject?.name}”?</DialogTitle>
          <DialogDescription>
            This permanently deletes its PDFs, notes, quizzes and progress. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={remove} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Delete subject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
