import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Hourglass,
  RefreshCw,
  Search,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

type StatusFilter = "all" | "Pending" | "Assigned" | "In Progress" | "Resolved";
type DateFilter = "all" | "today" | "week" | "month";

type Complaint = {
  id: string;
  title: string;
  category: string;
  address: string;
  status: string;
  userName: string;
  userEmail: string;
  createdAt: Date | null;
  updatedAt: Date | null;
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
const PAGE_SIZE = 10;
const CHART_HEIGHT = 96;

const STATUS_ALIASES: Record<string, string> = {
  pending: "Pending",
  assigned: "Assigned",
  inprogress: "In Progress",
  resolved: "Resolved",
};

const STATUS_STYLES: Record<string, string> = {
  Pending: "border-amber-200 bg-amber-50 text-amber-800",
  Assigned: "border-indigo-200 bg-indigo-50 text-indigo-800",
  "In Progress": "border-sky-200 bg-sky-50 text-sky-800",
  Resolved: "border-teal-200 bg-teal-50 text-teal-800",
};

const NEUTRAL_BADGE = "border-slate-200 bg-slate-50 text-slate-700";

const CATEGORY_COLORS: Record<string, string> = {
  road: "bg-red-500",
  water: "bg-sky-500",
  electricity: "bg-yellow-500",
  garbage: "bg-green-500",
  "street light": "bg-purple-500",
  traffic: "bg-orange-500",
  drainage: "bg-cyan-500",
  other: "bg-slate-400",
};

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100";

const outlineButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-50";

const solidButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-60";

function toDate(value: any): Date | null {
  if (!value) return null;
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysAgoStart(days: number) {
  const today = startOfDay(new Date());
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
}

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

function formatDate(date: Date | null) {
  if (!date) return "–";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatAge(days: number) {
  if (days === 0) return "Today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function normalizeStatus(status?: string) {
  if (!status) return "Pending";
  const key = status.replace(/[\s_-]/g, "").toLowerCase();
  return STATUS_ALIASES[key] || status;
}

function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category.toLowerCase()] || CATEGORY_COLORS.other;
}

function getDateCutoff(filter: DateFilter): Date | null {
  if (filter === "today") return daysAgoStart(0);
  if (filter === "week") return daysAgoStart(6);
  if (filter === "month") return daysAgoStart(29);
  return null;
}

function isOverdue(complaint: Complaint, now: Date) {
  if (!complaint.createdAt) return false;
  if (complaint.status !== "Pending" && complaint.status !== "Assigned") return false;
  return daysBetween(complaint.createdAt, now) > OVERDUE_DAYS;
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>{children}</div>;
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;
}

export default function Dashboard() {
  const mounted = useRef(true);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const deferredSearch = useDeferredValue(searchTerm);

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const snap = await getDocs(collection(db, "complaints"));
      if (!mounted.current) return;

      const list: Complaint[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title || data.description || "",
          category: data.category || "Other",
          address: data.address || "",
          status: normalizeStatus(data.status),
          userName: data.userName || "",
          userEmail: data.userEmail || "",
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        };
      });

      list.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));

      setComplaints(list);
      setUpdatedAt(new Date());
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
    fetchComplaints();
    return () => {
      mounted.current = false;
    };
  }, [fetchComplaints]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [deferredSearch, statusFilter, dateFilter, overdueOnly]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);

    const statusCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    let overdue = 0;
    let resolutionDays = 0;
    let resolutionCount = 0;

    const weekly = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - i));
      return { day: date.toLocaleDateString("en-US", { weekday: "short" }), count: 0 };
    });

    for (const c of complaints) {
      statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
      categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;

      if (!c.createdAt) continue;
      if (isOverdue(c, now)) overdue++;

      if (c.status === "Resolved" && c.updatedAt) {
        resolutionDays += daysBetween(c.createdAt, c.updatedAt);
        resolutionCount++;
      }

      const daysAgo = Math.round((today.getTime() - startOfDay(c.createdAt).getTime()) / DAY_MS);
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
      avgResolution: resolutionCount > 0 ? resolutionDays / resolutionCount : null,
      categories,
      weekly,
      weekTotal: weekly.reduce((sum, d) => sum + d.count, 0),
      weeklyMax: Math.max(1, ...weekly.map((d) => d.count)),
    };
  }, [complaints]);

  const filteredComplaints = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    const cutoff = getDateCutoff(dateFilter);
    const now = new Date();

    return complaints.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (overdueOnly && !isOverdue(c, now)) return false;
      if (cutoff && (!c.createdAt || c.createdAt < cutoff)) return false;
      if (!term) return true;
      return [c.title, c.category, c.address, c.userName, c.userEmail].some((field) =>
        field.toLowerCase().includes(term)
      );
    });
  }, [complaints, deferredSearch, statusFilter, dateFilter, overdueOnly]);

  const visibleComplaints = filteredComplaints.slice(0, visibleCount);
  const filtersActive = searchTerm.trim() !== "" || statusFilter !== "all" || dateFilter !== "all" || overdueOnly;

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setDateFilter("all");
    setOverdueOnly(false);
  };

  const hasData = complaints.length > 0;
  const loadFailed = error !== null && !hasData;
  const now = new Date();

  const percentOfTotal = (count: number) => (stats.total > 0 ? Math.round((count / stats.total) * 100) : 0);

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
      tone: "bg-amber-50 text-amber-700",
      note: `${percentOfTotal(stats.pending)}% of total`,
    },
    {
      title: "In progress",
      value: stats.inProgress,
      icon: Wrench,
      tone: "bg-sky-50 text-sky-700",
      note: `${percentOfTotal(stats.inProgress)}% of total`,
    },
    {
      title: "Resolved",
      value: stats.resolved,
      icon: CheckCircle2,
      tone: "bg-teal-50 text-teal-700",
      note: `${percentOfTotal(stats.resolved)}% resolution rate`,
    },
  ];

  const avgResolutionText =
    stats.avgResolution === null
      ? "–"
      : stats.avgResolution < 1
        ? "Under a day"
        : `${stats.avgResolution.toFixed(1)} days`;

  const quickStats = [
    { label: `Overdue (over ${OVERDUE_DAYS} days)`, value: stats.overdue, alert: stats.overdue > 0 },
    { label: "Average resolution time", value: avgResolutionText, alert: false },
    { label: "Assigned", value: stats.assigned, alert: false },
    { label: "New today", value: stats.weekly[6].count, alert: false },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Track issues reported by residents and how quickly they get resolved.
          </p>
          {updatedAt && (
            <p className="mt-1 text-xs text-slate-400">
              Updated {updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
          )}
        </div>

        <button type="button" onClick={fetchComplaints} disabled={loading} className={solidButton}>
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
            type="button"
            onClick={fetchComplaints}
            disabled={loading}
            className="rounded-md font-semibold underline underline-offset-2 hover:text-red-900 disabled:opacity-60"
          >
            Try again
          </button>
        </div>
      )}

      {loading && !hasData ? (
        <div className="space-y-6" role="status" aria-label="Loading dashboard">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonBlock key={i} className="h-32" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <SkeletonBlock key={i} className="h-60" />
            ))}
          </div>
          <SkeletonBlock className="h-96" />
        </div>
      ) : loadFailed ? (
        <Panel className="px-6 py-16 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
          <h2 className="mt-3 font-semibold text-slate-900">Dashboard data isn't available</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500" role="alert">
            {error}
          </p>
          <button type="button" onClick={fetchComplaints} className={`${solidButton} mt-6`}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </button>
        </Panel>
      ) : (
        <div className="space-y-6" aria-busy={loading}>
          <section aria-label="Complaint totals" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map(({ title, value, icon: Icon, tone, note }) => (
              <Panel key={title} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-600">{title}</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
                  </div>
                  <span className={`rounded-lg p-2 ${tone}`}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                </div>
                <p className="mt-3 text-xs text-slate-500">{note}</p>
              </Panel>
            ))}
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel className="p-5">
              <h2 className="mb-2 font-semibold text-slate-900">Quick stats</h2>
              <dl className="divide-y divide-slate-100">
                {quickStats.map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between py-3 text-sm">
                    <dt className="text-slate-600">{stat.label}</dt>
                    <dd
                      className={`flex items-center gap-1.5 font-semibold ${
                        stat.alert ? "text-red-700" : "text-slate-900"
                      }`}
                    >
                      {stat.alert && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>

            <Panel className="p-5">
              <h2 className="mb-4 font-semibold text-slate-900">Top categories</h2>
              {stats.categories.length === 0 ? (
                <p className="flex h-40 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500">
                  No complaints yet
                </p>
              ) : (
                <ul className="space-y-4">
                  {stats.categories.map((cat) => (
                    <li key={cat.name}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-slate-700" title={cat.name}>
                          {cat.name}
                        </span>
                        <span className="shrink-0 font-medium text-slate-900">
                          {cat.count} <span className="font-normal text-slate-400">· {percentOfTotal(cat.count)}%</span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-100">
                        <div
                          className={`h-1.5 rounded-full ${getCategoryColor(cat.name)}`}
                          style={{ width: `${percentOfTotal(cat.count)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel className="p-5">
              <h2 className="mb-4 font-semibold text-slate-900">Last 7 days</h2>
              {stats.weekTotal === 0 ? (
                <p className="flex h-40 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500">
                  No complaints this week
                </p>
              ) : (
                <ul className="flex items-end gap-2">
                  {stats.weekly.map((day, index) => (
                    <li
                      key={`${day.day}-${index}`}
                      aria-label={`${day.day}: ${day.count}`}
                      className="flex flex-1 flex-col items-center justify-end"
                    >
                      <span className="mb-1 text-xs font-medium text-slate-700">{day.count}</span>
                      <div
                        className={`w-full rounded-t ${index === 6 ? "bg-teal-700" : "bg-teal-200"}`}
                        style={{
                          height: `${Math.max(3, Math.round((day.count / stats.weeklyMax) * CHART_HEIGHT))}px`,
                        }}
                      />
                      <span className="mt-2 text-xs text-slate-500">{day.day}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </section>

          <Panel className="overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-slate-200 p-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Recent complaints</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Showing {visibleComplaints.length} of {filteredComplaints.length}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden
                  />
                  <input
                    type="search"
                    aria-label="Search complaints"
                    placeholder="Search complaints"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={`${inputClass} w-full pl-9 pr-9 sm:w-60 [&::-webkit-search-cancel-button]:hidden`}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className={inputClass}
                >
                  <option value="all">All statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Assigned">Assigned</option>
                  <option value="In Progress">In progress</option>
                  <option value="Resolved">Resolved</option>
                </select>

                <select
                  aria-label="Filter by date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                  className={inputClass}
                >
                  <option value="all">All time</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 days</option>
                  <option value="month">Last 30 days</option>
                </select>

                <button
                  type="button"
                  onClick={() => setOverdueOnly((v) => !v)}
                  aria-pressed={overdueOnly}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 ${
                    overdueOnly
                      ? "border-red-300 bg-red-50 text-red-800"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  Overdue only
                </button>
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
                    ? "Try a different search, status, or date range."
                    : "Complaints will show up here as soon as residents report issues in the app."}
                </p>
                {hasData && filtersActive && (
                  <button type="button" onClick={clearFilters} className={`${outlineButton} mt-5`}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                      <tr>
                        <th scope="col" className="px-5 py-3">Complaint</th>
                        <th scope="col" className="px-5 py-3">Reported by</th>
                        <th scope="col" className="px-5 py-3">Category</th>
                        <th scope="col" className="px-5 py-3">Date</th>
                        <th scope="col" className="px-5 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleComplaints.map((c) => (
                        <tr key={c.id} className="transition-colors hover:bg-slate-50">
                          <td className="px-5 py-4">
                            <p className="max-w-xs truncate font-medium text-slate-900" title={c.title}>
                              {c.title || "No title"}
                            </p>
                            <p className="max-w-xs truncate text-slate-500" title={c.address}>
                              {c.address || "No address"}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            <p className="text-slate-900">{c.userName || "Anonymous"}</p>
                            <p className="max-w-[14rem] truncate text-slate-500" title={c.userEmail}>
                              {c.userEmail || "No email"}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            <span className="inline-flex items-center gap-2 text-slate-700">
                              <span className={`h-2 w-2 rounded-full ${getCategoryColor(c.category)}`} aria-hidden />
                              {c.category}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                            <p>{formatDate(c.createdAt)}</p>
                            {c.createdAt && (
                              <p className="text-xs text-slate-500">{formatAge(daysBetween(c.createdAt, now))}</p>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                                  STATUS_STYLES[c.status] || NEUTRAL_BADGE
                                }`}
                              >
                                {c.status}
                              </span>
                              {isOverdue(c, now) && (
                                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
                                  Overdue
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
                  {visibleComplaints.length < filteredComplaints.length ? (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                      className={outlineButton}
                    >
                      Show {Math.min(PAGE_SIZE, filteredComplaints.length - visibleComplaints.length)} more
                    </button>
                  ) : (
                    <span className="text-sm text-slate-500">That's everything.</span>
                  )}
                  <Link
                    to="/admin/complaints"
                    className="rounded text-sm font-medium text-teal-700 hover:text-teal-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                  >
                    Manage and assign complaints
                  </Link>
                </div>
              </>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}