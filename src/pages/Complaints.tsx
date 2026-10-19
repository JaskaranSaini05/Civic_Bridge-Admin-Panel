import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebase/firebase";
import {
  ClipboardList,
  Hourglass,
  Wrench,
  CheckCircle2,
  Users,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { DEPARTMENTS } from "../utils/department";
import type { Complaint } from "../types";

const DAY_MS = 1000 * 60 * 60 * 24;

const BADGE = "inline-block px-2 py-0.5 rounded border text-xs font-medium";
const GRAY_BADGE = "bg-gray-50 text-gray-700 border-gray-200";

const STATUS_STYLES: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Assigned: "bg-indigo-50 text-indigo-700 border-indigo-200",
  "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
  Resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Closed: GRAY_BADGE,
};

const PRIORITY_STYLES: Record<string, string> = {
  Critical: "bg-red-50 text-red-700 border-red-200",
  High: "bg-orange-50 text-orange-700 border-orange-200",
  Medium: "bg-blue-50 text-blue-700 border-blue-200",
  Low: GRAY_BADGE,
};

// Used only when a complaint has no valid `department` value
const CATEGORY_KEYWORDS: [string, string][] = [
  ["road", "roads"],
  ["traffic", "roads"],
  ["electric", "electricity"],
  ["water", "water"],
  ["garbage", "sanitation"],
  ["sanitation", "sanitation"],
  ["building", "building"],
  ["construction", "building"],
  ["park", "parks"],
  ["garden", "parks"],
  ["public", "public"],
  ["general", "public"],
];

