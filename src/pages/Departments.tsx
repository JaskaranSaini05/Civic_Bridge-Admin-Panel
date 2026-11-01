import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Hourglass,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { DEPARTMENTS } from "../utils/department";

type DepartmentComplaint = {
  id: string;
  title: string;
  description: string;
  category: string;
  address: string;
  status: string;
  department: string;
  assignedTo: string;
  assignedTechName: string;
  assignedTechEmail: string;
  createdAt: Date | null;
};

type DepartmentTechnician = {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  area: string;
  rating: number;
  totalResolved: number;
  isActive: boolean;
};

type Department = (typeof DEPARTMENTS)[number];
type Counts = Record<string, number>;

const PAGE_SIZE = 10;
const STATUS_TABS = ["Pending", "Assigned", "In Progress", "Resolved"];

const STATUS_ALIASES: Record<string, string> = {
  pending: "Pending",
  assigned: "Assigned",
  inprogress: "In Progress",
  resolved: "Resolved",
};

const BADGE = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium";
const NEUTRAL_BADGE = "border-slate-200 bg-slate-50 text-slate-700";

const STATUS_STYLES: Record<string, string> = {
  Pending: "border-amber-200 bg-amber-50 text-amber-800",
  Assigned: "border-indigo-200 bg-indigo-50 text-indigo-800",
  "In Progress": "border-sky-200 bg-sky-50 text-sky-800",
  Resolved: "border-teal-200 bg-teal-50 text-teal-800",
};

const CATEGORY_KEYWORDS: [string, string][] = [
  ["street light", "electricity"],
  ["electric", "electricity"],
  ["drain", "water"],
  ["water", "water"],
  ["road", "roads"],
  ["traffic", "transport"],
  ["traffic", "roads"],
  ["garbage", "sanitation"],
  ["sanitation", "sanitation"],
  ["building", "building"],
  ["construction", "building"],
  ["park", "parks"],
  ["garden", "parks"],
  ["public", "public"],
  ["general", "public"],
];

const DEPARTMENT_BY_ID = new Map<string, Department>(DEPARTMENTS.map((d) => [d.id, d]));

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100";

const outlineButton =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-50";

const solidButton =
  "inline-flex items-center gap-2 rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-60";

class AssignError extends Error {}

