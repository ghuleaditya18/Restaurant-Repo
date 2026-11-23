import { useState, useRef } from "react";
import {
  Building2,
  BookOpen,
  User,
  MapPin,
  Sparkles,
  Camera,
  Trash2,
  Save,
  X,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { resolveImageUrl } from "../utils/mediaUtils";
import { uploadFounderImage, deleteFounderImage } from "../services/businessProfileService";
import { BUTTON_VARIANTS, INPUT_STYLES, CARD_STYLES } from "../utils/themeTokens";

export default function BusinessProfileEditor({
  profile,
  onSave,
  onCancel,
  notify,
}) {
  const [formData, setFormData] = useState({
    business_name: profile?.business_name || "",
    business_type: profile?.business_type || "",
    business_category: profile?.business_category || "",
    tagline: profile?.tagline || "",
    description: profile?.description || "",
    established_year: profile?.established_year || "",

    story_heading: profile?.story_heading || "",
    story_subheading: profile?.story_subheading || "",
    story_content: profile?.story_content || "",

    founder_name: profile?.founder_name || "",
    founder_designation: profile?.founder_designation || "",
    founder_bio: profile?.founder_bio || "",
    founder_quote: profile?.founder_quote || "",
    founder_image_url: profile?.founder_image_url || null,

    business_email: profile?.business_email || "",
    business_phone: profile?.business_phone || "",

    address_line: profile?.address_line || "",
    city: profile?.city || "",
    state: profile?.state || "",
    postal_code: profile?.postal_code || "",
    country: profile?.country || "India",

    operating_hours: profile?.operating_hours || "",
    weekly_closed_days: profile?.weekly_closed_days || "",
    business_highlights: profile?.business_highlights || "",
  });

  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const isSpa = profile?.business_context === "SPA";

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("Founder photograph must be 5 MB or smaller.");
      notify?.("Founder photograph must be 5 MB or smaller.", "error");
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setError("Only JPG, PNG or WebP images are allowed.");
      notify?.("Only JPG, PNG or WebP images are allowed.", "error");
      return;
    }

    try {
      setUploadingImage(true);
      setError("");
      const updatedProfile = await uploadFounderImage(file);
      setFormData((prev) => ({
        ...prev,
        founder_image_url: updatedProfile.founder_image_url,
      }));
      notify?.("Founder photograph uploaded successfully.", "success");
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to upload founder photograph.";
      setError(msg);
      notify?.(msg, "error");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveImage = async () => {
    try {
      setUploadingImage(true);
      setError("");
      await deleteFounderImage();
      setFormData((prev) => ({
        ...prev,
        founder_image_url: null,
      }));
      notify?.("Founder photograph removed.", "info");
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to remove founder photograph.";
      setError(msg);
      notify?.(msg, "error");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.business_name.trim()) {
      setError("Business Name is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      await onSave(formData);
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to save business profile.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const founderImgUrl = resolveImageUrl(formData.founder_image_url);

  return (
    <div className={CARD_STYLES.base}>
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200/80 dark:border-stone-800 pb-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold">
              <Building2 size={16} />
            </span>
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              Edit {isSpa ? "Spa & Wellness" : "Restaurant"} Business Profile
            </h3>
          </div>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Maintain your establishment identity, story, founder details, and official contact information.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className={BUTTON_VARIANTS.secondary}
          >
            <X size={15} />
            <span>Cancel</span>
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className={BUTTON_VARIANTS.primary}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            <span>{saving ? "Saving..." : "Save Changes"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3.5 text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Section A: Basic Business Information */}
        <div className="rounded-xl border border-stone-100 dark:border-stone-800/80 bg-stone-50/50 dark:bg-stone-850/50 p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-stone-200/60 dark:border-stone-800 pb-2">
            <Building2 size={16} className="text-[#F59E0B]" />
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wide">
              A. Basic Business Information
            </h4>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Establishment Name <span className="text-amber-600">*</span>
              </label>
              <input
                type="text"
                name="business_name"
                value={formData.business_name}
                onChange={handleChange}
                required
                maxLength={150}
                placeholder={isSpa ? "e.g. Lotus Wellness Spa" : "e.g. Saffron Table Restaurant"}
                className={INPUT_STYLES.base}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Business Type
              </label>
              <input
                type="text"
                name="business_type"
                value={formData.business_type}
                onChange={handleChange}
                maxLength={100}
                placeholder={isSpa ? "e.g. Wellness & Therapy Centre" : "e.g. Casual Dining Restaurant"}
                className={INPUT_STYLES.base}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Category / Cuisine
              </label>
              <input
                type="text"
                name="business_category"
                value={formData.business_category}
                onChange={handleChange}
                maxLength={100}
                placeholder={isSpa ? "e.g. Holistic Therapy & Aromatherapy" : "e.g. Indian & Multi-Cuisine"}
                className={INPUT_STYLES.base}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Established Year
              </label>
              <input
                type="text"
                name="established_year"
                value={formData.established_year}
                onChange={handleChange}
                maxLength={10}
                placeholder="e.g. 2021"
                className={INPUT_STYLES.base}
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Tagline
              </label>
              <input
                type="text"
                name="tagline"
                value={formData.tagline}
                onChange={handleChange}
                maxLength={255}
                placeholder={isSpa ? "e.g. Restore Harmony, Rejuvenate Life." : "e.g. Good Food, Great Moments."}
                className={INPUT_STYLES.base}
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Main Description <span className="text-amber-600">*</span>
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                placeholder="Describe your business, culinary or wellness philosophy, atmosphere, and guest commitment..."
                className={INPUT_STYLES.base}
              />
            </div>
          </div>
        </div>

        {/* Section B: Our Story */}
        <div className="rounded-xl border border-stone-100 dark:border-stone-800/80 bg-stone-50/50 dark:bg-stone-850/50 p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-stone-200/60 dark:border-stone-800 pb-2">
            <BookOpen size={16} className="text-[#F59E0B]" />
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wide">
              B. Our Story
            </h4>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Story Title / Heading
              </label>
              <input
                type="text"
                name="story_heading"
                value={formData.story_heading}
                onChange={handleChange}
                maxLength={200}
                placeholder="e.g. Our Story"
                className={INPUT_STYLES.base}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Story Subtitle
              </label>
              <input
                type="text"
                name="story_subheading"
                value={formData.story_subheading}
                onChange={handleChange}
                maxLength={255}
                placeholder="e.g. From a shared family kitchen to a beloved community dining room"
                className={INPUT_STYLES.base}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Full Story Narrative
              </label>
              <textarea
                name="story_content"
                value={formData.story_content}
                onChange={handleChange}
                rows={4}
                placeholder="Narrate your founding journey, inspiration, milestone achievements, and community bond..."
                className={INPUT_STYLES.base}
              />
            </div>
          </div>
        </div>

        {/* Section C: Founder / Owner Information */}
        <div className="rounded-xl border border-stone-100 dark:border-stone-800/80 bg-stone-50/50 dark:bg-stone-850/50 p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-stone-200/60 dark:border-stone-800 pb-2">
            <User size={16} className="text-[#F59E0B]" />
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wide">
              C. Founder / Owner Information &amp; Photograph
            </h4>
          </div>

          <div className="flex flex-col sm:flex-row gap-5 items-start">
            {/* Founder Photo Preview & Controls */}
            <div className="flex flex-col items-center gap-2.5 shrink-0">
              <div className="relative h-24 w-24 rounded-2xl overflow-hidden border-2 border-[#F59E0B]/50 bg-stone-200 dark:bg-stone-800 flex items-center justify-center text-stone-500 shadow-xs">
                {founderImgUrl ? (
                  <img
                    src={founderImgUrl}
                    alt={formData.founder_name || "Founder"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-2">
                    <User size={32} className="text-stone-400" />
                    <span className="text-[10px] text-stone-400 mt-1 font-medium">No Photo</span>
                  </div>
                )}
                {uploadingImage && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white">
                    <Loader2 size={24} className="animate-spin" />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageFileChange}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#30251C] hover:bg-[#3D2E22] text-[#FFB02E] border border-[#F59E0B]/40 px-2.5 py-1 text-xs font-semibold cursor-pointer"
                  title="Upload Photograph"
                >
                  <Camera size={12} />
                  <span>{formData.founder_image_url ? "Change" : "Upload"}</span>
                </button>

                {formData.founder_image_url && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    disabled={uploadingImage}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-950/60 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 px-2 py-1 text-xs font-semibold cursor-pointer"
                    title="Remove Photograph"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-stone-400 text-center max-w-[120px]">
                JPG, PNG, WebP (Max 5 MB)
              </p>
            </div>

            {/* Founder Text Fields */}
            <div className="flex-1 grid grid-cols-1 gap-4 sm:grid-cols-2 w-full">
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                  Founder / Owner Name
                </label>
                <input
                  type="text"
                  name="founder_name"
                  value={formData.founder_name}
                  onChange={handleChange}
                  maxLength={150}
                  placeholder="e.g. Aarav Mehta"
                  className={INPUT_STYLES.base}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                  Designation / Title
                </label>
                <input
                  type="text"
                  name="founder_designation"
                  value={formData.founder_designation}
                  onChange={handleChange}
                  maxLength={100}
                  placeholder="e.g. Founder & Managing Director"
                  className={INPUT_STYLES.base}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                  Founder Quote / Philosophy
                </label>
                <input
                  type="text"
                  name="founder_quote"
                  value={formData.founder_quote}
                  onChange={handleChange}
                  maxLength={255}
                  placeholder="e.g. Great hospitality begins with respect for ingredients and genuine care for guests."
                  className={INPUT_STYLES.base}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                  Founder Biography
                </label>
                <textarea
                  name="founder_bio"
                  value={formData.founder_bio}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Brief biography outlining culinary or wellness background, training, and guiding vision..."
                  className={INPUT_STYLES.base}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section D: Contact Information & Location */}
        <div className="rounded-xl border border-stone-100 dark:border-stone-800/80 bg-stone-50/50 dark:bg-stone-850/50 p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-stone-200/60 dark:border-stone-800 pb-2">
            <MapPin size={16} className="text-[#F59E0B]" />
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wide">
              D. Official Contact &amp; Operating Hours
            </h4>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Official Business Email <span className="text-amber-600">*</span>
              </label>
              <input
                type="email"
                name="business_email"
                value={formData.business_email}
                onChange={handleChange}
                maxLength={150}
                placeholder="e.g. contact@dineflow.com"
                className={INPUT_STYLES.base}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Business Contact Phone <span className="text-amber-600">*</span>
              </label>
              <input
                type="tel"
                name="business_phone"
                value={formData.business_phone}
                onChange={handleChange}
                maxLength={50}
                placeholder="e.g. +91 98765 43210"
                className={INPUT_STYLES.base}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Operating Hours
              </label>
              <input
                type="text"
                name="operating_hours"
                value={formData.operating_hours}
                onChange={handleChange}
                maxLength={100}
                placeholder={isSpa ? "e.g. 10:00 AM - 08:00 PM" : "e.g. 11:00 AM - 11:00 PM"}
                className={INPUT_STYLES.base}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Address Line <span className="text-amber-600">*</span>
              </label>
              <input
                type="text"
                name="address_line"
                value={formData.address_line}
                onChange={handleChange}
                maxLength={255}
                placeholder="e.g. Shop 4, Heritage Plaza, MG Road"
                className={INPUT_STYLES.base}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                City <span className="text-amber-600">*</span>
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                maxLength={100}
                placeholder="e.g. Pune"
                className={INPUT_STYLES.base}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                State
              </label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleChange}
                maxLength={100}
                placeholder="e.g. Maharashtra"
                className={INPUT_STYLES.base}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Postal Code
              </label>
              <input
                type="text"
                name="postal_code"
                value={formData.postal_code}
                onChange={handleChange}
                maxLength={20}
                placeholder="e.g. 411001"
                className={INPUT_STYLES.base}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Weekly Closed Days
              </label>
              <input
                type="text"
                name="weekly_closed_days"
                value={formData.weekly_closed_days}
                onChange={handleChange}
                maxLength={100}
                placeholder="e.g. None (Open 7 Days)"
                className={INPUT_STYLES.base}
              />
            </div>
          </div>
        </div>

        {/* Section E: Business Highlights / Specialties */}
        <div className="rounded-xl border border-stone-100 dark:border-stone-800/80 bg-stone-50/50 dark:bg-stone-850/50 p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-stone-200/60 dark:border-stone-800 pb-2">
            <Sparkles size={16} className="text-[#F59E0B]" />
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wide">
              E. Specialties &amp; Highlights
            </h4>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
              Service Highlights (Comma-separated)
            </label>
            <input
              type="text"
              name="business_highlights"
              value={formData.business_highlights}
              onChange={handleChange}
              placeholder={isSpa ? "e.g. Ayurvedic Therapies, Aromatherapy, Couples Suite, Herbal Steam" : "e.g. Family Dining, Multi-Course Tasting, Live Tandoor, Fresh Regional Spices"}
              className={INPUT_STYLES.base}
            />
            <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
              Key amenities, specialties, or dining features highlighted on your About profile.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200/80 dark:border-stone-800">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className={BUTTON_VARIANTS.secondary}
          >
            <X size={15} />
            <span>Cancel</span>
          </button>

          <button
            type="submit"
            disabled={saving}
            className={BUTTON_VARIANTS.primary}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            <span>{saving ? "Saving Changes..." : "Save Business Profile"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