function toDate(value: any): Date | null {
  if (!value) return null;
  const date = value.toDate ? value.toDate() : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function formatDate(value: any) {
  const date = toDate(value);
  if (!date) return "-";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

function getDepartment(complaint: Complaint) {
  const direct = DEPARTMENTS.find((d) => d.id === complaint.department);
  if (direct) return direct;

  const category = (complaint.category || "").toLowerCase();
  const match = CATEGORY_KEYWORDS.find(([keyword]) => category.includes(keyword));
  return match ? DEPARTMENTS.find((d) => d.id === match[1]) : undefined;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="text-gray-900">{children}</div>
    </div>
  );
}

function ComplaintDetail({ complaint, onClose }: { complaint: Complaint; onClose: () => void }) {
  const dept = getDepartment(complaint);
  const status = complaint.status || "Pending";
  const created = toDate(complaint.createdAt);
  const updated = toDate(complaint.updatedAt);
  const resolutionDays =
    status === "Resolved" && created && updated ? daysBetween(created, updated) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded border border-gray-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{complaint.title || "No Title"}</h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-5 text-sm">
          <Field label="Description">
            <p className="whitespace-pre-wrap">{complaint.description || "No description provided"}</p>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <span className={`${BADGE} ${STATUS_STYLES[status] || GRAY_BADGE}`}>{status}</span>
            </Field>
            <Field label="Priority">
              <span className={`${BADGE} ${PRIORITY_STYLES[complaint.priority || ""] || GRAY_BADGE}`}>
                {complaint.priority || "Not Set"}
              </span>
            </Field>
            <Field label="Department">
              {dept ? `${dept.icon} ${dept.name}` : "-"}
            </Field>
            <Field label="Category">{complaint.category || "General"}</Field>
          </div>

          <Field label="Location">
            <p>{complaint.address || "No address provided"}</p>
            {complaint.lat != null && complaint.lng != null && (
              <p className="text-gray-500 mt-1">
                Coordinates: {complaint.lat}, {complaint.lng}
              </p>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Created">{formatDate(complaint.createdAt)}</Field>
            <Field label="Updated">{formatDate(complaint.updatedAt)}</Field>
            {resolutionDays !== null && (
              <Field label="Resolution Time">{resolutionDays} days</Field>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="User Email">{complaint.userEmail || "No email"}</Field>
            <Field label="User ID">
              <span className="font-mono text-xs break-all">{complaint.userID || "-"}</span>
            </Field>
          </div>

          <Field label="Assigned To">
            {complaint.assignedToName ? (
              <>
                <p>{complaint.assignedToName}</p>
                {complaint.assignedTo && (
                  <p className="text-xs text-gray-500">{complaint.assignedTo}</p>
                )}
              </>
            ) : (
              <span className="text-gray-500">Not assigned</span>
            )}
          </Field>
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Complaints() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");

  const fetchComplaints = async () => {
    try {
      setLoading(true);
      setError(null);
      const q = query(collection(db, "complaints"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setComplaints(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Complaint)));
    } catch (err) {
      console.error("Error fetching complaints:", err);
      setError("Failed to load complaints. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, []);

  // Depends only on the full list, so typing in search doesn't recount it
  const stats = useMemo(() => {
    let pending = 0;
    let inProgress = 0;
    let resolved = 0;
    let unassigned = 0;

    for (const c of complaints) {
      const status = c.status || "Pending";
      if (status === "Pending") pending++;
      else if (status === "In Progress") inProgress++;
      else if (status === "Resolved") resolved++;

      if (!c.assignedTo) unassigned++;
    }

    return { total: complaints.length, pending, inProgress, resolved, unassigned };
  }, [complaints]);

  const searchText = search.trim().toLowerCase();

  const filteredComplaints = complaints.filter((c) => {
    if (statusFilter !== "All" && (c.status || "Pending") !== statusFilter) return false;
    if (priorityFilter !== "All" && c.priority !== priorityFilter) return false;
    if (departmentFilter !== "All" && getDepartment(c)?.id !== departmentFilter) return false;

    if (!searchText) return true;
    return [c.title, c.description, c.address, c.userEmail].some((field) =>
      field?.toLowerCase().includes(searchText)
    );
  });

  const loadFailed = error !== null && complaints.length === 0;

  const cards = [
    { title: "Total", value: stats.total, icon: ClipboardList },
    { title: "Pending", value: stats.pending, icon: Hourglass },
    { title: "In Progress", value: stats.inProgress, icon: Wrench },
    { title: "Resolved", value: stats.resolved, icon: CheckCircle2 },
    { title: "Unassigned", value: stats.unassigned, icon: Users },
  ];

  const selectClass =
    "w-full px-3 py-2 border border-gray-300 rounded bg-white text-sm focus:outline-none focus:border-blue-500";

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Complaints Management</h1>
            <p className="text-sm text-gray-600 mt-1">
              Track and manage complaints across all departments
            </p>
          </div>
          <button
            onClick={fetchComplaints}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search complaints..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
              <option value="All">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
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
            <label className="block text-xs text-gray-600 mb-1">Priority</label>
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className={selectClass}>
              <option value="All">All Priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
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
            Loading complaints...
          </div>
        ) : (
          !loadFailed && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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

              {/* Complaints table */}
              <div className="border border-gray-200 rounded overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h2 className="font-semibold text-gray-900">
                    Complaints ({filteredComplaints.length})
                  </h2>
                </div>

                {filteredComplaints.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-gray-700 font-medium">No complaints found</p>
                    <p className="text-gray-500 text-sm mt-1">
                      {complaints.length === 0
                        ? "No complaints have been submitted"
                        : "Try changing the search or filters"}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
                        <tr>
                          <th className="px-4 py-3">Complaint</th>
                          <th className="px-4 py-3">Department</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Assigned To</th>
                          <th className="px-4 py-3">Priority</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredComplaints.map((c) => {
                          const dept = getDepartment(c);
                          const status = c.status || "Pending";

                          return (
                            <tr key={c.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <p className="font-medium text-gray-900">{c.title || "No Title"}</p>
                                <p className="text-gray-500 truncate max-w-md">{c.description}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {formatDate(c.createdAt)} • {c.userEmail || "No email"}
                                </p>
                              </td>

                              <td className="px-4 py-3">
                                <p className="text-gray-900">
                                  {dept ? `${dept.icon} ${dept.name}` : "-"}
                                </p>
                                <p className="text-xs text-gray-500">{c.category || "General"}</p>
                              </td>

                              <td className="px-4 py-3">
                                <span className={`${BADGE} ${STATUS_STYLES[status] || GRAY_BADGE}`}>
                                  {status}
                                </span>
                              </td>

                              <td className="px-4 py-3 text-gray-700">
                                {c.assignedToName || <span className="text-gray-500">Unassigned</span>}
                              </td>

                              <td className="px-4 py-3">
                                <span className={`${BADGE} ${PRIORITY_STYLES[c.priority || ""] || GRAY_BADGE}`}>
                                  {c.priority || "Not Set"}
                                </span>
                              </td>

                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={() => setSelectedComplaint(c)}
                                  className="text-blue-600 hover:text-blue-800 font-medium"
                                >
                                  View Details
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

      {selectedComplaint && (
        <ComplaintDetail complaint={selectedComplaint} onClose={() => setSelectedComplaint(null)} />
      )}
    </div>
  );
}