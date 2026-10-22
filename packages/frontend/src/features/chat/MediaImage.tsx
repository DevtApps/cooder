import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { api } from '@/services/api';

/** Loads an authenticated URL into an object URL the <img> can use. */
function useAuthedObjectUrl(url: string) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let created: string | null = null;
    setObjectUrl(null);
    setFailed(false);
    void api
      .download(url, { signal: controller.signal })
      .then((response) => response.blob())
      .then((blob) => {
        if (blob.size === 0) throw new Error('Empty image response');
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  return { objectUrl, failed };
}

export function MediaImage({ url, alt }: { url: string; alt: string }) {
  const { objectUrl, failed } = useAuthedObjectUrl(url);

  if (failed) {
    return (
      <div className="flex h-24 w-36 items-center justify-center gap-2 rounded-lg border border-border text-xs text-muted-foreground">
        <ImageOff className="h-4 w-4" aria-hidden />
        Unavailable
      </div>
    );
  }
  if (!objectUrl) {
    return (
      <div className="h-24 w-36 animate-pulse rounded-lg bg-muted" aria-label={`Loading ${alt}`} />
    );
  }
  return (
    <a href={objectUrl} target="_blank" rel="noreferrer" className="block">
      <img
        src={objectUrl}
        alt={alt}
        className="max-h-80 max-w-full rounded-lg border border-border object-contain"
      />
    </a>
  );
}
