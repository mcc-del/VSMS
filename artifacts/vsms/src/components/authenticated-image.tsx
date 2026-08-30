import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { ImageOff } from "lucide-react";

type AuthenticatedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  objectPath: string;
};

export function AuthenticatedImage({
  objectPath,
  alt,
  className,
  ...props
}: AuthenticatedImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;

    async function loadImage() {
      setSrc(null);
      setFailed(false);
      try {
        const token = localStorage.getItem("vsms_token");
        const response = await fetch(`/api/storage${objectPath}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Image request failed with ${response.status}`);
        objectUrl = URL.createObjectURL(await response.blob());
        setSrc(objectUrl);
      } catch (error) {
        if (!controller.signal.aborted) setFailed(true);
      }
    }

    void loadImage();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectPath]);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-muted text-muted-foreground ${className ?? ""}`}
        role="img"
        aria-label={`${alt || "Event image"} unavailable`}
      >
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }

  if (!src) {
    return <div className={`animate-pulse bg-muted ${className ?? ""}`} aria-hidden="true" />;
  }

  return <img src={src} alt={alt} className={className} {...props} />;
}