import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import { db } from "../firebase/firebase";
import {
  Users,
  UserPlus,
  CheckCircle2,
  XCircle,
  Star,
  RefreshCw,
  Search,
  X,
  Eye,
  EyeOff,
  Copy,
  type LucideIcon,
} from "lucide-react";
import { DEPARTMENTS } from "../utils/department";
import type { Technician } from "../types";

type TechnicianForm = {
  name: string;
  email: string;
  phone: string;
  area: string;
  department: string;
};

type FormErrors = Partial<Record<keyof TechnicianForm, string>>;
type StatusFilter = "All" | "Active" | "Inactive";

type StatCard = {
  title: string;
  value: string | number;
  icon: LucideIcon;
  tone: string;
};

const EMPTY_FORM: TechnicianForm = {
  name: "",
  email: "",
  phone: "",
  area: "",
  department: "",
};

const TEXT_FIELDS: {
  name: "name" | "email" | "phone" | "area";
  label: string;
  placeholder: string;
  type?: string;
  inputMode?: "numeric";
}[] = [
  { name: "name", label: "Full name", placeholder: "Enter technician name" },
  { name: "email", label: "Email address", placeholder: "technician@example.com", type: "email" },
  { name: "phone", label: "Phone number", placeholder: "10 digit phone number", inputMode: "numeric" },
  { name: "area", label: "Area/Zone", placeholder: "Enter working area" },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10}$/;

const ADD_ERROR_MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "This email is already registered",
  "auth/invalid-email": "Invalid email address",
  "auth/weak-password": "Password is too weak",
  "permission-denied": "Permission denied. Check Firebase rules.",
};

