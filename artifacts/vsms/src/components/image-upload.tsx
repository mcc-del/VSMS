import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Image } from "lucide-react";

interface ImageUploadProps {
  value: string | null;
  onChange: (objectPath: string | null) => void;
}

export function ImageUpload({ value, onChange }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB.");
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });

      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) throw new Error("Upload failed");
      onChange(objectPath);
    } catch (e: any) {
      setError(e.message ?? "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  const previewSrc = value ? `/api/storage${value}` : null;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {previewSrc ? (
        <div className="relative inline-block">
          <img
            src={previewSrc}
            alt="Event image"
            className="w-full max-h-48 object-cover rounded-lg border"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center cursor-pointer hover:border-muted-foreground/60 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <Image className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Click to upload an event image</p>
          <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 5 MB</p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {isUploading && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Upload className="w-3 h-3 animate-bounce" /> Uploading...
        </p>
      )}

      {!previewSrc && !isUploading && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          <Upload className="w-3 h-3 mr-1" /> Choose Image
        </Button>
      )}
    </div>
  );
}
