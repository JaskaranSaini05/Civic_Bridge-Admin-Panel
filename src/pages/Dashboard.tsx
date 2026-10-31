import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "../firebase/firebase";
import {
  ClipboardList,
  Hourglass,
  Wrench,
  CheckCircle2,
  RefreshCw,
  Search,
  type LucideIcon,
} from "lucide-react";

type DateValue = Timestamp | Date | null | undefined;
type StatusFilter = "all" | "Pending" | "Assigned" | "In Progress" | "Resolved";
type DateFilter = "all" | "today" | "week" | "month";

type Complaint = {
  id: string;
  title?: string;
  category?: string;
  address?: string;
  status?: string;
  userName?: string;
  userEmail?: string;
  createdAt?: DateValue;
  updatedAt?: DateValue;
};

type StatCard = {
  title: string;
  value: number;
  icon: LucideIcon;
  tone: string;
  note: string;
};

const DAY_MS = 1000 * 60 * 60 * 24;
const OVERDUE_DAYS = 3;
const TABLE_LIMIT = 10;
const CHART_HEIGHT = 96;

const PANEL = "rounded-xl border border-slate-200 bg-white shadow-sm";
const CONTROL =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20";

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

function toDate(value: DateValue): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  return typeof value.toDate === "function" ? value.toDate() : null;
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

function formatAge(days: number) {
  if (days === 0) return "Today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function getCategoryColor(category?: string) {
  return CATEGORY_COLORS[category || "Other"] || CATEGORY_COLORS.Other;
}

