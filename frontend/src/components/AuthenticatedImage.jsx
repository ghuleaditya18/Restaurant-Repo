import { useAuthenticatedImage } from "../hooks/useAuthenticatedImage";

/**
 * Renders an image fetched securely via the authenticated API client
 * using an ephemeral Blob Object URL.
 * Automatically handles Object URL creation, replacement, and unmount revocation.
 * Falls back to `fallback` when image is absent or encounters a fetch/render error.
 */
export default function AuthenticatedImage({
  src,
  alt = "",
  className = "h-full w-full object-cover",
  fallback = null,
  style = undefined,
}) {
  const { blobUrl, loading, error } = useAuthenticatedImage(src);

  if (!src || error || (!blobUrl && !loading)) {
    return fallback ? <>{fallback}</> : null;
  }

  if (loading && !blobUrl) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
      style={style}
    />
  );
}
