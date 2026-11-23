import { useEffect, useRef, useState } from "react";
import { Camera, Trash2, Upload, User } from "lucide-react";
import api from "../services/api";

const MAX_SIZE_MB = 5;
const MAX_BYTES = MAX_SIZE_MB * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ProfilePhotoUpload({
  currentImageUrl = null,
  name = "",
  selectedFile = null,
  onImageSelected,
  onImageRemoved,
  isRemoved = false,
  label = "Profile Photograph",
  disabled = false,
  onError = null,
}) {
  const fileInputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imageLoadError, setImageLoadError] = useState(false);

  // Manage preview object URL with authenticated blob fetching
  useEffect(() => {
    let createdUrl = null;
    let isMounted = true;

    if (selectedFile) {
      createdUrl = URL.createObjectURL(selectedFile);
      setPreviewUrl(createdUrl);
      setImageLoadError(false);
    } else if (currentImageUrl && !isRemoved) {
      if (/^(blob:|data:)/i.test(currentImageUrl)) {
        setPreviewUrl(currentImageUrl);
        setImageLoadError(false);
      } else {
        api
          .get(currentImageUrl, { responseType: "blob" })
          .then((res) => {
            if (!isMounted) return;
            createdUrl = URL.createObjectURL(res.data);
            setPreviewUrl(createdUrl);
            setImageLoadError(false);
          })
          .catch(() => {
            if (!isMounted) return;
            setImageLoadError(true);
            setPreviewUrl(null);
          });
      }
    } else {
      setPreviewUrl(null);
      setImageLoadError(false);
    }

    return () => {
      isMounted = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [selectedFile, currentImageUrl, isRemoved]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so same file can be picked again if desired
    e.target.value = "";

    // Validation 1: MIME type
    if (!ALLOWED_TYPES.includes(file.type)) {
      const msg = "Invalid file type. Please upload a JPG, PNG, or WebP image.";
      if (onError) onError(msg);
      return;
    }

    // Validation 2: File size
    if (file.size > MAX_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      const msg = `Image size (${sizeMb} MB) exceeds maximum allowed limit of ${MAX_SIZE_MB} MB.`;
      if (onError) onError(msg);
      return;
    }

    // Pass valid file
    if (onImageSelected) {
      onImageSelected(file);
    }
  };

  const handleRemove = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (onImageRemoved) {
      onImageRemoved();
    }
  };

  const initial = (name || "").trim().charAt(0).toUpperCase() || null;
  const hasDisplayableImage = previewUrl && !imageLoadError;

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          {label}
        </label>
      )}

      <div className="flex items-center gap-4 p-3 rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/30">
        {/* Avatar Display */}
        <div className="relative shrink-0">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 flex items-center justify-center shadow-xs">
            {hasDisplayableImage ? (
              <img
                src={previewUrl}
                alt={name || "Profile avatar"}
                onError={() => setImageLoadError(true)}
                className="w-full h-full object-cover"
              />
            ) : initial ? (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#FFB02E] to-[#D97706] text-[#0D1420] font-bold text-xl sm:text-2xl font-bold shadow-inner">
                {initial}
              </div>
            ) : (
              <User size={32} className="text-stone-400 dark:text-stone-500" />
            )}
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            title={hasDisplayableImage ? "Change photo" : "Upload photo"}
            aria-label="Upload photo"
            className="absolute bottom-0 right-0 p-1.5 rounded-full bg-[#F59E0B] hover:bg-[#D97706] text-[#0D1420] shadow-md border-2 border-white dark:border-stone-900 cursor-pointer transition disabled:opacity-50"
          >
            <Camera size={14} />
          </button>
        </div>

        {/* Upload & Action Controls */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
            disabled={disabled}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700/60 text-stone-700 dark:text-stone-200 text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
            >
              <Upload size={13} className="text-[#F59E0B]" />
              <span>{hasDisplayableImage ? "Change Photo" : "Upload Photo"}</span>
            </button>

            {hasDisplayableImage && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-400 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
              >
                <Trash2 size={13} />
                <span>Remove</span>
              </button>
            )}
          </div>

          <p className="text-[11px] text-stone-400 dark:text-stone-500">
            JPG, PNG, or WebP. Maximum size 5 MB.
          </p>

          {selectedFile && (
            <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB) — ready to save
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
