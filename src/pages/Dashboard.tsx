import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "../firebase/firebase";
import {
  ClipboardList,
  Hourglass,
  Wrench,
  CheckCircle2,
  RefreshCw,
  Search,
} from "lucide-react";

type Complaint = {
  id: string;
  title?: string;
  category?: string;
  address?: string;
  status?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
  assignedTo?: string;
  assignedTechName?: string;
};

const DAY_MS = 1000 * 60 * 60 * 24;
const OVERDUE_DAYS = 3;
const TABLE_LIMIT = 10;

const STATUS_STYLES: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Assigned: "bg-indigo-50 text-indigo-700 border-indigo-200",
  "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
  Resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const CATEGORY_COLORS: Record<string, string> = {
  Road: "bg-red-500",
  Water: "bg-blue-500",
  Electricity: "bg-yellow-500",
  Garbage: "bg-green-500",
  "Street Light": "bg-purple-500",
  Traffic: "bg-orange-500",
  Drainage: "bg-cyan-500",
  Other: "bg-gray-500",
};

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value?.toDate) return value.toDate();
  return null;
}

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date: Date | null) {
  if (!date) return "-";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getCategoryColor(category?: string) {
  return CATEGORY_COLORS[category || "Other"] || CATEGORY_COLORS.Other;
}

// Returns the earliest allowed creation date for a date filter, or null for "all"
function getDateCutoff(dateFilter: string): Date | null {
  const now = new Date();
  if (dateFilter === "today") return startOfDay(now);
  if (dateFilter === "week") return new Date(now.getTime() - 7 * DAY_MS);
  if (dateFilter === "month") return new Date(now.getTime() - 30 * DAY_MS);
  return null;
}

export default function Dashboard() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  const fetchComplaints = async () => {
    try {
      setLoading(true);
      setError(null);
      const q = query(collection(db, "complaints"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setComplaints(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    } catch (err) {
      console.error("Error fetching complaints:", err);
      setError("Could not load complaints. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, []);

  // Statistics only depend on the full list, so they are not recalculated while typing in search
  const stats = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);

    let pending = 0;
    let assigned = 0;
    let inProgress = 0;
    let resolved = 0;
    let overdue = 0;
    let resolutionDaysTotal = 0;
    let resolutionCount = 0;
    const categoryCounts: Record<string, number> = {};

    // Index 0 is six days ago, index 6 is today
    const weekly = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - i));
      return {
        day: date.toLocaleDateString("en-US", { weekday: "short" }),
        date: date.getDate(),
        count: 0,
      };
    });

    for (const c of complaints) {
      const status = c.status || "Pending";
      const created = toDate(c.createdAt);

      if (status === "Pending") pending++;
      else if (status === "Assigned") assigned++;
      else if (status === "In Progress") inProgress++;
      else if (status === "Resolved") resolved++;

      const category = c.category || "Other";
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;

      if (!created) continue;

      if (status !== "Resolved" && status !== "In Progress" && daysBetween(created, now) > OVERDUE_DAYS) {
        overdue++;
      }

      if (status === "Resolved") {
        const updated = toDate(c.updatedAt);
        if (updated) {
          resolutionDaysTotal += daysBetween(created, updated);
          resolutionCount++;
        }
      }

      const daysAgo = Math.round((today.getTime() - startOfDay(created).getTime()) / DAY_MS);
      if (daysAgo >= 0 && daysAgo < 7) weekly[6 - daysAgo].count++;
    }

    const categories = Object.entries(categoryCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total: complaints.length,
      pending,
      assigned,
      inProgress,
      resolved,
      overdue,
      avgResolution: resolutionCount > 0 ? Math.round(resolutionDaysTotal / resolutionCount) : null,
      categories,
      weekly,
      weeklyMax: Math.max(1, ...weekly.map((d) => d.count)),
    };
  }, [complaints]);

  const search = searchTerm.trim().toLowerCase();
  const cutoff = getDateCutoff(dateFilter);

  const filteredComplaints = complaints.filter((c) => {
    if (statusFilter !== "all" && (c.status || "Pending") !== statusFilter) return false;

    if (cutoff) {
      const created = toDate(c.createdAt);
      if (!created || created < cutoff) return false;
    }

    if (!search) return true;
    return [c.title, c.category, c.address, c.userName].some((field) =>
      field?.toLowerCase().includes(search)
    );
  });

  const recentComplaints = filteredComplaints.slice(0, TABLE_LIMIT);
  const now = new Date();

  const percentOfTotal = (count: number) =>
    stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;

  const cards = [
    { title: "Total Complaints", value: stats.total, icon: ClipboardList, note: "" },
    { title: "Pending", value: stats.pending, icon: Hourglass, note: `${percentOfTotal(stats.pending)}% of total` },
    { title: "In Progress", value: stats.inProgress, icon: Wrench, note: `${percentOfTotal(stats.inProgress)}% of total` },
    { title: "Resolved", value: stats.resolved, icon: CheckCircle2, note: `${percentOfTotal(stats.resolved)}% resolution rate` },
  ];

  const quickStats = [
    { label: "Overdue (over 3 days)", value: stats.overdue },
    { label: "Avg. Resolution Time", value: stats.avgResolution === null ? "-" : `${stats.avgResolution} days` },
    { label: "Assigned", value: stats.assigned },
    { label: "New Today", value: stats.weekly[6].count },
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard Overview</h1>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search complaints..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2 border border-gray-300 rounded text-sm w-64 focus:outline-none focus:border-blue-500"
              />
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
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Assigned">Assigned</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
          </select>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
          </select>
        </div>

        {error && (
          <div className="border border-red-200 bg-red-50 text-red-700 text-sm rounded px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <div className="border border-gray-200 rounded p-12 text-center text-gray-600">
            Loading dashboard data...
          </div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                    {card.note && <p className="text-xs text-gray-500 mt-3">{card.note}</p>}
                  </div>
                );
              })}
            </div>

            {/* Quick stats, categories, weekly activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="border border-gray-200 rounded p-4">
                <h3 className="font-semibold text-gray-900 mb-4">Quick Stats</h3>
                <div className="divide-y divide-gray-100">
                  {quickStats.map((stat) => (
                    <div key={stat.label} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-gray-600">{stat.label}</span>
                      <span className="font-semibold text-gray-900">{stat.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-gray-200 rounded p-4">
                <h3 className="font-semibold text-gray-900 mb-4">Top Categories</h3>
                {stats.categories.length === 0 ? (
                  <p className="text-sm text-gray-500">No data yet</p>
                ) : (
                  <div className="space-y-3">
                    {stats.categories.map((cat) => (
                      <div key={cat.name}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-700">{cat.name}</span>
                          <span className="font-medium text-gray-900">{cat.count}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`${getCategoryColor(cat.name)} h-1.5 rounded-full`}
                            style={{ width: `${(cat.count / stats.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-gray-200 rounded p-4">
                <h3 className="font-semibold text-gray-900 mb-4">Last 7 Days</h3>
                <div className="flex items-end gap-2">
                  {stats.weekly.map((day) => (
                    <div key={day.day + day.date} className="flex-1 flex flex-col items-center justify-end">
                      <span className="text-xs text-gray-700 mb-1">{day.count}</span>
                      <div
                        className="w-full bg-blue-500 rounded-sm"
                        style={{ height: `${Math.max(2, Math.round((day.count / stats.weeklyMax) * 80))}px` }}
                      />
                      <span className="text-xs text-gray-500 mt-2">{day.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent complaints */}
            <div className="border border-gray-200 rounded overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Recent Complaints</h2>
                <span className="text-sm text-gray-500">
                  Showing {recentComplaints.length} of {filteredComplaints.length}
                </span>
              </div>

              {filteredComplaints.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-gray-700 font-medium">No complaints found</p>
                  <p className="text-gray-500 text-sm mt-1">
                    {complaints.length === 0
                      ? "Complaints will appear here once submitted"
                      : "Try changing the search or filters"}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
                      <tr>
                        <th className="px-4 py-3">Complaint</th>
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {recentComplaints.map((c) => {
                        const createdDate = toDate(c.createdAt);
                        const status = c.status || "Pending";

                        return (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">{c.title || "No Title"}</p>
                              <p className="text-gray-500 truncate max-w-xs">{c.address || "No address"}</p>
                            </td>

                            <td className="px-4 py-3">
                              <p className="text-gray-900">{c.userName || "Anonymous"}</p>
                              <p className="text-gray-500 truncate max-w-xs">{c.userEmail || "No email"}</p>
                            </td>

                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-2 text-gray-700">
                                <span className={`w-2 h-2 rounded-full ${getCategoryColor(c.category)}`} />
                                {c.category || "Other"}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-gray-700">
                              <p>{formatDate(createdDate)}</p>
                              {createdDate && (
                                <p className="text-xs text-gray-500">
                                  {daysBetween(createdDate, now)} days ago
                                </p>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${
                                  STATUS_STYLES[status] || STATUS_STYLES.Pending
                                }`}
                              >
                                {status}
                              </span>
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
        )}
      </div>
    </div>
  );
}