const PANEL = "rounded-xl border border-slate-200 bg-white shadow-sm";
const CONTROL =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20";
const BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
const PRIMARY_BUTTON = `${BUTTON} bg-blue-700 text-white shadow-sm hover:bg-blue-800`;
const SECONDARY_BUTTON = `${BUTTON} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
const ROW_ACTION =
  "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50";

// A separate Firebase app is used so creating a technician doesn't sign the admin out
const SECONDARY_APP_NAME = "technician-signup";

function getSecondaryAuth() {
  const app =
    getApps().find((a) => a.name === SECONDARY_APP_NAME) ??
    initializeApp(getApp().options, SECONDARY_APP_NAME);
  return getAuth(app);
}

function randomInt(max: number) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
}

function generatePassword(length = 12) {
  const sets = [
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "abcdefghijklmnopqrstuvwxyz",
    "0123456789",
    "@#$%&!*",
  ];
  const allChars = sets.join("");

  // One character from each set, then fill the rest
  const chars = sets.map((set) => set[randomInt(set.length)]);
  while (chars.length < length) {
    chars.push(allChars[randomInt(allChars.length)]);
  }

  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function validateForm(form: TechnicianForm, technicians: Technician[]): FormErrors {
  const errors: FormErrors = {};
  const email = form.email.trim().toLowerCase();
  const phone = form.phone.trim();

  if (!form.name.trim()) errors.name = "Name is required";

  if (!email) errors.email = "Email is required";
  else if (!EMAIL_REGEX.test(email)) errors.email = "Invalid email format";
  else if (technicians.some((t) => t.email?.toLowerCase() === email)) {
    errors.email = "Email already exists";
  }

  if (!phone) errors.phone = "Phone is required";
  else if (!PHONE_REGEX.test(phone)) errors.phone = "Phone must be 10 digits";

  if (!form.area.trim()) errors.area = "Area is required";
  if (!form.department) errors.department = "Department is required";

  return errors;
}

function getErrorCode(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err ? String(err.code) : "";
}

const controlClass = (hasError: boolean) =>
  `${CONTROL} ${hasError ? "border-red-400 focus:border-red-500 focus:ring-red-500/20" : ""}`;

function Modal({
  title,
  titleId,
  onClose,
  children,
}: {
  title: string;
  titleId: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Technicians() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<TechnicianForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const isMounted = useRef(true);

  const fetchTechnicians = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const q = query(collection(db, "technicians"), orderBy("name"));
      const snapshot = await getDocs(q);
      if (!isMounted.current) return;
      setTechnicians(
        snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Technician, "id">) }))
      );
    } catch (err) {
      console.error("Error fetching technicians:", err);
      if (isMounted.current) {
        setError("Failed to load technicians. Please check your connection and try again.");
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetchTechnicians();
    return () => {
      isMounted.current = false;
    };
  }, [fetchTechnicians]);

  useEffect(() => {
    if (!passwordCopied) return;
    const timer = setTimeout(() => setPasswordCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [passwordCopied]);

  const stats = useMemo(() => {
    let active = 0;
    let ratingTotal = 0;
    let ratedCount = 0;
    const departments = new Set<string>();

    for (const t of technicians) {
      if (t.isActive) active++;
      if (t.rating) {
        ratingTotal += t.rating;
        ratedCount++;
      }
      if (t.department) departments.add(t.department);
    }

    return {
      total: technicians.length,
      active,
      inactive: technicians.length - active,
      departments: departments.size,
      avgRating: ratedCount > 0 ? ratingTotal / ratedCount : null,
    };
  }, [technicians]);

  const filteredTechnicians = useMemo(() => {
    const term = search.trim().toLowerCase();

    return technicians.filter((tech) => {
      if (departmentFilter !== "All" && tech.department !== departmentFilter) return false;
      if (statusFilter === "Active" && !tech.isActive) return false;
      if (statusFilter === "Inactive" && tech.isActive) return false;

      if (!term) return true;
      return [tech.name, tech.email, tech.phone, tech.area].some((field) =>
        field?.toLowerCase().includes(term)
      );
    });
  }, [technicians, search, departmentFilter, statusFilter]);

  const loadFailed = error !== "" && technicians.length === 0;

  const handleToggleStatus = async (tech: Technician) => {
    try {
      setUpdatingId(tech.id);
      setError("");
      const isActive = !tech.isActive;

      await updateDoc(doc(db, "technicians", tech.id), { isActive, updatedAt: new Date() });
      setTechnicians((prev) => prev.map((t) => (t.id === tech.id ? { ...t, isActive } : t)));
    } catch (err) {
      console.error("Error updating technician:", err);
      setError("Failed to update technician status");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (tech: Technician) => {
    const message = `Delete ${tech.name}? This removes the technician record but not their login account.`;
    if (!window.confirm(message)) return;

    try {
      setUpdatingId(tech.id);
      setError("");
      await deleteDoc(doc(db, "technicians", tech.id));
      setTechnicians((prev) => prev.filter((t) => t.id !== tech.id));
    } catch (err) {
      console.error("Error deleting technician:", err);
      setError("Failed to delete technician");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleInputChange = (field: keyof TechnicianForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: "" }));
    if (formError) setFormError("");
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setFormError("");
  };

  const handleAddTechnician = async (e: FormEvent) => {
    e.preventDefault();

    const errors = validateForm(form, technicians);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      setSubmitting(true);
      setFormError("");

      const email = form.email.trim().toLowerCase();
      const password = generatePassword();

      const secondaryAuth = getSecondaryAuth();
      const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      await signOut(secondaryAuth);

      // The Firestore document uses the Auth UID as its id
      const uid = credential.user.uid;
      const now = new Date();
      const technicianData = {
        name: form.name.trim(),
        email,
        phone: form.phone.trim(),
        area: form.area.trim(),
        department: form.department,
        isActive: true,
        authId: uid,
        role: "technician",
        createdAt: now,
        updatedAt: now,
        assignedComplaints: [],
        totalResolved: 0,
        rating: 0,
      };

      await setDoc(doc(db, "technicians", uid), technicianData);

      const created: Technician = { id: uid, ...technicianData };
      setTechnicians((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));

      setCredentials({ email, password });
      closeAddModal();
    } catch (err) {
      console.error("Error adding technician:", err);
      setFormError(ADD_ERROR_MESSAGES[getErrorCode(err)] || "Failed to add technician");
    } finally {
      setSubmitting(false);
    }
  };

  const copyPassword = async () => {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(credentials.password);
      setPasswordCopied(true);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const closeCredentials = () => {
    setCredentials(null);
    setShowPassword(false);
    setPasswordCopied(false);
  };

  const cards: StatCard[] = [
    { title: "Total technicians", value: stats.total, icon: Users, tone: "bg-slate-100 text-slate-600" },
    { title: "Active", value: stats.active, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" },
    { title: "Inactive", value: stats.inactive, icon: XCircle, tone: "bg-slate-100 text-slate-600" },
    {
      title: "Avg. rating",
      value: stats.avgRating === null ? "-" : stats.avgRating.toFixed(1),
      icon: Star,
      tone: "bg-amber-50 text-amber-600",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Technician management</h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage and monitor all technicians across departments.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={fetchTechnicians} disabled={loading} className={SECONDARY_BUTTON}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button type="button" onClick={() => setShowAddModal(true)} className={PRIMARY_BUTTON}>
              <UserPlus className="h-4 w-4" />
              Add technician
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div role="status" className={`${PANEL} p-12 text-center text-sm text-slate-600`}>
            Loading technicians...
          </div>
        )}

        {!loading && !loadFailed && (
          <>
            <section aria-label="Technician totals" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map(({ title, value, icon: Icon, tone }) => (
                <div key={title} className={`${PANEL} p-5`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-600">{title}</p>
                      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
                    </div>
                    <span className={`rounded-lg p-2 ${tone}`}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              ))}
            </section>

            <section className={`${PANEL} overflow-hidden`}>
              <div className="flex flex-col gap-4 border-b border-slate-200 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-slate-900">
                    Technicians ({filteredTechnicians.length})
                  </h2>
                  <span className="text-sm text-slate-500">{stats.departments} departments</span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor="technician-search" className="mb-1 block text-xs font-medium text-slate-600">
                      Search
                    </label>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        id="technician-search"
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Name, email, phone or area..."
                        className={`${CONTROL} pl-9`}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="department-filter" className="mb-1 block text-xs font-medium text-slate-600">
                      Department
                    </label>
                    <select
                      id="department-filter"
                      value={departmentFilter}
                      onChange={(e) => setDepartmentFilter(e.target.value)}
                      className={CONTROL}
                    >
                      <option value="All">All departments</option>
                      {DEPARTMENTS.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="status-filter" className="mb-1 block text-xs font-medium text-slate-600">
                      Status
                    </label>
                    <select
                      id="status-filter"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                      className={CONTROL}
                    >
                      <option value="All">All status</option>
                      <option value="Active">Active only</option>
                      <option value="Inactive">Inactive only</option>
                    </select>
                  </div>
                </div>
              </div>

              {filteredTechnicians.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="font-medium text-slate-800">No technicians found</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {technicians.length === 0
                      ? "Add your first technician to get started"
                      : "Try changing the search or filters"}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-medium text-slate-600">
                      <tr>
                        <th scope="col" className="px-5 py-3">Technician</th>
                        <th scope="col" className="px-5 py-3">Phone</th>
                        <th scope="col" className="px-5 py-3">Area</th>
                        <th scope="col" className="px-5 py-3">Department</th>
                        <th scope="col" className="px-5 py-3">Status</th>
                        <th scope="col" className="px-5 py-3">Rating</th>
                        <th scope="col" className="px-5 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTechnicians.map((tech) => {
                        const department = DEPARTMENTS.find((d) => d.id === tech.department);

                        return (
                          <tr key={tech.id} className="transition-colors hover:bg-slate-50">
                            <td className="px-5 py-4">
                              <p className="font-medium text-slate-900">{tech.name}</p>
                              <p className="text-slate-500">{tech.email}</p>
                            </td>

                            <td className="px-5 py-4 text-slate-700">{tech.phone}</td>
                            <td className="px-5 py-4 text-slate-700">{tech.area}</td>
                            <td className="px-5 py-4 text-slate-700">
                              {department?.name || tech.department || "-"}
                            </td>

                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                                  tech.isActive
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-slate-200 bg-slate-50 text-slate-600"
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    tech.isActive ? "bg-emerald-500" : "bg-slate-400"
                                  }`}
                                />
                                {tech.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>

                            <td className="px-5 py-4">
                              <p className="text-slate-900">
                                {tech.rating ? `${tech.rating.toFixed(1)}/5` : "-"}
                              </p>
                              <p className="text-xs text-slate-500">Resolved: {tech.totalResolved || 0}</p>
                            </td>

                            <td className="whitespace-nowrap px-5 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(tech)}
                                disabled={updatingId === tech.id}
                                className={`${ROW_ACTION} text-blue-700 hover:bg-blue-50`}
                              >
                                {tech.isActive ? "Deactivate" : "Activate"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(tech)}
                                disabled={updatingId === tech.id}
                                className={`${ROW_ACTION} text-red-600 hover:bg-red-50`}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {showAddModal && (
        <Modal title="Add technician" titleId="add-technician-title" onClose={submitting ? undefined : closeAddModal}>
          <form onSubmit={handleAddTechnician} noValidate className="space-y-4 p-5">
            {formError && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}

            {TEXT_FIELDS.map((field) => (
              <div key={field.name}>
                <label htmlFor={`technician-${field.name}`} className="mb-1.5 block text-sm font-medium text-slate-700">
                  {field.label} <span className="text-red-500" aria-hidden="true">*</span>
                </label>
                <input
                  id={`technician-${field.name}`}
                  type={field.type || "text"}
                  inputMode={field.inputMode}
                  placeholder={field.placeholder}
                  value={form[field.name]}
                  onChange={(e) => handleInputChange(field.name, e.target.value)}
                  aria-invalid={!!formErrors[field.name]}
                  aria-describedby={formErrors[field.name] ? `technician-${field.name}-error` : undefined}
                  className={controlClass(!!formErrors[field.name])}
                />
                {formErrors[field.name] && (
                  <p id={`technician-${field.name}-error`} className="mt-1 text-xs text-red-600">
                    {formErrors[field.name]}
                  </p>
                )}
              </div>
            ))}

            <div>
              <label htmlFor="technician-department" className="mb-1.5 block text-sm font-medium text-slate-700">
                Department <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <select
                id="technician-department"
                value={form.department}
                onChange={(e) => handleInputChange("department", e.target.value)}
                aria-invalid={!!formErrors.department}
                aria-describedby={formErrors.department ? "technician-department-error" : undefined}
                className={controlClass(!!formErrors.department)}
              >
                <option value="">Select department</option>
                {DEPARTMENTS.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
              {formErrors.department && (
                <p id="technician-department-error" className="mt-1 text-xs text-red-600">
                  {formErrors.department}
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeAddModal} disabled={submitting} className={SECONDARY_BUTTON}>
                Cancel
              </button>
              <button type="submit" disabled={submitting} className={PRIMARY_BUTTON}>
                {submitting ? "Creating..." : "Create technician account"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {credentials && (
        <Modal title="Technician created" titleId="credentials-title">
          <div className="space-y-4 p-5 text-sm">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Email</p>
              <p className="text-slate-900">{credentials.email}</p>
            </div>

            <div>
              <label htmlFor="temporary-password" className="mb-1 block text-xs font-medium text-slate-500">
                Temporary password
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="temporary-password"
                  type={showPassword ? "text" : "password"}
                  value={credentials.password}
                  readOnly
                  autoComplete="off"
                  className={`${CONTROL} flex-1 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="rounded-lg border border-slate-300 p-2 text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
                <button
                  type="button"
                  onClick={copyPassword}
                  className="rounded-lg border border-slate-300 p-2 text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  aria-label="Copy password"
                >
                  <Copy className="h-5 w-5" />
                </button>
              </div>
              {passwordCopied && (
                <p role="status" className="mt-2 text-xs text-emerald-600">
                  Copied to clipboard
                </p>
              )}
            </div>

            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800">
              This password is shown only once. Share it with the technician securely so they can sign
              in to the mobile app.
            </p>
          </div>

          <div className="flex justify-end border-t border-slate-200 px-5 py-4">
            <button type="button" onClick={closeCredentials} className={PRIMARY_BUTTON}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}