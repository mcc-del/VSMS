import { useListSchools } from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SchoolSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  testId?: string;
}

/**
 * School picker backed by the curated, admin-approved school list. Fixed list
 * only — no free text or requests — so school data stays clean.
 */
export function SchoolSelect({
  value,
  onValueChange,
  placeholder = "Select school",
  testId = "select-school",
}: SchoolSelectProps) {
  const { data: schools } = useListSchools();
  const names = (schools ?? []).map((s) => s.name);
  // Keep a value that isn't in the list (e.g. an older account's school) selectable.
  const extra = value && !names.includes(value) ? [value] : [];

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger data-testid={testId}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {extra.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
        {(schools ?? []).map((s) => (
          <SelectItem key={s.schoolId} value={s.name}>
            {s.name}
            {s.city ? <span className="text-muted-foreground"> · {s.city}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
