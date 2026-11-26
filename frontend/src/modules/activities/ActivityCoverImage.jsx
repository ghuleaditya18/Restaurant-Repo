import { useState } from "react";
import { Compass } from "lucide-react";
import AuthenticatedImage from "../../components/AuthenticatedImage";
import { resolveImageUrl } from "../../utils/mediaUtils";

export default function ActivityCoverImage({
  src,
  alt = "Activity photo",
  className = "h-full w-full object-cover",
}) {
  const [failed, setFailed] = useState(false);

  const placeholder = (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-500/15 via-stone-200/70 to-stone-300/40 dark:from-[#30251C] dark:via-[#172130] dark:to-[#0D1420] text-amber-700 dark:text-[#FFB02E]">
      <Compass size={26} />
    </div>
  );

  if (!src || failed) {
    return placeholder;
  }

  if (src.startsWith("blob:") || src.startsWith("data:")) {
    return <img src={src} alt={alt} className={className} />;
  }

  const resolved = resolveImageUrl(src);
  const needsAuthFetch =
    typeof src === "string" && (src.startsWith("/api/") || resolved.includes("/api/"));

  if (needsAuthFetch) {
    return (
      <AuthenticatedImage
        src={resolved}
        alt={alt}
        className={className}
        fallback={placeholder}
      />
    );
  }

  return (
    <img
      src={resolved}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
