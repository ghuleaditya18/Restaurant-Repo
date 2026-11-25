import { useState } from "react";
import { Building2 } from "lucide-react";
import AuthenticatedImage from "../../components/AuthenticatedImage";
import { resolveImageUrl } from "../../utils/mediaUtils";

export default function VillaCoverImage({
  src,
  fallbackSrc = "/assets/villas/garden-pavilion.jpg",
  alt = "Property cover",
  className = "h-full w-full object-cover",
}) {
  const [staticFailed, setStaticFailed] = useState(false);

  const effectiveSrc = src || fallbackSrc;

  if (!effectiveSrc || (staticFailed && !src)) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-500/20 via-stone-200/60 to-stone-300/40 dark:from-[#30251C] dark:via-[#172130] dark:to-[#0D1420] text-amber-700 dark:text-[#FFB02E]">
        <Building2 size={28} />
      </div>
    );
  }

  if (effectiveSrc.startsWith("blob:") || effectiveSrc.startsWith("data:")) {
    return <img src={effectiveSrc} alt={alt} className={className} />;
  }

  const resolved = resolveImageUrl(effectiveSrc);
  const needsAuthFetch =
    typeof effectiveSrc === "string" &&
    (effectiveSrc.startsWith("/api/") || resolved.includes("/api/"));

  const placeholderFallback = (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-500/15 via-stone-200/70 to-stone-300/40 dark:from-[#30251C] dark:via-[#172130] dark:to-[#0D1420] text-amber-700 dark:text-[#FFB02E]">
      <Building2 size={28} />
    </div>
  );

  if (needsAuthFetch) {
    return (
      <AuthenticatedImage
        src={resolved}
        alt={alt}
        className={className}
        fallback={
          fallbackSrc ? (
            <img src={fallbackSrc} alt={alt} className={className} />
          ) : (
            placeholderFallback
          )
        }
      />
    );
  }

  if (staticFailed) {
    return placeholderFallback;
  }

  return (
    <img
      src={resolved}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setStaticFailed(true)}
    />
  );
}