function getDateCutoff(dateFilter: DateFilter): Date | null {
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const isMounted = useRef(true);

  const fetchComplaints = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const q = query(collection(db, "complaints"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      if (!isMounted.current) return;
      setComplaints(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Complaint, "id">) }))
      );
    } catch (err) {
      console.error("Error fetching complaints:", err);
      if (isMounted.current) {
        setError("Could not load complaints. Please check your connection and try again.");
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetchComplaints();
    return () => {
      isMounted.current = false;
    };
  }, [fetchComplaints]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);

    const statusCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    let overdue = 0;
    let resolutionDaysTotal = 0;
    let resolutionCount = 0;

    // Index 0 is six days ago, index 6 is today
    const weekly = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - i));
      return {
        day: date.toLocaleDateString("en-US", { weekday: "short" }),
        count: 0,
      };
    });

    for (const c of complaints) {
      const status = c.status || "Pending";
      const category = c.category || "Other";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;

      const created = toDate(c.createdAt);
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
      pending: statusCounts["Pending"] || 0,
      assigned: statusCounts["Assigned"] || 0,
      inProgress: statusCounts["In Progress"] || 0,
      resolved: statusCounts["Resolved"] || 0,
      overdue,
      avgResolution: resolutionCount > 0 ? Math.round(resolutionDaysTotal / resolutionCount) : null,
      categories,
      weekly,
      weeklyMax: Math.max(1, ...weekly.map((d) => d.count)),
    };
  }, [complaints]);

  const filteredComplaints = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const cutoff = getDateCutoff(dateFilter);

    return complaints.filter((c) => {
      if (statusFilter !== "all" && (c.status || "Pending") !== statusFilter) return false;

      if (cutoff) {
        const created = toDate(c.createdAt);
        if (!created || created < cutoff) return false;
      }

      if (!term) return true;
      return [c.title, c.category, c.address, c.userName].some((field) =>
        field?.toLowerCase().includes(term)
      );
    });
  }, [complaints, searchTerm, statusFilter, dateFilter]);

  const recentComplaints = filteredComplaints.slice(0, TABLE_LIMIT);
  const now = new Date();
  const showContent = !loading && (complaints.length > 0 || !error);

  const percentOfTotal = (count: number) =>
    stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;

  const cards: StatCard[] = [
    {
      title: "Total complaints",
      value: stats.total,
      icon: ClipboardList,
      tone: "bg-slate-100 text-slate-600",
      note: "All reported issues",
    },
    {
      title: "Pending",
      value: stats.pending,
      icon: Hourglass,
      tone: "bg-amber-50 text-amber-600",
      note: `${percentOfTotal(stats.pending)}% of total`,
    },
    {
      title: "In progress",
      value: stats.inProgress,
      icon: Wrench,
      tone: "bg-blue-50 text-blue-600",
      note: `${percentOfTotal(stats.inProgress)}% of total`,
    },
    {
      title: "Resolved",
      value: stats.resolved,
      icon: CheckCircle2,
      tone: "bg-emerald-50 text-emerald-600",
      note: `${percentOfTotal(stats.resolved)}% resolution rate`,
    },
  ];

  const quickStats = [
    { label: "Overdue (over 3 days)", value: stats.overdue },
    { label: "Avg. resolution time", value: stats.avgResolution === null ? "-" : `${stats.avgResolution} days` },
    { label: "Assigned", value: stats.assigned },
    { label: "New today", value: stats.weekly[6].count },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard overview</h1>
            <p className="mt-1 text-sm text-slate-600">
              Track citizen-reported issues and how quickly they are resolved.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchComplaints}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div role="status" className={`${PANEL} p-12 text-center text-sm text-slate-600`}>
            Loading dashboard data...
          </div>
        )}

        {showContent && (
          <>
            <section aria-label="Complaint totals" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map(({ title, value, icon: Icon, tone, note }) => (
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
                  <p className="mt-3 text-xs text-slate-500">{note}</p>
                </div>
              ))}
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className={`${PANEL} p-5`}>
                <h2 className="mb-3 text-base font-semibold text-slate-900">Quick stats</h2>
                <dl className="divide-y divide-slate-100">
                  {quickStats.map((stat) => (
                    <div key={stat.label} className="flex items-center justify-between py-3 text-sm">
                      <dt className="text-slate-600">{stat.label}</dt>
                      <dd className="font-semibold text-slate-900">{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className={`${PANEL} p-5`}>
                <h2 className="mb-4 text-base font-semibold text-slate-900">Top categories</h2>
                {stats.categories.length === 0 ? (
                  <p className="text-sm text-slate-500">No data yet</p>
                ) : (
                  <ul className="space-y-4">
                    {stats.categories.map((cat) => (
                      <li key={cat.name}>
                        <div className="mb-1.5 flex items-center justify-between text-sm">
                          <span className="text-slate-700">{cat.name}</span>
                          <span className="font-medium text-slate-900">{cat.count}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100">
                          <div
                            className={`h-1.5 rounded-full ${getCategoryColor(cat.name)}`}
                            style={{ width: `${(cat.count / stats.total) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className={`${PANEL} p-5`}>
                <h2 className="mb-4 text-base font-semibold text-slate-900">Last 7 days</h2>
                <div className="flex items-end gap-2">
                  {stats.weekly.map((day, index) => (
                    <div key={day.day} className="flex flex-1 flex-col items-center justify-end">
                      <span className="mb-1 text-xs font-medium text-slate-700">{day.count}</span>
                      <div
                        className={`w-full rounded-t ${index === 6 ? "bg-blue-700" : "bg-blue-200"}`}
                        style={{
                          height: `${Math.max(3, Math.round((day.count / stats.weeklyMax) * CHART_HEIGHT))}px`,
                        }}
                      />
                      <span className="mt-2 text-xs text-slate-500">{day.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className={`${PANEL} overflow-hidden`}>
              <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Recent complaints</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Showing {recentComplaints.length} of {filteredComplaints.length}
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      aria-label="Search complaints"
                      placeholder="Search complaints..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={`${CONTROL} w-full pl-9 sm:w-64`}
                    />
                  </div>

                  <select
                    aria-label="Filter by status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className={CONTROL}
                  >
                    <option value="all">All status</option>
                    <option value="Pending">Pending</option>
                    <option value="Assigned">Assigned</option>
                    <option value="In Progress">In progress</option>
                    <option value="Resolved">Resolved</option>
                  </select>

                  <select
                    aria-label="Filter by date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                    className={CONTROL}
                  >
                    <option value="all">All time</option>
                    <option value="today">Today</option>
                    <option value="week">Last 7 days</option>
                    <option value="month">Last 30 days</option>
                  </select>
                </div>
              </div>

              {filteredComplaints.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="font-medium text-slate-800">No complaints found</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {complaints.length === 0
                      ? "Complaints will appear here once submitted"
                      : "Try changing the search or filters"}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-medium text-slate-600">
                      <tr>
                        <th scope="col" className="px-5 py-3">Complaint</th>
                        <th scope="col" className="px-5 py-3">User</th>
                        <th scope="col" className="px-5 py-3">Category</th>
                        <th scope="col" className="px-5 py-3">Date</th>
                        <th scope="col" className="px-5 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recentComplaints.map((c) => {
                        const createdDate = toDate(c.createdAt);
                        const status = c.status || "Pending";

                        return (
                          <tr key={c.id} className="transition-colors hover:bg-slate-50">
                            <td className="px-5 py-4">
                              <p className="font-medium text-slate-900">{c.title || "No title"}</p>
                              <p className="max-w-xs truncate text-slate-500">{c.address || "No address"}</p>
                            </td>

                            <td className="px-5 py-4">
                              <p className="text-slate-900">{c.userName || "Anonymous"}</p>
                              <p className="max-w-xs truncate text-slate-500">{c.userEmail || "No email"}</p>
                            </td>

                            <td className="px-5 py-4">
                              <span className="inline-flex items-center gap-2 text-slate-700">
                                <span className={`h-2 w-2 rounded-full ${getCategoryColor(c.category)}`} />
                                {c.category || "Other"}
                              </span>
                            </td>

                            <td className="px-5 py-4 text-slate-700">
                              <p>{formatDate(createdDate)}</p>
                              {createdDate && (
                                <p className="text-xs text-slate-500">{formatAge(daysBetween(createdDate, now))}</p>
                              )}
                            </td>

                            <td className="px-5 py-4">
                              <span
                                className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${
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
            </section>
          </>
        )}
      </div>
    </div>
  );
}