import { useState } from "react";
import { Paperclip } from "lucide-react";

// Opens an uploaded proof (image or PDF) in a new tab. The storage endpoint
// requires an auth header, so we fetch it with the token and open a blob URL
// rather than linking directly.
export function ProofLink({ objectPath }: { objectPath: string }) {
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    try {
      const token = localStorage.getItem("vsms_token");
      const res = await fetch(`/api/storage/objects/${objectPath}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Could not load proof");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      // Revoke a little later so the new tab has time to load it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      // Silent — the button just won't open anything.
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
      data-testid="link-view-proof"
    >
      <Paperclip className="w-3 h-3" /> {loading ? "Opening…" : "View proof"}
    </button>
  );
}
