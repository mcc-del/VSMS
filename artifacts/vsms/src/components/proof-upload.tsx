import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Paperclip } from "lucide-react";

interface ProofUploadProps {
  value: string | null;
  onChange: (objectPath: string | null) => void;
}

const ACCEPTED = ["image/", "application/pdf"];

// Optional proof of external volunteering — a photo or a letter (PDF).
export function ProofUpload({ value, onChange }: ProofUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!ACCEPTED.some((t) => file.type.startsWith(t))) {
      setError("Please upload an image or a PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File must be under 10 MB.");
      return;
    }
    setError(null);
    setIsUploading(true);
    try {
      const token = localStorage.getItem("vsms_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) {
        const err = (await urlRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Failed to get upload URL");
      }
      const { uploadURL, objectPath } = (await urlRes.json()) as {
        uploadURL: string;
        objectPath: string;
      };

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      setFileName(file.name);
      onChange(objectPath);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {value ? (
        <div className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
          <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="flex-1 truncate">{fileName ?? "Proof attached"}</span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setFileName(null);
            }}
            className="text-muted-foreground hover:text-foreground"
            data-testid="button-remove-proof"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          data-testid="button-upload-proof"
        >
          <Upload className="w-3.5 h-3.5 mr-1" />
          {isUploading ? "Uploading…" : "Attach proof (photo or PDF)"}
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
