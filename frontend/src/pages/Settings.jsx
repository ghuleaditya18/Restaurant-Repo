import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  User,
  HelpCircle,
  Info,
  Save,
  Search,
  ChevronDown,
  ShieldCheck,
  Mail,
  Phone,
  Edit3,
  X,
  Sparkles,
  Utensils,
  Clock,
  MapPin,
  ChefHat,
  AlertCircle,
  Sun,
  Moon,
  Monitor,
  Check,
  Palette,
  Camera,
  Trash2,
  Loader2,
  Building2,
  CheckCircle2,
  BookOpen,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useTheme } from "../context/ThemeContext";
import { updateProfile, uploadProfileImage, deleteProfileImage } from "../services/authService";
import { getBusinessProfile, updateBusinessProfile } from "../services/businessProfileService";
import { resolveImageUrl } from "../utils/mediaUtils";
import BusinessProfileEditor from "../components/BusinessProfileEditor";
import PageHeader from "../components/PageHeader";
import { SPA_HELP_SECTIONS } from "../config/spaSettingsConfig";
import {
  BUTTON_VARIANTS,
  INPUT_STYLES,
  CARD_STYLES,
} from "../utils/themeTokens";

// ==========================================
// HELP & SUPPORT KNOWLEDGE BASE
// ==========================================