function toDate(value: any): Date | null {
  if (!value) return null;
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date | null) {
  if (!date) return "–";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function normalizeStatus(status: string | undefined, isAssigned: boolean) {
  if (!status) return isAssigned ? "Assigned" : "Pending";
  const key = status.replace(/\s/g, "").toLowerCase();
  return STATUS_ALIASES[key] || status;
}

function getDepartmentId(department: string | undefined, category: string | undefined) {
  if (department && DEPARTMENT_BY_ID.has(department)) return department;

  const text = (category || "").toLowerCase();
  for (const [keyword, id] of CATEGORY_KEYWORDS) {
    if (DEPARTMENT_BY_ID.has(id) && text.includes(keyword)) return id;
  }
  return "";
}

function bump(map: Map<string, Counts>, key: string, field: string) {
  const counts = map.get(key) || {};
  counts[field] = (counts[field] || 0) + 1;
  map.set(key, counts);
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>{children}</div>;
}

function AssignModal({
  complaint,
  technicians,
  workload,
  onAssign,
  onClose,
}: {
  complaint: DepartmentComplaint;
  technicians: DepartmentTechnician[];
  workload: Map<string, number>;
  onAssign: (complaint: DepartmentComplaint, technician: DepartmentTechnician) => Promise<void>;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const department = DEPARTMENT_BY_ID.get(complaint.department);

  const candidates = useMemo(
    () =>
      technicians
        .filter((t) => t.isActive && t.department === complaint.department)
        .sort((a, b) => (workload.get(a.id) || 0) - (workload.get(b.id) || 0) || b.rating - a.rating),
    [technicians, workload, complaint.department]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [submitting, onClose]);

  const handleAssign = async () => {
    const technician = candidates.find((t) => t.id === selectedId);
    if (!technician || submitting) return;

    setSubmitting(true);
    setError("");
    try {
      await onAssign(complaint, technician);
    } catch (err) {
      console.error("Error assigning technician:", err);
      setError(err instanceof AssignError ? err.message : "We couldn't assign this technician. Try again.");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onClick={submitting ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <h2 id="assign-title" className="font-semibold text-slate-900">
            Assign a technician
          </h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5 text-sm">
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="font-medium text-slate-900">{complaint.title}</p>
            <p className="mt-1 text-slate-500">{complaint.address || "No address given"}</p>
            <p className="mt-2 text-slate-700">
              {complaint.category} · {department ? `${department.icon} ${department.name}` : "No department"}
            </p>
          </div>

          <div>
            <p className="mb-2 font-medium text-slate-900">Available technicians</p>

            {candidates.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-slate-500">
                {complaint.department
                  ? "No active technicians in this department. Add or activate one on the Technicians page."
                  : "This complaint has no department, so no technicians can be matched."}
              </p>
            ) : (
              <div role="radiogroup" aria-label="Technicians" className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {candidates.map((tech, index) => {
                  const selected = selectedId === tech.id;
                  return (
                    <button
                      type="button"
                      key={tech.id}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setSelectedId(tech.id)}
                      disabled={submitting}
                      className={`w-full rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 ${
                        selected ? "border-teal-600 bg-teal-50" : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 font-medium text-slate-900">
                          {tech.name}
                          {index === 0 && (
                            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                              Suggested
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">{tech.area}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {tech.rating ? `${tech.rating.toFixed(1)}/5` : "No rating"} · {tech.totalResolved} resolved ·{" "}
                        {workload.get(tech.id) || 0} open
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {[tech.email, tech.phone].filter(Boolean).join(" · ") || "No contact details"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{error}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button onClick={onClose} disabled={submitting} className={outlineButton}>
            Cancel
          </button>
          <button onClick={handleAssign} disabled={!selectedId || submitting} className={solidButton}>
            {submitting ? "Assigning…" : "Assign technician"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;
}

export default function Complaints() {
  const mounted = useRef(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [complaints, setComplaints] = useState<DepartmentComplaint[]>([]);
  const [technicians, setTechnicians] = useState<DepartmentTechnician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDept, setSelectedDept] = useState("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [assigningComplaint, setAssigningComplaint] = useState<DepartmentComplaint | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(search);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [complaintSnap, technicianSnap] = await Promise.all([
        getDocs(collection(db, "complaints")),
        getDocs(collection(db, "technicians")),
      ]);
      if (!mounted.current) return;

      const complaintList: DepartmentComplaint[] = complaintSnap.docs.map((d) => {
        const data = d.data();
        const assignedTo = data.assignedTo || "";

        return {
          id: d.id,
          title: data.title || data.description || "Untitled complaint",
          description: data.description || "",
          category: data.category || "General",
          address: data.address || "",
          status: normalizeStatus(data.status, !!assignedTo),
          department: getDepartmentId(data.department, data.category),
          assignedTo,
          assignedTechName: data.assignedTechName || "",
          assignedTechEmail: data.assignedTechEmail || "",
          createdAt: toDate(data.createdAt),
        };
      });

      complaintList.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));

      setComplaints(complaintList);
      setTechnicians(
        technicianSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || "Unnamed technician",
            email: data.email || "",
            phone: data.phone || "",
            department: data.department || "",
            area: data.area || "General",
            rating: Number(data.rating) || 0,
            totalResolved: Number(data.totalResolved) || 0,
            isActive: !!data.isActive,
          };
        })
      );
    } catch (err) {
      console.error("Error fetching complaints:", err);
      if (!mounted.current) return;
      setError(
        navigator.onLine
          ? "We couldn't load complaints. Try again in a moment."
          : "You're offline. Reconnect and try again."
      );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchData();
    return () => {
      mounted.current = false;
      clearTimeout(toastTimer.current);
    };
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [selectedDept, statusFilter, deferredSearch]);

  const { stats, techStats, workload } = useMemo(() => {
    const stats = new Map<string, Counts>();
    const techStats = new Map<string, Counts>();
    const workload = new Map<string, number>();

    for (const c of complaints) {
      bump(stats, "all", "total");
      bump(stats, "all", c.status);
      if (c.department) {
        bump(stats, c.department, "total");
        bump(stats, c.department, c.status);
      }
      if (c.assignedTo && c.status !== "Resolved") {
        workload.set(c.assignedTo, (workload.get(c.assignedTo) || 0) + 1);
      }
    }

    for (const t of technicians) {
      bump(techStats, "all", "total");
      if (t.isActive) bump(techStats, "all", "active");
      if (t.department) {
        bump(techStats, t.department, "total");
        if (t.isActive) bump(techStats, t.department, "active");
      }
    }

    return { stats, techStats, workload };
  }, [complaints, technicians]);

  const searchText = deferredSearch.trim().toLowerCase();

  const filteredComplaints = useMemo(
    () =>
      complaints.filter((c) => {
        if (selectedDept !== "all" && c.department !== selectedDept) return false;
        if (statusFilter !== "all" && c.status !== statusFilter) return false;
        if (!searchText) return true;
        return [c.title, c.description, c.address, c.category, c.assignedTechName].some((field) =>
          field.toLowerCase().includes(searchText)
        );
      }),
    [complaints, selectedDept, statusFilter, searchText]
  );

  const pageCount = Math.max(1, Math.ceil(filteredComplaints.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const visibleComplaints = filteredComplaints.slice(firstIndex, firstIndex + PAGE_SIZE);

  const filtersActive = selectedDept !== "all" || statusFilter !== "all" || search.trim() !== "";

  const clearFilters = () => {
    setSelectedDept("all");
    setStatusFilter("all");
    setSearch("");
  };

  const showToast = (message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  const closeModal = useCallback(() => setAssigningComplaint(null), []);

  const handleAssign = useCallback(async (complaint: DepartmentComplaint, technician: DepartmentTechnician) => {
    const complaintRef = doc(db, "complaints", complaint.id);
    const technicianRef = doc(db, "technicians", technician.id);

    await runTransaction(db, async (tx) => {
      const [complaintSnap, technicianSnap] = await Promise.all([tx.get(complaintRef), tx.get(technicianRef)]);

      if (!complaintSnap.exists()) throw new AssignError("This complaint no longer exists.");
      if (!technicianSnap.exists() || !technicianSnap.data().isActive) {
        throw new AssignError("This technician is no longer available. Pick someone else.");
      }

      const current = complaintSnap.data();
      if (current.assignedTo || normalizeStatus(current.status, false) !== "Pending") {
        throw new AssignError("Someone else already assigned this complaint. Refresh to see the latest.");
      }

      tx.update(complaintRef, {
        status: "Assigned",
        assignedTo: technician.id,
        assignedTechName: technician.name,
        assignedTechEmail: technician.email,
        assignedTechPhone: technician.phone,
        assignedTechDept: technician.department,
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.update(technicianRef, {
        assignedComplaints: arrayUnion(complaint.id),
        updatedAt: serverTimestamp(),
      });
    });

    if (!mounted.current) return;

    setComplaints((prev) =>
      prev.map((c) =>
        c.id === complaint.id
          ? {
              ...c,
              status: "Assigned",
              assignedTo: technician.id,
              assignedTechName: technician.name,
              assignedTechEmail: technician.email,
            }
          : c
      )
    );
    setAssigningComplaint(null);
    showToast(`Assigned to ${technician.name}.`);
  }, []);

  const hasData = complaints.length > 0;
  const loadFailed = error !== null && !hasData;

  const selectedInfo = selectedDept === "all" ? undefined : DEPARTMENT_BY_ID.get(selectedDept);
  const selectedStats = stats.get(selectedDept) || {};
  const selectedTechs = techStats.get(selectedDept) || {};
  const total = selectedStats.total || 0;
  const resolved = selectedStats.Resolved || 0;

  const cards = [
    { title: "Total complaints", value: total, icon: ClipboardList, note: "" },
    { title: "Pending", value: selectedStats.Pending || 0, icon: Hourglass, note: "Need a technician" },
    { title: "Assigned", value: selectedStats.Assigned || 0, icon: UserCheck, note: "" },
    { title: "In progress", value: selectedStats["In Progress"] || 0, icon: Wrench, note: "" },
    {
      title: "Resolved",
      value: resolved,
      icon: CheckCircle2,
      note: total > 0 ? `${Math.round((resolved / total) * 100)}% resolved` : "",
    },
    {
      title: "Active technicians",
      value: selectedTechs.active || 0,
      icon: Users,
      note: `of ${selectedTechs.total || 0} technicians`,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Complaints</h1>
          <p className="mt-1 text-sm text-slate-500">
            Assign reported issues to technicians and follow them through to resolution.
          </p>
        </div>
        <button onClick={fetchData} disabled={loading} className={solidButton}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error && !loadFailed && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <span className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {error}
          </span>
          <button
            onClick={fetchData}
            disabled={loading}
            className="rounded-md font-semibold underline underline-offset-2 hover:text-red-900 disabled:opacity-60"
          >
            Try again
          </button>
        </div>
      )}

      {loading && !hasData ? (
        <div className="space-y-6" role="status" aria-label="Loading complaints">
          <SkeletonBlock className="h-20" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonBlock key={i} className="h-28" />
            ))}
          </div>
          <SkeletonBlock className="h-96" />
        </div>
      ) : loadFailed ? (
        <Panel className="px-6 py-16 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
          <h2 className="mt-3 font-semibold text-slate-900">Complaints aren't available</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500" role="alert">
            {error}
          </p>
          <button onClick={fetchData} className={`${solidButton} mt-6`}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </button>
        </Panel>
      ) : (
        <div className="space-y-6" aria-busy={loading}>
          <Panel className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <div>
              <label htmlFor="department" className="mb-1.5 block text-xs font-medium text-slate-600">
                Department
              </label>
              <select
                id="department"
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className={inputClass}
              >
                <option value="all">All departments ({stats.get("all")?.total || 0})</option>
                {DEPARTMENTS.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.icon} {dept.name} ({stats.get(dept.id)?.total || 0})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="search" className="mb-1.5 block text-xs font-medium text-slate-600">
                Search
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Title, address, category, or technician"
                  className={`${inputClass} pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden`}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </Panel>

          <section aria-labelledby="overview-heading">
            <h2 id="overview-heading" className="text-base font-semibold text-slate-900">
              {selectedInfo ? `${selectedInfo.icon} ${selectedInfo.name}` : "All departments"}
            </h2>
            <p className="mb-3 mt-0.5 text-sm text-slate-500">
              {selectedInfo?.description || "Complaints from every department"}
            </p>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              {cards.map(({ title, value, icon: Icon, note }) => (
                <Panel key={title} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-slate-600">{title}</p>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                  </div>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
                  {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
                </Panel>
              ))}
            </div>
          </section>

          <Panel className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="font-semibold text-slate-900">Complaints ({filteredComplaints.length})</h2>

              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
                {["all", ...STATUS_TABS].map((tab) => {
                  const active = statusFilter === tab;
                  const tabCount = tab === "all" ? total : selectedStats[tab] || 0;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setStatusFilter(tab)}
                      aria-pressed={active}
                      className={`rounded-full border px-3 py-1 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                        active
                          ? "border-teal-700 bg-teal-800 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {tab === "all" ? "All" : tab} <span className={active ? "text-teal-100" : "text-slate-400"}>{tabCount}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {visibleComplaints.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <ClipboardList className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
                <p className="mt-3 font-medium text-slate-900">
                  {hasData ? "No complaints match these filters" : "No complaints yet"}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                  {hasData
                    ? "Try a different department, status, or search."
                    : "Complaints will show up here as soon as residents report issues in the app."}
                </p>
                {hasData && filtersActive && (
                  <button onClick={clearFilters} className={`${outlineButton} mt-5`}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Complaint</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Department</th>
                        <th className="px-4 py-3">Reported</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Assigned to</th>
                        <th className="px-5 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleComplaints.map((c) => {
                        const department = DEPARTMENT_BY_ID.get(c.department);

                        return (
                          <tr key={c.id} className="hover:bg-slate-50">
                            <td className="px-5 py-3.5">
                              <p className="max-w-xs truncate font-medium text-slate-900" title={c.title}>
                                {c.title}
                              </p>
                              <p className="max-w-xs truncate text-slate-500" title={c.address}>
                                {c.address || "No address"}
                              </p>
                            </td>
                            <td className="px-4 py-3.5 text-slate-700">{c.category}</td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-slate-700">
                              {department ? `${department.icon} ${department.name}` : "–"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-slate-700">{formatDate(c.createdAt)}</td>
                            <td className="px-4 py-3.5">
                              <span className={`${BADGE} ${STATUS_STYLES[c.status] || NEUTRAL_BADGE}`}>{c.status}</span>
                            </td>
                            <td className="px-4 py-3.5">
                              {c.assignedTechName ? (
                                <>
                                  <p className="text-slate-900">{c.assignedTechName}</p>
                                  <p className="text-xs text-slate-500">{c.assignedTechEmail}</p>
                                </>
                              ) : (
                                <span className="text-slate-400">Not assigned</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              {c.status === "Pending" ? (
                                <button
                                  onClick={() => setAssigningComplaint(c)}
                                  className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 font-medium text-teal-800 transition hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                                >
                                  Assign
                                </button>
                              ) : (
                                <span className="text-slate-300">–</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {pageCount > 1 && (
                  <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
                    <p>
                      Showing {firstIndex + 1}–{firstIndex + visibleComplaints.length} of {filteredComplaints.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        className={outlineButton}
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden />
                        Previous
                      </button>
                      <span className="px-1 tabular-nums">
                        {currentPage} / {pageCount}
                      </span>
                      <button
                        onClick={() => setPage(currentPage + 1)}
                        disabled={currentPage === pageCount}
                        className={outlineButton}
                        aria-label="Next page"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>
      )}

      {assigningComplaint && (
        <AssignModal
          key={assigningComplaint.id}
          complaint={assigningComplaint}
          technicians={technicians}
          workload={workload}
          onAssign={handleAssign}
          onClose={closeModal}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2.5 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg"
        >
          <CheckCircle2 className="h-4 w-4 text-teal-300" aria-hidden />
          {toast}
        </div>
      )}
    </div>
  );
}