import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSchools,
  useRequestSchool,
  getListSchoolsQueryKey,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const REQUEST_VALUE = "__request__";

interface SchoolSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  testId?: string;
}

/**
 * School picker backed by the curated, admin-approved school list. If a user
 * can't find their school, they can request it — the request lands in the admin
 * queue and the chosen value is set immediately so sign-up isn't blocked.
 */
export function SchoolSelect({
  value,
  onValueChange,
  placeholder = "Select school",
  testId = "select-school",
}: SchoolSelectProps) {
  const { data: schools } = useListSchools();
  const requestSchool = useRequestSchool();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");

  // If the current value isn't in the approved list (e.g. a just-requested,
  // still-pending school), show it as a selectable option so it stays chosen.
  const names = (schools ?? []).map((s) => s.name);
  const extra = value && !names.includes(value) ? [value] : [];

  const handleSelect = (v: string) => {
    if (v === REQUEST_VALUE) {
      setDialogOpen(true);
      return;
    }
    onValueChange(v);
  };

  const submitRequest = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast({ title: "Enter the full school name", variant: "destructive" });
      return;
    }
    try {
      await requestSchool.mutateAsync({ data: { name: trimmed, city: city.trim() || undefined } });
      await qc.invalidateQueries({ queryKey: getListSchoolsQueryKey() });
      onValueChange(trimmed);
      setDialogOpen(false);
      setName("");
      setCity("");
      toast({
        title: "School submitted",
        description: "We'll review it shortly. You can continue for now.",
      });
    } catch {
      toast({ title: "Could not submit", description: "Please try again.", variant: "destructive" });
    }
  };

  return (
    <>
      <Select value={value} onValueChange={handleSelect}>
        <SelectTrigger data-testid={testId}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {extra.map((s) => (
            <SelectItem key={s} value={s}>
              {s} <span className="text-muted-foreground">(pending review)</span>
            </SelectItem>
          ))}
          {(schools ?? []).map((s) => (
            <SelectItem key={s.schoolId} value={s.name}>
              {s.name}
              {s.city ? <span className="text-muted-foreground"> · {s.city}</span> : null}
            </SelectItem>
          ))}
          <SelectItem value={REQUEST_VALUE} className="text-primary">
            + Can't find your school? Request it
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a school</DialogTitle>
            <DialogDescription>
              Tell us the school's full, correctly-spelled name. An admin reviews new schools so the
              list stays clean.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="req-school-name">School name</Label>
              <Input
                id="req-school-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Evergreen Middle School"
                data-testid="input-request-school-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-school-city">City (optional)</Label>
              <Input
                id="req-school-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Redmond"
                data-testid="input-request-school-city"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitRequest}
              disabled={requestSchool.isPending}
              data-testid="button-submit-school-request"
            >
              {requestSchool.isPending ? "Submitting…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
