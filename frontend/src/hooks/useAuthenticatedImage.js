import { useEffect, useRef, useState } from "react";
import api from "../services/api";

/**
 * Hook to securely fetch entity images as Blobs using the authenticated
 * Axios client (with Authorization: Bearer <token> in headers) and produce
 * an ephemeral Object URL.
 *
 * Automatically revokes previously created Object URLs when `src` changes
 * or when the consumer component unmounts.
 */
export function useAuthenticatedImage(src) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(Boolean(src));
  const [error, setError] = useState(false);
  const objectUrlRef = useRef(null);

  useEffect(() => {
    if (!src) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setBlobUrl(null);
      setLoading(false);
      setError(false);
      return;
    }

    // Already a local blob or inline data URI
    if (/^(blob:|data:)/i.test(src)) {
      if (objectUrlRef.current && objectUrlRef.current !== src) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setBlobUrl(src);
      setLoading(false);
      setError(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(false);

    api
      .get(src, { responseType: "blob" })
      .then((res) => {
        if (!isMounted) return;
        const newObjUrl = URL.createObjectURL(res.data);
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }
        objectUrlRef.current = newObjUrl;
        setBlobUrl(newObjUrl);
        setLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      isMounted = false;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [src]);

  return { blobUrl, loading, error };
}

export default useAuthenticatedImage;