const HELP_SECTIONS = [
  {
    id: "getting-started",
    title: "A. Getting Started",
    description: "System access, roles, and core navigation basics",
    items: [
      {
        q: "How do I log in to DineFlow?",
        a: "Navigate to the /login page, enter your registered Receptionist or Manager email address and password, and click 'Sign In'. Operational access is restricted to authorized roles.",
      },
      {
        q: "What are the capabilities of the Receptionist role?",
        a: "The Receptionist role (internally managed with operational privileges) can access Dashboard analytics, place orders, manage dining tables, update menus, register customers, generate invoices, record payments, and manage profile settings.",
      },
      {
        q: "How is navigation organized?",
        a: "Use the left sidebar on desktop (or mobile menu icon on smaller screens) to navigate between Dashboard, Orders, Tables, Menu, Customers, Staff, Invoices, and Settings. The sidebar can be collapsed to maximize screen space.",
      },
    ],
  },
  {
    id: "table-management",
    title: "B. Table Management",
    description: "Dining tables, occupancy rules, and date isolation",
    items: [
      {
        q: "How do I create a new restaurant table?",
        a: "Navigate to Tables, click '+ Add Table', enter the unique Table Number and seating Capacity, then click 'Create Table'. The table is immediately ready for dining orders.",
      },
      {
        q: "What is the difference between Available and Occupied status?",
        a: "A table is marked 'Occupied' when it has active orders for the current business date in Asia/Kolkata. When all orders on that table are Completed or Cancelled, it automatically returns to 'Available'.",
      },
      {
        q: "Why do previous-day orders not keep tables occupied today?",
        a: "DineFlow uses date-aware table occupancy strictly evaluated against the current restaurant business date (Asia/Kolkata). Orders from yesterday or earlier days remain preserved in order history and do not block today's tables.",
      },
      {
        q: "Can multiple active orders exist on the same table?",
        a: "Yes. Multiple separate orders can be created for the same table on the same business date (for multi-course dining or shared seating) without conflict.",
      },
    ],
  },
  {
    id: "menu-management",
    title: "C. Menu Management",
    description: "Categories, food items, pricing, and availability",
    items: [
      {
        q: "How do I add a new menu item?",
        a: "Go to Menu Management, click '+ Add Menu Item', select the Category, enter the Item Name, Price (in INR), optional Description, and upload an optional photo. Click 'Save Item'.",
      },
      {
        q: "How do I temporarily mark an item out of stock?",
        a: "In Menu Management, locate the item card or row and toggle the Availability switch. When an item is marked unavailable, it cannot be added to new orders until re-enabled.",
      },
      {
        q: "What happens if a category is deactivated?",
        a: "Deactivating a category immediately hides all dishes within that category from order placement, while keeping historical order item data intact.",
      },
    ],
  },
  {
    id: "customer-management",
    title: "D. Customer Management",
    description: "Customer registration and contact validation",
    items: [
      {
        q: "What information is required to register a customer?",
        a: "Full Name, a valid 10-digit Indian Mobile Number (starting with 6, 7, 8, or 9), and a mandatory valid Email Address. An optional postal/delivery address can also be provided.",
      },
      {
        q: "Why is email mandatory for customer records?",
        a: "Customer email addresses are required for sending electronic invoice receipts, booking updates, and maintaining verified guest records across visits.",
      },
      {
        q: "Can I delete a customer who has existing orders?",
        a: "No. For audit and billing compliance, customers associated with existing orders cannot be deleted. Their profile can be updated if contact details change.",
      },
    ],
  },
  {
    id: "order-management",
    title: "E. Order Management & Workflow",
    description: "The 4-stage order pipeline and lifecycle rules",
    items: [
      {
        q: "What are the four primary stages of the order workflow?",
        a: "1. Ordered: The order is placed and confirmed. 2. In Progress: Kitchen preparation has started or food is ready. 3. Served: Delivered to the guest's table. 4. Completed: Invoiced, settled, and finalized.",
      },
      {
        q: "When can order items or quantities be modified?",
        a: "Order items can be added, updated, or removed while the order is in the Ordered phase (Pending or Confirmed). Once food preparation begins, items are locked to prevent kitchen discrepancies.",
      },
      {
        q: "What is automatic stale-order cancellation?",
        a: "Unfinished orders in Ordered or In Progress that remain inactive beyond the configured timeout (default 24 hours) are automatically cancelled by a background worker, auditing the cancellation and freeing the table.",
      },
      {
        q: "Are Served orders ever automatically cancelled?",
        a: "No. Served and Completed orders are strictly immune to automatic cancellation because food has already been delivered to the customer.",
      },
    ],
  },
  {
    id: "invoices-payments",
    title: "F. Invoices & Payments",
    description: "GST billing, PDF receipts, and settlement",
    items: [
      {
        q: "When can an invoice be generated for an order?",
        a: "An invoice can only be generated once the order reaches the 'Served' stage. Invoices cannot be created for unfinished orders in Ordered or In Progress.",
      },
      {
        q: "How is GST calculated on DineFlow invoices?",
        a: "GST is calculated at 5% (comprising 2.5% CGST and 2.5% SGST) applied on the order subtotal, rounded to two decimal places. Total Amount = Subtotal + GST Amount.",
      },
      {
        q: "What is the difference between Pending and Paid invoices?",
        a: "Newly created invoices start in 'Pending' status. Once the guest pays via UPI, Card, Cash, or Net Banking, payment is recorded and marked 'Paid'.",
      },
      {
        q: "Can an order be Completed before its invoice is paid?",
        a: "No. The system strictly requires an invoice to exist and have 'Paid' status before an order can be marked Completed.",
      },
      {
        q: "How do I download or share an invoice PDF?",
        a: "In the Invoices module, click the 'PDF' button on any invoice card to download a formatted invoice receipt, or click 'WhatsApp' to share the invoice summary with the guest.",
      },
    ],
  },
  {
    id: "common-questions",
    title: "G. Common Operational Questions",
    description: "Quick troubleshooting for daily restaurant scenarios",
    items: [
      {
        q: "Why is a table showing Occupied when no guests are sitting?",
        a: "Check the Orders page for active (non-completed) orders assigned to that table for today's date. If an active order exists, advance it to Served and Completed after payment, or cancel it if placed in error.",
      },
      {
        q: "Why can't I advance an order to Completed?",
        a: "Ensure that: 1. An invoice has been generated for the order in Invoices. 2. The invoice payment has been recorded and marked as 'Paid'. Once paid, the order can be completed immediately.",
      },
      {
        q: "How do I change the application theme?",
        a: "Click the Moon/Sun toggle icon located on the right side of the top navigation header. DineFlow instantly switches between Light and Dark mode, saving your preference automatically across reloads and future logins.",
      },
      {
        q: "Can staff accounts access this system?",
        a: "Operational endpoints and the management interface are restricted to the Receptionist role. Kitchen staff interact via their respective operational views.",
      },
    ],
  },
  {
    id: "contact-support",
    title: "H. Support & Administration",
    description: "Help desk and technical assistance contacts",
    items: [
      {
        q: "How do I report technical issues or request configuration changes?",
        a: "Contact your restaurant system administrator or IT supervisor for technical support, database configuration, or user permission changes.",
      },
      {
        q: "Where are database backups and application logs managed?",
        a: "Database backups and operational server logs are maintained by your server administrator at the infrastructure level.",
      },
    ],
  },
];

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, updateUser, refreshUser } = useAuth();
  const { showSuccess, showError, confirm } = useNotification();

  const isSpaContext = user?.business_context === "SPA";
  const currentHelpSections = isSpaContext ? SPA_HELP_SECTIONS : HELP_SECTIONS;
  const isManager = (user?.role || "").toLowerCase() === "manager" || (user?.role || "").toLowerCase() === "admin";

  const { themeMode, setThemeMode } = useTheme();

  // Active section tab: 'profile' | 'appearance' | 'help' | 'about'
  const rawTab = searchParams.get("tab");
  const activeTab = ["profile", "appearance", "help", "about"].includes(rawTab) ? rawTab : "profile";

  useEffect(() => {
    // Gracefully normalize invalid tabs to profile
    if (rawTab && !["profile", "appearance", "help", "about"].includes(rawTab)) {
      setSearchParams({ tab: "profile" }, { replace: true });
    }
  }, [rawTab, setSearchParams]);

  const setActiveTab = (tab) => {
    setSearchParams({ tab });
  };

  // ==========================================
  // PROFILE STATE (READ-ONLY BY DEFAULT)
  // ==========================================
  const [isEditing, setIsEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    email: "",
    phone: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");

  // PROFILE AVATAR MANAGEMENT
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showError("Profile photo must be 5 MB or smaller.", "File Too Large");
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      showError("Only JPG, PNG or WebP images are allowed.", "Invalid Image");
      return;
    }

    try {
      setUploadingAvatar(true);
      const updatedUser = await uploadProfileImage(file);
      updateUser(updatedUser);
      if (refreshUser) await refreshUser();
      showSuccess("Profile photo updated successfully.", "Photo Updated");
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to upload profile photo.";
      showError(typeof msg === "string" ? msg : JSON.stringify(msg), "Upload Failed");
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleAvatarDelete = async () => {
    const confirmed = await confirm({
      title: "Remove Profile Photo?",
      message: "Are you sure you want to remove your profile photo? Your initials will be displayed instead.",
      confirmText: "Remove Photo",
      cancelText: "Keep Photo",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      setUploadingAvatar(true);
      const updatedUser = await deleteProfileImage();
      updateUser(updatedUser);
      if (refreshUser) await refreshUser();
      showSuccess("Profile photo removed.", "Photo Removed");
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to remove profile photo.";
      showError(typeof msg === "string" ? msg : JSON.stringify(msg), "Removal Failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // DYNAMIC ABOUT BUSINESS PROFILE
  const [bizProfile, setBizProfile] = useState(null);
  const [bizLoading, setBizLoading] = useState(false);
  const [bizEditing, setBizEditing] = useState(false);

  const loadBizProfile = async () => {
    try {
      setBizLoading(true);
      const data = await getBusinessProfile();
      setBizProfile(data);
    } catch (err) {
      console.error("Failed to load business profile:", err);
    } finally {
      setBizLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "about" && !bizProfile && !bizLoading) {
      loadBizProfile();
    }
  }, [activeTab, bizProfile, bizLoading]);

  const handleBizSave = async (formData) => {
    const updated = await updateBusinessProfile(formData);
    setBizProfile(updated);
    setBizEditing(false);
    showSuccess("Business profile updated successfully.", "Profile Saved");
  };

  useEffect(() => {
    if (user) {
      setProfileForm({
        full_name: user.full_name || "",
        email: user.email || "",
        phone: user.phone || "",
      });
    }
  }, [user]);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleProfileCancel = async () => {
    const isDirty =
      profileForm.full_name !== (user?.full_name || "") ||
      profileForm.email !== (user?.email || "") ||
      profileForm.phone !== (user?.phone || "");

    if (isDirty) {
      const confirmed = await confirm({
        title: "Discard Unsaved Changes?",
        message:
          "You have modified profile information. If you cancel now, your unsaved edits will be discarded.",
        confirmText: "Discard Changes",
        cancelText: "Keep Editing",
        variant: "warning",
      });
      if (!confirmed) return;
    }

    setProfileForm({
      full_name: user?.full_name || "",
      email: user?.email || "",
      phone: user?.phone || "",
    });
    setProfileError("");
    setIsEditing(false);
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileError("");

    const trimmedName = profileForm.full_name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setProfileError("Full Name must contain at least 2 characters.");
      return;
    }

    const trimmedEmail = profileForm.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      setProfileError("Please enter a valid email address.");
      return;
    }

    const trimmedPhone = profileForm.phone.trim();
    if (trimmedPhone) {
      const phoneRegex = /^[6-9][0-9]{9}$/;
      if (!phoneRegex.test(trimmedPhone)) {
        setProfileError(
          "Phone number must be a valid 10-digit mobile number starting with 6, 7, 8, or 9."
        );
        return;
      }
    }

    setProfileSaving(true);
    try {
      const updated = await updateProfile({
        full_name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone || null,
      });
      updateUser(updated);
      showSuccess(
        "Your profile details have been successfully updated.",
        "Profile Updated"
      );
      setIsEditing(false);
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        "Could not update profile. Please try again.";
      const errorText = typeof msg === "string" ? msg : JSON.stringify(msg);
      setProfileError(errorText);
      showError(errorText, "Update Failed");
    } finally {
      setProfileSaving(false);
    }
  };

  // ==========================================
  // HELP SEARCH & ACCORDIONS
  // ==========================================
  const [helpSearch, setHelpSearch] = useState("");
  const [openSections, setOpenSections] = useState({
    "getting-started": true,
    "common-questions": true,
  });

  const toggleSection = (sectionId) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const filteredHelpSections = useMemo(() => {
    const q = helpSearch.trim().toLowerCase();
    if (!q) return currentHelpSections;

    return currentHelpSections.map((sec) => {
      const matchingItems = sec.items.filter(
        (it) => it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q)
      );
      return {
        ...sec,
        items: matchingItems,
      };
    }).filter((sec) => sec.items.length > 0);
  }, [helpSearch, currentHelpSections]);

  return (
    <div className="space-y-6">
      {/* STANDARDIZED PAGE HEADER WITH TAB CONTROLS */}
      <PageHeader
        title={isSpaContext ? "Spa Facility Settings" : "System Settings"}
        description={`Manage your account profile, theme appearance, operational help, and ${isSpaContext ? "spa facility" : "restaurant"} information.`}
        actions={
          <div className="flex flex-wrap sm:inline-flex rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-1 shadow-2xs gap-1 max-w-full">
            <button
              type="button"
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === "profile"
                  ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold shadow-xs"
                  : "text-stone-600 dark:text-[#8A9AB2] hover:text-stone-900 dark:hover:text-stone-100"
              }`}
            >
              <User size={14} />
              <span>Profile</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("appearance")}
              className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === "appearance"
                  ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold shadow-xs"
                  : "text-stone-600 dark:text-[#8A9AB2] hover:text-stone-900 dark:hover:text-stone-100"
              }`}
            >
              <Palette size={14} />
              <span>Appearance</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("help")}
              className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === "help"
                  ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold shadow-xs"
                  : "text-stone-600 dark:text-[#8A9AB2] hover:text-stone-900 dark:hover:text-stone-100"
              }`}
            >
              <HelpCircle size={14} />
              <span>Help & Support</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("about")}
              className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === "about"
                  ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold shadow-xs"
                  : "text-stone-600 dark:text-[#8A9AB2] hover:text-stone-900 dark:hover:text-stone-100"
              }`}
            >
              <Info size={14} />
              <span>About</span>
            </button>
          </div>
        }
      />

      {/* =========================================================================
          TAB 1: RECEPTIONIST PROFILE SETTINGS (READ-ONLY BY DEFAULT)
         ========================================================================= */}
      {activeTab === "profile" && (
        <div className="space-y-6">
          {/* PROFILE SUMMARY HERO CARD */}
          <div className="rounded-2xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-4 sm:p-6 shadow-xs">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0 flex-1">
                {/* Profile Photo with Upload Controls */}
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <div className="relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#FFB02E] to-[#D97706] text-[#0D1420] font-bold border-2 border-[#F59E0B]/50 text-2xl font-bold shadow-xs flex items-center justify-center">
                    {user?.avatar_url ? (
                      <img
                        src={resolveImageUrl(user.avatar_url)}
                        alt={user?.full_name || "User"}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <span>{user?.full_name ? user.full_name.trim().charAt(0).toUpperCase() : "U"}</span>
                    )}

                    {uploadingAvatar && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white">
                        <Loader2 size={22} className="animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Photo Actions */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="file"
                      ref={avatarInputRef}
                      onChange={handleAvatarFileChange}
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#30251C] hover:bg-[#3D2E22] text-[#FFB02E] border border-[#F59E0B]/40 px-2 py-0.5 text-[11px] font-semibold cursor-pointer"
                      title="Upload or change profile photo"
                    >
                      <Camera size={12} />
                      <span>{user?.avatar_url ? "Change" : "Upload"}</span>
                    </button>

                    {user?.avatar_url && (
                      <button
                        type="button"
                        onClick={handleAvatarDelete}
                        disabled={uploadingAvatar}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/60 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/40 px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer"
                        title="Remove profile photo"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-bold text-stone-900 dark:text-stone-100 truncate">
                      {user?.full_name || (isSpaContext ? "Spa Receptionist" : "Receptionist User")}
                    </h2>
                  </div>
                  <p className="mt-0.5 text-xs sm:text-sm text-stone-500 dark:text-stone-400 truncate">
                    {user?.email || "No email on file"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
                    <span className="rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-0.5 font-semibold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                      {isSpaContext ? "Role: Spa Receptionist" : (user?.role ? `Role: ${user.role}` : "Role: Receptionist")}
                    </span>
                    <span className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 px-2 py-0.5 font-semibold text-amber-800 dark:text-amber-300">
                      {isSpaContext ? "Context: Spa & Wellness" : "Context: Restaurant"}
                    </span>
                    {user?.phone ? (
                      <span className="inline-flex items-center gap-1 text-stone-500 dark:text-stone-400">
                        <Phone size={12} />
                        {user.phone}
                      </span>
                    ) : (
                      <span className="text-stone-400 dark:text-stone-500 italic">
                        {isSpaContext ? "Contact: Not configured" : "Contact not provided"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!isEditing && (
                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileError("");
                      setIsEditing(true);
                    }}
                    className={BUTTON_VARIANTS.primary}
                  >
                    <Edit3 size={15} />
                    <span>Update Profile</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* READ-ONLY VIEW OR EDIT FORM */}
          {!isEditing ? (
            /* READ-ONLY PRESENTATION */
            <div className={CARD_STYLES.base}>
              <div className="border-b border-stone-200/80 dark:border-stone-800 pb-4 mb-5">
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Personal & Account Information
                </h3>
                <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                  {isSpaContext
                    ? "Current Spa receptionist identity and authorized communication credentials."
                    : "Current receptionist identity and authorized communication credentials."}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-stone-100 dark:border-stone-800/80 bg-stone-50/60 dark:bg-stone-850/60 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Full Name
                  </p>
                  <p className="mt-1 text-sm font-semibold text-stone-900 dark:text-stone-100">
                    {user?.full_name || "—"}
                  </p>
                  <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
                    {isSpaContext
                      ? "Recorded on booking status transitions and therapy audit trails."
                      : "Recorded on order transitions and system audit trails."}
                  </p>
                </div>

                <div className="rounded-xl border border-stone-100 dark:border-stone-800/80 bg-stone-50/60 dark:bg-stone-850/60 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Email Address
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-stone-900 dark:text-stone-100">
                    <Mail size={14} className="text-stone-400 shrink-0" />
                    <span className="truncate">{user?.email || "—"}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
                    Authorized login email and operational notifications.
                  </p>
                </div>

                <div className="rounded-xl border border-stone-100 dark:border-stone-800/80 bg-stone-50/60 dark:bg-stone-850/60 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Contact Number
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-stone-900 dark:text-stone-100">
                    <Phone size={14} className="text-stone-400 shrink-0" />
                    <span>{user?.phone || (isSpaContext ? "Not configured" : "Not provided")}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
                    {isSpaContext
                      ? "Direct mobile number for internal wellness coordination."
                      : "Direct mobile number for internal restaurant coordination."}
                  </p>
                </div>

                <div className="rounded-xl border border-stone-100 dark:border-stone-800/80 bg-stone-50/60 dark:bg-stone-850/60 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Operational Role
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-stone-900 dark:text-stone-100">
                    <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{isSpaContext ? "Spa Receptionist" : (user?.role || "Receptionist")}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
                    {isSpaContext
                      ? "Authorized for Spa Appointments, Therapies, Invoices, and Billing."
                      : "Authorized for Orders, Tables, Invoices, and Billing."}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* EDIT PROFILE FORM */
            <div className={CARD_STYLES.base}>
              <div className="border-b border-stone-200/80 dark:border-stone-800 pb-4 mb-5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300">
                    <Edit3 size={13} />
                  </span>
                  <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                    Edit Profile Details
                  </h3>
                </div>
                <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                  Update your display name, authorized login email, and direct mobile number.
                </p>
              </div>

              {profileError && (
                <div className="mb-5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{profileError}</span>
                </div>
              )}

              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                      Full Name <span className="text-amber-600">*</span>
                    </label>
                    <input
                      type="text"
                      name="full_name"
                      value={profileForm.full_name}
                      onChange={handleProfileChange}
                      required
                      minLength={2}
                      maxLength={100}
                      disabled={profileSaving}
                      placeholder="e.g. Amit Patil"
                      className={INPUT_STYLES.base}
                    />
                    <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                      Minimum 2 characters. Displayed on header and order logs.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                      Email Address <span className="text-amber-600">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        name="email"
                        value={profileForm.email}
                        onChange={handleProfileChange}
                        required
                        maxLength={150}
                        disabled={profileSaving}
                        placeholder="e.g. receptionist@dineflow.com"
                        className={INPUT_STYLES.base}
                      />
                      <Mail size={16} className="pointer-events-none absolute right-3 top-2.5 text-stone-400" />
                    </div>
                    <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                      Authorized email address used for signing in.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                      Contact Number (Optional)
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        name="phone"
                        value={profileForm.phone}
                        onChange={handleProfileChange}
                        maxLength={15}
                        disabled={profileSaving}
                        placeholder="e.g. 9876543210"
                        className={INPUT_STYLES.base}
                      />
                      <Phone size={16} className="pointer-events-none absolute right-3 top-2.5 text-stone-400" />
                    </div>
                    <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                      10-digit Indian mobile number (starting with 6, 7, 8, or 9).
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      Operational Role (Read-Only)
                    </label>
                    <input
                      type="text"
                      value={isSpaContext ? "Spa Receptionist" : "Receptionist"}
                      disabled
                      className="w-full rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-850 px-3 py-2 text-sm text-stone-500 dark:text-stone-400 cursor-not-allowed"
                    />
                    <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
                      Role assignments are governed by system administrators.
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleProfileCancel}
                    disabled={profileSaving}
                    className={BUTTON_VARIANTS.secondary}
                  >
                    <X size={15} />
                    <span>Cancel</span>
                  </button>

                  <button
                    type="submit"
                    disabled={profileSaving}
                    className={BUTTON_VARIANTS.primary}
                  >
                    <Save size={15} />
                    <span>{profileSaving ? "Saving Changes..." : "Save Changes"}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB: THEME & APPEARANCE (A2 STANDARD)
         ========================================================================= */}
      {activeTab === "appearance" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#101722] p-6 shadow-xs">
            <div>
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                Application Appearance
              </h2>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                Select your preferred interface display theme. The selected setting persists per user and applies throughout the entire application.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Light Mode Card */}
              <button
                type="button"
                onClick={() => {
                  setThemeMode("light", user?.id);
                  showSuccess("Appearance set to Light Mode");
                }}
                className={`group relative flex flex-col justify-between rounded-xl border p-5 text-left transition-all cursor-pointer ${
                  themeMode === "light"
                    ? "border-[#F59E0B] ring-2 ring-[#F59E0B]/30 bg-amber-50/20 dark:bg-amber-950/20"
                    : "border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-white dark:bg-[#101722]"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 border border-amber-200">
                      <Sun size={20} />
                    </div>
                    {themeMode === "light" && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold">
                        <Check size={14} className="stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-stone-900 dark:text-stone-100">
                    Light Theme
                  </h3>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                    Crisp, bright aesthetic designed for daytime reception counters and well-lit office terminals.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs text-stone-500">
                  <span>Surface: Crisp White</span>
                  <span className="font-semibold text-amber-600">Active Bright</span>
                </div>
              </button>

              {/* Dark Mode Card */}
              <button
                type="button"
                onClick={() => {
                  setThemeMode("dark", user?.id);
                  showSuccess("Appearance set to Dark Mode");
                }}
                className={`group relative flex flex-col justify-between rounded-xl border p-5 text-left transition-all cursor-pointer ${
                  themeMode === "dark"
                    ? "border-[#F59E0B] ring-2 ring-[#F59E0B]/30 bg-amber-50/20 dark:bg-amber-950/20"
                    : "border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-white dark:bg-[#101722]"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 text-amber-400 border border-stone-800">
                      <Moon size={20} />
                    </div>
                    {themeMode === "dark" && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold">
                        <Check size={14} className="stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-stone-900 dark:text-stone-100">
                    Dark Theme
                  </h3>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                    Rich charcoal and espresso palette designed to reduce screen glare during evening service and low-light counters.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs text-stone-500">
                  <span>Surface: Deep Espresso</span>
                  <span className="font-semibold text-amber-400">Low Glare</span>
                </div>
              </button>

              {/* System Sync Card */}
              <button
                type="button"
                onClick={() => {
                  setThemeMode("system", user?.id);
                  showSuccess("Appearance set to System Default");
                }}
                className={`group relative flex flex-col justify-between rounded-xl border p-5 text-left transition-all cursor-pointer ${
                  themeMode === "system"
                    ? "border-[#F59E0B] ring-2 ring-[#F59E0B]/30 bg-amber-50/20 dark:bg-amber-950/20"
                    : "border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-white dark:bg-[#101722]"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      <Monitor size={20} />
                    </div>
                    {themeMode === "system" && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold">
                        <Check size={14} className="stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-stone-900 dark:text-stone-100">
                    System Sync
                  </h3>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                    Automatically switches between Light and Dark appearance according to your device's operating system preferences.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs text-stone-500">
                  <span>Adaptive Dynamic</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">OS Matched</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: HELP & SUPPORT CENTRE
         ========================================================================= */}
      {activeTab === "help" && (
        <div className="space-y-6">
          {/* SEARCH HERO */}
          <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#101722] p-6 shadow-xs">
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              {isSpaContext ? "DineFlow Spa Knowledge Base & Help Centre" : "DineFlow Knowledge Base & Help Centre"}
            </h3>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              {isSpaContext
                ? "Search operational guides, therapy slot booking rules, check-in flows, staff schedules, and billing policies."
                : "Search operational guides, workflow explanations, troubleshooting steps, and billing policies."}
            </p>

            <div className="relative mt-4 w-full sm:max-w-[500px]">
              <input
                type="text"
                value={helpSearch}
                onChange={(e) => setHelpSearch(e.target.value)}
                placeholder={
                  isSpaContext
                    ? "Search topics, e.g. time slots, check-in, complete session, GST invoice..."
                    : "Search topics, e.g. table occupied, cancel stale order, GST invoice, dark mode..."
                }
                className="h-11 w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-850 pl-10 pr-16 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 outline-none transition focus:border-[#F59E0B] focus:bg-white dark:focus:bg-stone-900 focus:ring-2 focus:ring-[#F59E0B]/30"
              />
              <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              {helpSearch && (
                <button
                  type="button"
                  onClick={() => setHelpSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* ACCORDION SECTIONS */}
          <div className="space-y-4">
            {filteredHelpSections.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-800 bg-white dark:bg-[#101722] p-10 text-center">
                <HelpCircle size={36} className="mx-auto text-stone-400 mb-2" />
                <h4 className="font-bold text-stone-800 dark:text-stone-200">No matching help topics found</h4>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                  Try searching with different keywords like {isSpaContext ? "'booking', 'slots', 'therapist', or 'invoice'" : "'invoice', 'orders', 'table', or 'payment'"}.
                </p>
                <button
                  type="button"
                  onClick={() => setHelpSearch("")}
                  className="mt-3 rounded-lg bg-stone-100 dark:bg-stone-800 px-3 py-1.5 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-200 cursor-pointer"
                >
                  Reset Search
                </button>
              </div>
            ) : (
              filteredHelpSections.map((sec) => {
                const isOpen = openSections[sec.id] || Boolean(helpSearch);
                return (
                  <div
                    key={sec.id}
                    className="overflow-hidden rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#101722] shadow-xs"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSection(sec.id)}
                      className="flex w-full items-center justify-between border-b border-stone-100 dark:border-stone-800/60 bg-stone-50/50 dark:bg-stone-850/50 px-5 py-4 text-left transition hover:bg-stone-100/50 dark:hover:bg-stone-800/40 cursor-pointer"
                    >
                      <div>
                        <h4 className="font-bold text-stone-900 dark:text-stone-100 text-sm sm:text-base">
                          {sec.title}
                        </h4>
                        <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                          {sec.description} ({sec.items.length} {sec.items.length === 1 ? "article" : "articles"})
                        </p>
                      </div>
                      <ChevronDown
                        size={18}
                        className={`text-stone-400 transition-transform duration-200 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {isOpen && (
                      <div className="divide-y divide-stone-100 dark:divide-stone-800/60 p-2 sm:p-4">
                        {sec.items.map((item, idx) => (
                          <div key={idx} className="p-3">
                            <p className="font-semibold text-sm text-stone-900 dark:text-stone-100 flex items-start gap-2">
                              <span className="text-amber-500 font-bold shrink-0">Q:</span>
                              <span>{item.q}</span>
                            </p>
                            <p className="mt-1.5 text-xs leading-relaxed text-stone-600 dark:text-stone-300 pl-5">
                              {item.a}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: ABOUT (DYNAMIC CONTEXT-AWARE BUSINESS INFORMATION)
         ========================================================================= */}
      {activeTab === "about" && (
        bizLoading ? (
          <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#101722] p-12 text-center shadow-xs">
            <Loader2 size={32} className="animate-spin text-[#F59E0B] mx-auto mb-3" />
            <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">
              Loading business profile...
            </p>
          </div>
        ) : bizEditing ? (
          <BusinessProfileEditor
            profile={bizProfile}
            onSave={handleBizSave}
            onCancel={() => setBizEditing(false)}
            notify={(msg, type) => (type === "error" ? showError(msg) : showSuccess(msg))}
          />
        ) : !bizProfile?.is_profile_complete ? (
          /* PROFILE COMPLETION CALLOUT STATE */
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-[#101722] p-8 text-center space-y-4 shadow-xs">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold shadow-xs">
              <Building2 size={32} />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100">
                Complete Your Business Profile
              </h3>
              <p className="mt-1.5 text-sm text-stone-600 dark:text-stone-400 max-w-lg mx-auto">
                Some business information still needs to be added before your {isSpaContext ? "spa facility" : "restaurant"} profile is fully configured.
              </p>
            </div>

            {bizProfile?.missing_fields?.length > 0 && (
              <div className="pt-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
                  Pending Required Information:
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 max-w-md mx-auto">
                  {bizProfile.missing_fields.map((mf) => (
                    <span
                      key={mf}
                      className="rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 px-3 py-1 text-xs font-medium text-amber-800 dark:text-amber-300"
                    >
                      {mf}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {isManager ? (
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => setBizEditing(true)}
                  className={BUTTON_VARIANTS.primary}
                >
                  <Edit3 size={15} />
                  <span>Update Business Information</span>
                </button>
              </div>
            ) : (
              <p className="text-xs text-stone-400 italic pt-2">
                Authorized business managers can configure establishment details.
              </p>
            )}
          </div>
        ) : (
          /* COMPLETED DYNAMIC ABOUT PRESENTATION */
          <div className="space-y-6">
            {/* A. OVERVIEW HERO BANNER */}
            <div className="relative overflow-hidden rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#101722] p-6 sm:p-8 shadow-xs">
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#F59E0B]/10 blur-3xl dark:bg-[#F59E0B]/5" />

              <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    {bizProfile.business_type && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF7E8] dark:bg-[#30251C] border border-[#FFEDD5] dark:border-[#9A3412]/40 px-3 py-0.5 text-xs font-semibold text-[#9A3412] dark:text-[#FFB02E]">
                        {isSpaContext ? <Sparkles size={13} /> : <Utensils size={13} />}
                        {bizProfile.business_type}
                      </span>
                    )}
                    {bizProfile.business_category && (
                      <span className="rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 px-3 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                        {bizProfile.business_category}
                      </span>
                    )}
                    {bizProfile.established_year && (
                      <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-2.5 py-0.5 text-xs text-stone-500 dark:text-stone-400">
                        Est. {bizProfile.established_year}
                      </span>
                    )}
                    <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-2.5 py-0.5 text-xs text-stone-500 dark:text-stone-400">
                      Context: {bizProfile.business_context}
                    </span>
                  </div>

                  <div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-100">
                      {bizProfile.business_name}
                    </h2>
                    {bizProfile.tagline && (
                      <p className="mt-1 text-sm font-semibold text-stone-500 dark:text-stone-400 italic">
                        &quot;{bizProfile.tagline}&quot;
                      </p>
                    )}
                  </div>

                  {bizProfile.description && (
                    <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-300 pt-1">
                      {bizProfile.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-3 shrink-0">
                  {isManager && (
                    <button
                      type="button"
                      onClick={() => setBizEditing(true)}
                      className={BUTTON_VARIANTS.primary}
                    >
                      <Edit3 size={15} />
                      <span>Edit Business Information</span>
                    </button>
                  )}

                  <div className="hidden sm:flex flex-col items-center justify-center rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-gradient-to-b from-amber-50/60 to-white dark:from-amber-950/20 dark:to-[#101722] p-5 text-center w-48 shadow-2xs">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold shadow-xs">
                      {isSpaContext ? <Sparkles size={24} /> : <ChefHat size={24} />}
                    </div>
                    <h4 className="mt-2.5 text-xs font-bold text-stone-900 dark:text-stone-100">
                      {isSpaContext ? "Spa & Wellness" : "Restaurant & Dining"}
                    </h4>
                    <p className="mt-0.5 text-[10px] text-stone-500 dark:text-stone-400 leading-tight">
                      Verified Business Identity
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* B. OUR STORY & FOUNDER / OWNER CARD */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* OUR STORY */}
              {(bizProfile.story_content || bizProfile.story_heading) && (
                <div className={`${bizProfile.founder_name ? "lg:col-span-8" : "lg:col-span-12"} ${CARD_STYLES.base} min-w-0 flex flex-col justify-between`}>
                  <div>
                    <div className="border-b border-stone-200/80 dark:border-stone-800 pb-4 mb-4">
                      <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                        <BookOpen size={18} className="text-[#F59E0B]" />
                        <span>{bizProfile.story_heading || "Our Story"}</span>
                      </h3>
                      {bizProfile.story_subheading && (
                        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                          {bizProfile.story_subheading}
                        </p>
                      )}
                    </div>
                    <div className="space-y-3 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                      {bizProfile.story_content?.split("\n\n").map((para, idx) => (
                        <p key={idx}>{para}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* FOUNDER / OWNER CARD */}
              {bizProfile.founder_name && (
                <div className={`${(bizProfile.story_content || bizProfile.story_heading) ? "lg:col-span-4" : "lg:col-span-12"} ${CARD_STYLES.base} min-w-0 flex flex-col`}>
                  <div className="border-b border-stone-200/80 dark:border-stone-800 pb-4 mb-4">
                    <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                      <User size={18} className="text-[#F59E0B]" />
                      <span>Meet the Founder &amp; Leadership</span>
                    </h3>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    <div className="h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-2xl overflow-hidden border-2 border-[#F59E0B]/50 bg-stone-100 dark:bg-stone-800 flex items-center justify-center shadow-xs">
                      {bizProfile.founder_image_url ? (
                        <img
                          src={resolveImageUrl(bizProfile.founder_image_url)}
                          alt={bizProfile.founder_name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#FFB02E] to-[#D97706] text-[#0D1420] text-2xl font-bold">
                          {bizProfile.founder_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="text-base font-bold text-stone-900 dark:text-stone-100 break-words">
                        {bizProfile.founder_name}
                      </h4>
                      <p className="text-xs font-semibold text-[#9A3412] dark:text-[#FFB02E] break-words">
                        {bizProfile.founder_designation || "Founder & Owner"}
                      </p>
                      {bizProfile.founder_quote && (
                        <p className="mt-2 text-xs italic text-stone-500 dark:text-stone-400 border-l-2 border-[#F59E0B] pl-2.5 py-0.5 break-words">
                          &quot;{bizProfile.founder_quote}&quot;
                        </p>
                      )}
                    </div>
                  </div>

                  {bizProfile.founder_bio && (
                    <p className="mt-4 text-xs leading-relaxed text-stone-600 dark:text-stone-300 border-t border-stone-100 dark:border-stone-800/80 pt-3 break-words">
                      {bizProfile.founder_bio}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* C. OFFICIAL CONTACT DETAILS & OPERATING HOURS */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className={`${CARD_STYLES.base} min-w-0 flex flex-col justify-between`}>
                <div>
                  <div className="border-b border-stone-200/80 dark:border-stone-800 pb-4 mb-4">
                    <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                      <MapPin size={18} className="text-[#F59E0B]" />
                      <span>Official Business &amp; Contact Details</span>
                    </h3>
                    <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                      Official business registration and communication channels.
                    </p>
                  </div>

                  <div className="divide-y divide-stone-100 dark:divide-stone-800/80 text-xs">
                    <div className="flex items-center justify-between py-2.5 gap-2">
                      <span className="font-semibold text-stone-700 dark:text-stone-300 shrink-0">Establishment:</span>
                      <span className="font-medium text-stone-900 dark:text-stone-100 text-right min-w-0 break-words">{bizProfile.business_name}</span>
                    </div>
                    {bizProfile.business_email && (
                      <div className="flex items-center justify-between py-2.5 gap-2">
                        <span className="font-semibold text-stone-700 dark:text-stone-300 shrink-0">Official Email:</span>
                        <span className="font-medium text-stone-900 dark:text-stone-100 text-right min-w-0 break-all">{bizProfile.business_email}</span>
                      </div>
                    )}
                    {bizProfile.business_phone && (
                      <div className="flex items-center justify-between py-2.5 gap-2">
                        <span className="font-semibold text-stone-700 dark:text-stone-300 shrink-0">Contact Phone:</span>
                        <span className="font-medium text-stone-900 dark:text-stone-100 text-right min-w-0">{bizProfile.business_phone}</span>
                      </div>
                    )}
                    {bizProfile.address_line && (
                      <div className="flex items-start justify-between py-2.5 gap-4">
                        <span className="font-semibold text-stone-700 dark:text-stone-300 shrink-0">Address:</span>
                        <span className="font-medium text-stone-900 dark:text-stone-100 text-right min-w-0 break-words">
                          {[bizProfile.address_line, bizProfile.city, bizProfile.state, bizProfile.postal_code, bizProfile.country].filter(Boolean).join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={`${CARD_STYLES.base} min-w-0 flex flex-col justify-between`}>
                <div>
                  <div className="border-b border-stone-200/80 dark:border-stone-800 pb-4 mb-4">
                    <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                      <Clock size={18} className="text-[#F59E0B]" />
                      <span>Operating Hours &amp; Services</span>
                    </h3>
                    <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                      Business operating timings and operational highlights.
                    </p>
                  </div>

                  <div className="divide-y divide-stone-100 dark:divide-stone-800/80 text-xs">
                    {bizProfile.operating_hours && (
                      <div className="flex items-center justify-between py-2.5 gap-2">
                        <span className="font-semibold text-stone-700 dark:text-stone-300 shrink-0">Daily Hours:</span>
                        <span className="font-medium text-stone-900 dark:text-stone-100 text-right min-w-0">{bizProfile.operating_hours}</span>
                      </div>
                    )}
                    {bizProfile.weekly_closed_days && (
                      <div className="flex items-center justify-between py-2.5 gap-2">
                        <span className="font-semibold text-stone-700 dark:text-stone-300 shrink-0">Weekly Closed Days:</span>
                        <span className="font-medium text-stone-900 dark:text-stone-100 text-right min-w-0">{bizProfile.weekly_closed_days}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between py-2.5 gap-2">
                      <span className="font-semibold text-stone-700 dark:text-stone-300 shrink-0">Timezone:</span>
                      <span className="font-medium text-stone-900 dark:text-stone-100 text-right min-w-0">Asia/Kolkata (IST)</span>
                    </div>
                  </div>

                  {bizProfile.business_highlights && (
                    <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800/80">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
                        Specialties &amp; Highlights:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {bizProfile.business_highlights.split(",").map((h, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-lg bg-stone-100 dark:bg-stone-800 px-2.5 py-1 text-xs font-medium text-stone-700 dark:text-stone-300"
                          >
                            <CheckCircle2 size={12} className="text-[#F59E0B]" />
                            <span>{h.trim()}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      )}

    </div>
  );
}
