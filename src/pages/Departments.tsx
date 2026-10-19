import { useEffect, useMemo, useState } from "react";
import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import {
  ClipboardList,
  Hourglass,
  UserCheck,
  Wrench,
  CheckCircle2,
  Users,
  RefreshCw,
  Search,
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

const STATUS_ALIASES: Record<string, string> = {
  pending: "Pending",
  assigned: "Assigned",
  inprogress: "In Progress",
  resolved: "Resolved",
};

const BADGE = "inline-block px-2 py-0.5 rounded border text-xs font-medium";
const GRAY_BADGE = "bg-gray-50 text-gray-700 border-gray-200";

const STATUS_STYLES: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Assigned: "bg-indigo-50 text-indigo-700 border-indigo-200",
  "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
  Resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

// Used only when a complaint has no valid `department` value.
// Where a keyword lists two departments, the first one that exists in DEPARTMENTS is used.
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

const DEPARTMENT_BY_ID = new Map<string, Department>();
DEPARTMENTS.forEach((department) => DEPARTMENT_BY_ID.set(department.id, department));

function toDate(value: any): Date | null {
  if (!value) return null;
  const date = value.toDate ? value.toDate() : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date | null) {
  if (!date) return "-";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

  // Active technicians of this complaint's department, least busy first, then best rated
  const candidates = technicians
    .filter((t) => t.isActive && t.department === complaint.department)
    .sort(
      (a, b) =>
        (workload.get(a.id) || 0) - (workload.get(b.id) || 0) || b.rating - a.rating
    );

  const handleAssign = async () => {
    const technician = candidates.find((t) => t.id === selectedId);
    if (!technician) return;

    try {
      setSubmitting(true);
      setError("");
      await onAssign(complaint, technician);
    } catch (err) {
      console.error("Error assigning technician:", err);
      setError("Failed to assign technician. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={submitting ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Assign Technician</h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-5 text-sm">
          <div className="border border-gray-200 rounded p-3 space-y-2">
            <p className="font-medium text-gray-900">{complaint.title}</p>
            <p className="text-gray-500">{complaint.address || "No address"}</p>
            <p className="text-gray-700">
              {complaint.category} •{" "}
              {department ? `${department.icon} ${department.name}` : "No department"}
            </p>
          </div>

          <div>
            <p className="font-medium text-gray-900 mb-2">Available Technicians</p>

            {candidates.length === 0 ? (
              <p className="border border-gray-200 rounded p-4 text-center text-gray-500">
                {complaint.department
                  ? "No active technicians in this department. Add or activate one on the Technicians page."
                  : "This complaint has no department, so no technicians can be matched."}
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {candidates.map((tech) => (
                  <button
                    type="button"
                    key={tech.id}
                    onClick={() => setSelectedId(tech.id)}
                    className={`w-full text-left border rounded p-3 ${
                      selectedId === tech.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">{tech.name}</span>
                      <span className="text-xs text-gray-500">{tech.area}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {tech.rating ? `${tech.rating.toFixed(1)}/5` : "No rating"} •{" "}
                      {tech.totalResolved} resolved • {workload.get(tech.id) || 0} open
                    </p>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {tech.email} • {tech.phone}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="border border-red-200 bg-red-50 text-red-700 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedId || submitting}
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Assigning..." : "Assign Technician"}
          </button>
        </div>
      </div>
    </div>
  );
}

const selectClass =
  "w-full px-3 py-2 border border-gray-300 rounded bg-white text-sm focus:outline-none focus:border-blue-500";

export default function DepartmentComplaints() {
  const [complaints, setComplaints] = useState<DepartmentComplaint[]>([]);
  const [technicians, setTechnicians] = useState<DepartmentTechnician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDept, setSelectedDept] = useState("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assigningComplaint, setAssigningComplaint] = useState<DepartmentComplaint | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [complaintSnap, technicianSnap] = await Promise.all([
        getDocs(collection(db, "complaints")),
        getDocs(collection(db, "technicians")),
      ]);

      const complaintList: DepartmentComplaint[] = complaintSnap.docs.map((d) => {
        const data = d.data();
        const assignedTo = data.assignedTo || "";

        return {
          id: d.id,
          title: data.title || data.description || "Untitled Complaint",
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

      // Newest first, complaints without a date last
      complaintList.sort(
        (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
      );

      setComplaints(complaintList);
      setTechnicians(
        technicianSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || "Unnamed Technician",
            email: data.email || "",
            phone: data.phone || "",
            department: data.department || "",
            area: data.area || "General",
            rating: data.rating || 0,
            totalResolved: data.totalResolved || 0,
            isActive: !!data.isActive,
          };
        })
      );
    } catch (err) {
      console.error("Error fetching department data:", err);
      setError("Failed to load data. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // One pass over each list. Typing in search or changing filters doesn't recount anything.
  // The key "all" holds the totals across every department.
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

  const searchText = search.trim().toLowerCase();

  const filteredComplaints = complaints.filter((c) => {
    if (selectedDept !== "all" && c.department !== selectedDept) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;

    if (!searchText) return true;
    return [c.title, c.description, c.address, c.category].some((field) =>
      field.toLowerCase().includes(searchText)
    );
  });

  const handleAssign = async (complaint: DepartmentComplaint, technician: DepartmentTechnician) => {
    // Both documents change together or not at all
    const batch = writeBatch(db);
    batch.update(doc(db, "complaints", complaint.id), {
      status: "Assigned",
      assignedTo: technician.id,
      assignedTechName: technician.name,
      assignedTechEmail: technician.email,
      assignedTechPhone: technician.phone,
      assignedTechDept: technician.department,
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, "technicians", technician.id), {
      assignedComplaints: arrayUnion(complaint.id),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

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
  };

  const loadFailed = error !== null && complaints.length === 0;

  const selectedInfo = selectedDept === "all" ? undefined : DEPARTMENT_BY_ID.get(selectedDept);
  const selectedStats = stats.get(selectedDept) || {};
  const selectedTechs = techStats.get(selectedDept) || {};
  const total = selectedStats.total || 0;
  const resolved = selectedStats.Resolved || 0;

  const cards = [
    { title: "Total Complaints", value: total, icon: ClipboardList, note: "" },
    { title: "Pending", value: selectedStats.Pending || 0, icon: Hourglass, note: "" },
    { title: "Assigned", value: selectedStats.Assigned || 0, icon: UserCheck, note: "" },
    { title: "In Progress", value: selectedStats["In Progress"] || 0, icon: Wrench, note: "" },
    {
      title: "Resolved",
      value: resolved,
      icon: CheckCircle2,
      note: total > 0 ? `${Math.round((resolved / total) * 100)}% resolution rate` : "",
    },
    {
      title: "Active Technicians",
      value: selectedTechs.active || 0,
      icon: Users,
      note: `of ${selectedTechs.total || 0} technicians`,
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Complaint Management</h1>
            <p className="text-sm text-gray-600 mt-1">Assign and manage complaints department-wise</p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Department</label>
            <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} className={selectClass}>
              <option value="all">All Departments ({stats.get("all")?.total || 0})</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.icon} {dept.name} ({stats.get(dept.id)?.total || 0})
                </option>
              ))}
            </select>
          </div>

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
              <option value="all">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
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
              {/* Selected department and stats */}
              <div>
                <h2 className="font-semibold text-gray-900">
                  {selectedInfo ? `${selectedInfo.icon} ${selectedInfo.name}` : "All Departments"}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedInfo?.description || "Viewing complaints from all departments"}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {cards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div key={card.title} className="border border-gray-200 rounded p-4">
                      <div className="flex items-start justify-between">
                        <p className="text-sm text-gray-600">{card.title}</p>
                        <Icon className="w-5 h-5 text-gray-400" />
                      </div>
                      <p className="text-3xl font-semibold text-gray-900 mt-1">{card.value}</p>
                      {card.note && <p className="text-xs text-gray-500 mt-2">{card.note}</p>}
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
                        : "Try changing the department, search or status"}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
                        <tr>
                          <th className="px-4 py-3">Complaint</th>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3">Department</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Assigned To</th>
                          <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredComplaints.map((c) => {
                          const department = DEPARTMENT_BY_ID.get(c.department);

                          return (
                            <tr key={c.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <p className="font-medium text-gray-900">{c.title}</p>
                                <p className="text-gray-500 truncate max-w-xs">
                                  {c.address || "No address"}
                                </p>
                              </td>

                              <td className="px-4 py-3 text-gray-700">{c.category}</td>

                              <td className="px-4 py-3 text-gray-700">
                                {department ? `${department.icon} ${department.name}` : "-"}
                              </td>

                              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                                {formatDate(c.createdAt)}
                              </td>

                              <td className="px-4 py-3">
                                <span className={`${BADGE} ${STATUS_STYLES[c.status] || GRAY_BADGE}`}>
                                  {c.status}
                                </span>
                              </td>

                              <td className="px-4 py-3">
                                {c.assignedTechName ? (
                                  <>
                                    <p className="text-gray-900">{c.assignedTechName}</p>
                                    <p className="text-xs text-gray-500">{c.assignedTechEmail}</p>
                                  </>
                                ) : (
                                  <span className="text-gray-500">Not assigned</span>
                                )}
                              </td>

                              <td className="px-4 py-3 text-right">
                                {c.status === "Pending" ? (
                                  <button
                                    onClick={() => setAssigningComplaint(c)}
                                    className="text-blue-600 hover:text-blue-800 font-medium"
                                  >
                                    Assign
                                  </button>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
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

      {assigningComplaint && (
        <AssignModal
          complaint={assigningComplaint}
          technicians={technicians}
          workload={workload}
          onAssign={handleAssign}
          onClose={() => setAssigningComplaint(null)}
        />
      )}
    </div>
  );
}