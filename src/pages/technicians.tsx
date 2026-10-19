import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
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
}[] = [
  { name: "name", label: "Full Name", placeholder: "Enter technician name" },
  { name: "email", label: "Email Address", placeholder: "technician@example.com", type: "email" },
  { name: "phone", label: "Phone Number", placeholder: "10 digit phone number" },
  { name: "area", label: "Area/Zone", placeholder: "Enter working area" },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10}$/;

const BADGE = "inline-block px-2 py-0.5 rounded border text-xs font-medium";

const ADD_ERROR_MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "This email is already registered",
  "auth/invalid-email": "Invalid email address",
  "auth/weak-password": "Password is too weak",
  "permission-denied": "Permission denied. Check Firebase rules.",
};

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

function validateForm(form: TechnicianForm, technicians: Technician[]) {
  const errors: Record<string, string> = {};
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

const inputClass = (hasError: boolean) =>
  `w-full px-3 py-2 border rounded text-sm focus:outline-none focus:border-blue-500 ${
    hasError ? "border-red-300" : "border-gray-300"
  }`;

const selectClass =
  "w-full px-3 py-2 border border-gray-300 rounded bg-white text-sm focus:outline-none focus:border-blue-500";

export default function Technicians() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<TechnicianForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

  const fetchTechnicians = async () => {
    try {
      setLoading(true);
      setError("");
      const q = query(collection(db, "technicians"), orderBy("name"));
      const snapshot = await getDocs(q);
      setTechnicians(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Technician[]);
    } catch (err) {
      console.error("Error fetching technicians:", err);
      setError("Failed to load technicians. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTechnicians();
  }, []);

  // Depends only on the full list, so typing in search doesn't recount it
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

  const searchText = search.trim().toLowerCase();

  const filteredTechnicians = technicians.filter((tech) => {
    if (departmentFilter !== "All" && tech.department !== departmentFilter) return false;
    if (statusFilter === "Active" && !tech.isActive) return false;
    if (statusFilter === "Inactive" && tech.isActive) return false;

    if (!searchText) return true;
    return [tech.name, tech.email, tech.phone, tech.area].some((field) =>
      field?.toLowerCase().includes(searchText)
    );
  });

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
    } catch (err: any) {
      console.error("Error adding technician:", err);
      setFormError(ADD_ERROR_MESSAGES[err?.code] || "Failed to add technician");
    } finally {
      setSubmitting(false);
    }
  };

  const copyPassword = async () => {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(credentials.password);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const closeCredentials = () => {
    setCredentials(null);
    setShowPassword(false);
    setPasswordCopied(false);
  };

  const cards = [
    { title: "Total Technicians", value: stats.total, icon: Users },
    { title: "Active", value: stats.active, icon: CheckCircle2 },
    { title: "Inactive", value: stats.inactive, icon: XCircle },
    {
      title: "Avg. Rating",
      value: stats.avgRating === null ? "-" : stats.avgRating.toFixed(1),
      icon: Star,
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Technician Management</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage and monitor all technicians across departments
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchTechnicians}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              <UserPlus className="w-4 h-4" />
              Add Technician
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email, phone or area..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Department</label>
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className={selectClass}>
              <option value="All">All Departments</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
              <option value="All">All Status</option>
              <option value="Active">Active Only</option>
              <option value="Inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="border border-red-200 bg-red-50 text-red-700 text-sm rounded px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <div className="border border-gray-200 rounded p-12 text-center text-gray-600">
            Loading technicians...
          </div>
        ) : (
          !loadFailed && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div key={card.title} className="border border-gray-200 rounded p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm text-gray-600">{card.title}</p>
                          <p className="text-3xl font-semibold text-gray-900 mt-1">{card.value}</p>
                        </div>
                        <Icon className="w-5 h-5 text-gray-400" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Technicians table */}
              <div className="border border-gray-200 rounded overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">
                    Technicians ({filteredTechnicians.length})
                  </h2>
                  <span className="text-sm text-gray-500">{stats.departments} departments</span>
                </div>

                {filteredTechnicians.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-gray-700 font-medium">No technicians found</p>
                    <p className="text-gray-500 text-sm mt-1">
                      {technicians.length === 0
                        ? "Add your first technician to get started"
                        : "Try changing the search or filters"}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
                        <tr>
                          <th className="px-4 py-3">Technician</th>
                          <th className="px-4 py-3">Phone</th>
                          <th className="px-4 py-3">Area</th>
                          <th className="px-4 py-3">Department</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Rating</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredTechnicians.map((tech) => {
                          const department = DEPARTMENTS.find((d) => d.id === tech.department);

                          return (
                            <tr key={tech.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <p className="font-medium text-gray-900">{tech.name}</p>
                                <p className="text-gray-500">{tech.email}</p>
                              </td>

                              <td className="px-4 py-3 text-gray-700">{tech.phone}</td>
                              <td className="px-4 py-3 text-gray-700">{tech.area}</td>
                              <td className="px-4 py-3 text-gray-700">
                                {department?.name || tech.department || "-"}
                              </td>

                              <td className="px-4 py-3">
                                <span
                                  className={`${BADGE} ${
                                    tech.isActive
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : "bg-gray-50 text-gray-700 border-gray-200"
                                  }`}
                                >
                                  {tech.isActive ? "Active" : "Inactive"}
                                </span>
                              </td>

                              <td className="px-4 py-3">
                                <p className="text-gray-900">
                                  {tech.rating ? `${tech.rating.toFixed(1)}/5` : "-"}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Resolved: {tech.totalResolved || 0}
                                </p>
                              </td>

                              <td className="px-4 py-3 text-right space-x-4 whitespace-nowrap">
                                <button
                                  onClick={() => handleToggleStatus(tech)}
                                  disabled={updatingId === tech.id}
                                  className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                                >
                                  {tech.isActive ? "Deactivate" : "Activate"}
                                </button>
                                <button
                                  onClick={() => handleDelete(tech)}
                                  disabled={updatingId === tech.id}
                                  className="text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
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
              </div>
            </>
          )
        )}
      </div>

      {/* Add technician modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded border border-gray-200 w-full max-w-md max-h-[90vh] overflow-y-auto"
          >
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Add Technician</h2>
              <button
                onClick={closeAddModal}
                disabled={submitting}
                className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTechnician} noValidate className="p-4 space-y-4">
              {formError && (
                <div className="border border-red-200 bg-red-50 text-red-700 text-sm rounded px-3 py-2">
                  {formError}
                </div>
              )}

              {TEXT_FIELDS.map((field) => (
                <div key={field.name}>
                  <label className="block text-sm text-gray-700 mb-1">{field.label} *</label>
                  <input
                    type={field.type || "text"}
                    placeholder={field.placeholder}
                    value={form[field.name]}
                    onChange={(e) => handleInputChange(field.name, e.target.value)}
                    className={inputClass(!!formErrors[field.name])}
                  />
                  {formErrors[field.name] && (
                    <p className="text-red-600 text-xs mt-1">{formErrors[field.name]}</p>
                  )}
                </div>
              ))}

              <div>
                <label className="block text-sm text-gray-700 mb-1">Department *</label>
                <select
                  value={form.department}
                  onChange={(e) => handleInputChange("department", e.target.value)}
                  className={`${inputClass(!!formErrors.department)} bg-white`}
                >
                  <option value="">Select Department</option>
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
                {formErrors.department && (
                  <p className="text-red-600 text-xs mt-1">{formErrors.department}</p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAddModal}
                  disabled={submitting}
                  className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? "Creating..." : "Create Technician Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Login credentials modal */}
      {credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded border border-gray-200 w-full max-w-md"
          >
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Technician Created</h2>
            </div>

            <div className="p-4 space-y-4 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-1">Email</p>
                <p className="text-gray-900">{credentials.email}</p>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">Temporary Password</p>
                <div className="flex items-center gap-2">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={credentials.password}
                    readOnly
                    className="flex-1 border border-gray-300 rounded px-3 py-2 font-mono"
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-2 text-gray-500 hover:text-gray-700"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={copyPassword}
                    className="p-2 text-gray-500 hover:text-gray-700"
                    aria-label="Copy password"
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                </div>
                {passwordCopied && <p className="text-emerald-600 text-xs mt-2">Copied to clipboard</p>}
              </div>

              <p className="border border-blue-200 bg-blue-50 text-blue-700 rounded px-3 py-2">
                This password is shown only once. Share it with the technician securely so they can
                sign in to the mobile app.
              </p>
            </div>

            <div className="px-4 py-3 border-t border-gray-200 flex justify-end">
              <button
                onClick={closeCredentials}
                className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}