import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  RefreshCw,
  Star,
  Users,
  Wrench,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DEPARTMENTS } from "../utils/department";

type ReportComplaint = {
  category?: string;
  department?: string;
  status?: string;
  address?: string;
  assignedTo?: string;
  createdAt: Date | null;
};

type ReportTechnician = {
  id: string;
  name?: string;
  rating?: number;
  isActive?: boolean;
};

type Department = (typeof DEPARTMENTS)[number];
type Counter = Record<string, number>;
type DateRange = { start: string; end: string };

const STATUSES = ["Pending", "Assigned", "In Progress", "Resolved"];

const STATUS_ALIASES: Record<string, string> = {
  pending: "Pending",
  assigned: "Assigned",
  inprogress: "In Progress",
  resolved: "Resolved",
};

const STATUS_COLORS: Record<string, string> = {
  Pending: "#f59e0b",
  Assigned: "#6366f1",
  "In Progress": "#0ea5e9",
  Resolved: "#0f766e",
  Other: "#94a3b8",
};

const CHART_COLORS = ["#0f766e", "#0ea5e9", "#f59e0b", "#6366f1", "#ec4899", "#14b8a6", "#f97316", "#64748b"];

const PRESETS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "3 months" },
  { value: "365", label: "1 year" },
];

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

const DAY_MS = 24 * 60 * 60 * 1000;

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
  fontSize: 13,
};

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100";

const outlineButton =
  "inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-60";

const solidButton =
  "inline-flex items-center gap-2 rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-60";

function toDate(value: any): Date | null {
  if (!value) return null;
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function toInputDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseInputDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getPresetRange(days: number): DateRange {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1));
  return { start: toInputDate(start), end: toInputDate(end) };
}

function normalizeStatus(status?: string) {
  if (!status) return "Pending";
  const key = status.replace(/\s/g, "").toLowerCase();
  return STATUS_ALIASES[key] || "Other";
}

function getDepartment(complaint: ReportComplaint) {
  const direct = complaint.department ? DEPARTMENT_BY_ID.get(complaint.department) : undefined;
  if (direct) return direct;

  const category = (complaint.category || "").toLowerCase();
  for (const [keyword, id] of CATEGORY_KEYWORDS) {
    const department = DEPARTMENT_BY_ID.get(id);
    if (department && category.includes(keyword)) return department;
  }
  return undefined;
}

function count(counter: Counter, key: string) {
  counter[key] = (counter[key] || 0) + 1;
}

function percent(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function shorten(text: string, max = 12) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadFile(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>{children}</div>;
}

function ChartCard({
  title,
  subtitle,
  isEmpty,
  children,
}: {
  title: string;
  subtitle: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <Panel className="p-5">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mb-4 mt-0.5 text-xs text-slate-500">{subtitle}</p>
      {isEmpty ? (
        <p className="flex h-64 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500">
          No data for this period
        </p>
      ) : (
        <div className="h-64">{children}</div>
      )}
    </Panel>
  );
}

function RateBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="w-12 text-slate-700">{value.toFixed(1)}%</span>
    </div>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;
}

function LoadingState() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading report data">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonBlock key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBlock key={i} className="h-80" />
        ))}
      </div>
    </div>
  );
}

export default function Reports() {
  const mounted = useRef(true);
  const [complaints, setComplaints] = useState<ReportComplaint[]>([]);
  const [technicians, setTechnicians] = useState<ReportTechnician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [preset, setPreset] = useState("30");
  const [range, setRange] = useState<DateRange>(() => getPresetRange(30));

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [complaintSnap, technicianSnap] = await Promise.all([
        getDocs(collection(db, "complaints")),
        getDocs(collection(db, "technicians")),
      ]);
      if (!mounted.current) return;

      setComplaints(
        complaintSnap.docs.map((d) => {
          const data = d.data();
          return {
            category: data.category,
            department: data.department,
            status: data.status,
            address: data.address,
            assignedTo: data.assignedTo,
            createdAt: toDate(data.createdAt),
          };
        })
      );
      setTechnicians(technicianSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ReportTechnician[]);
      setUpdatedAt(new Date());
    } catch (err) {
      console.error("Error fetching report data:", err);
      if (!mounted.current) return;
      setError(
        navigator.onLine
          ? "We couldn't load the report data. Try again in a moment."
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
    };
  }, [fetchData]);

  const handlePreset = (value: string) => {
    setPreset(value);
    if (value !== "custom") setRange(getPresetRange(Number(value)));
  };

  const handleDateChange = (field: keyof DateRange, value: string) => {
    setPreset("custom");
    setRange((prev) => {
      const next = { ...prev, [field]: value };
      if (next.start && next.end && next.start > next.end) {
        if (field === "start") next.end = value;
        else next.start = value;
      }
      return next;
    });
  };

  const report = useMemo(() => {
    const rangeStart = range.start ? parseInputDate(range.start) : null;
    const endDay = range.end ? parseInputDate(range.end) : null;
    const rangeEnd = endDay
      ? new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() + 1)
      : null;

    let previousStart: Date | null = null;
    if (rangeStart && rangeEnd) {
      const days = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / DAY_MS);
      previousStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() - days);
    }

    const isInRange = (date: Date | null) => {
      if (!date) return !rangeStart && !rangeEnd;
      if (rangeStart && date < rangeStart) return false;
      if (rangeEnd && date >= rangeEnd) return false;
      return true;
    };

    const now = new Date();
    const currentMonth = now.getFullYear() * 12 + now.getMonth();

    const monthly = Array.from({ length: 6 }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { month: date.toLocaleDateString("en-US", { month: "short" }), total: 0, resolved: 0 };
    });

    const overallStatus: Counter = {};
    const rangeStatus: Counter = {};
    const categoryCounts: Counter = {};
    const hourCounts = new Array<number>(24).fill(0);
    const departmentMap = new Map<string, { department: Department; total: number; resolved: number; pending: number }>();
    const areaMap = new Map<string, { name: string; complaints: number; resolved: number }>();
    const technicianMap = new Map<string, { assigned: number; resolved: number }>();
    let inRange = 0;
    let previousPeriod = 0;

    for (const c of complaints) {
      const status = normalizeStatus(c.status);
      const isResolved = status === "Resolved";

      count(overallStatus, status);

      if (c.createdAt) {
        const monthsAgo = currentMonth - (c.createdAt.getFullYear() * 12 + c.createdAt.getMonth());
        if (monthsAgo >= 0 && monthsAgo < 6) {
          monthly[5 - monthsAgo].total++;
          if (isResolved) monthly[5 - monthsAgo].resolved++;
        }
      }

      if (!isInRange(c.createdAt)) {
        if (previousStart && rangeStart && c.createdAt && c.createdAt >= previousStart && c.createdAt < rangeStart) {
          previousPeriod++;
        }
        continue;
      }

      inRange++;
      count(rangeStatus, status);
      count(categoryCounts, c.category || "Uncategorized");
      if (c.createdAt) hourCounts[c.createdAt.getHours()]++;

      const department = getDepartment(c);
      if (department) {
        const entry = departmentMap.get(department.id) || { department, total: 0, resolved: 0, pending: 0 };
        entry.total++;
        if (isResolved) entry.resolved++;
        if (status === "Pending") entry.pending++;
        departmentMap.set(department.id, entry);
      }

      const areaName = c.address?.split(",")[0].trim() || "Unknown area";
      const area = areaMap.get(areaName) || { name: areaName, complaints: 0, resolved: 0 };
      area.complaints++;
      if (isResolved) area.resolved++;
      areaMap.set(areaName, area);

      if (c.assignedTo) {
        const tech = technicianMap.get(c.assignedTo) || { assigned: 0, resolved: 0 };
        tech.assigned++;
        if (isResolved) tech.resolved++;
        technicianMap.set(c.assignedTo, tech);
      }
    }

    const departments = [...departmentMap.values()]
      .map(({ department, total, resolved, pending }) => ({
        name: department.name,
        icon: department.icon,
        total,
        resolved,
        pending,
        rate: percent(resolved, total),
      }))
      .sort((a, b) => b.total - a.total);

    const highestRate = departments.reduce<(typeof departments)[number] | undefined>(
      (best, d) => (!best || d.rate > best.rate ? d : best),
      undefined
    );

    const categories = Object.entries(categoryCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const areas = [...areaMap.values()].sort((a, b) => b.complaints - a.complaints).slice(0, 8);

    const topTechnicians = technicians
      .flatMap((t) => {
        const stats = technicianMap.get(t.id);
        if (!stats) return [];
        return [
          {
            name: t.name || "Unnamed",
            assigned: stats.assigned,
            resolved: stats.resolved,
            rate: Math.round(percent(stats.resolved, stats.assigned)),
          },
        ];
      })
      .sort((a, b) => b.rate - a.rate || b.assigned - a.assigned)
      .slice(0, 8);

    const rated = technicians.filter((t) => typeof t.rating === "number" && t.rating > 0);
    const knownStatusTotal = STATUSES.reduce((sum, s) => sum + (rangeStatus[s] || 0), 0);
    const statusData = [
      ...STATUSES.map((name) => ({ name, value: rangeStatus[name] || 0 })),
      ...(inRange > knownStatusTotal ? [{ name: "Other", value: inRange - knownStatusTotal }] : []),
    ];

    const change =
      previousStart && previousPeriod > 0 ? Math.round(((inRange - previousPeriod) / previousPeriod) * 100) : null;

    return {
      inRange,
      change,
      undated: complaints.filter((c) => !c.createdAt).length,
      monthly,
      statusData,
      departments,
      highestRate,
      categories,
      areas,
      topTechnicians,
      hours: hourCounts.map((value, hour) => ({ hour: `${hour}:00`, complaints: value })),
      overall: {
        total: complaints.length,
        pending: overallStatus["Pending"] || 0,
        assigned: overallStatus["Assigned"] || 0,
        resolved: overallStatus["Resolved"] || 0,
      },
      activeTechnicians: technicians.filter((t) => t.isActive).length,
      avgRating: rated.length > 0 ? rated.reduce((sum, t) => sum + (t.rating as number), 0) / rated.length : null,
    };
  }, [complaints, technicians, range]);

  const { overall } = report;
  const hasData = complaints.length > 0;
  const loadFailed = error !== null && !hasData;

  const keyMetrics = [
    { title: "Total complaints", value: overall.total, icon: FileText, note: "Everything in the system" },
    {
      title: "Resolved rate",
      value: overall.total > 0 ? `${percent(overall.resolved, overall.total).toFixed(1)}%` : "–",
      icon: CheckCircle2,
      note: `${overall.resolved} resolved`,
    },
    { title: "Pending", value: overall.pending, icon: Clock, note: "Waiting for action" },
    { title: "Assigned", value: overall.assigned, icon: Users, note: "With a technician" },
    { title: "Active technicians", value: report.activeTechnicians, icon: Wrench, note: "Available now" },
    {
      title: "Average rating",
      value: report.avgRating === null ? "–" : `${report.avgRating.toFixed(1)}/5`,
      icon: Star,
      note: "Rated technicians only",
    },
  ];

  const topDepartment = report.departments[0];
  const topArea = report.areas[0];
  const topTechnician = report.topTechnicians[0];

  const highlights = [
    {
      label: "Busiest department",
      value: topDepartment?.name,
      note: topDepartment ? `${topDepartment.total} complaints` : "",
    },
    {
      label: "Best resolution rate",
      value: report.highestRate?.name,
      note: report.highestRate ? `${report.highestRate.rate.toFixed(1)}% resolved` : "",
    },
    {
      label: "Most reports from",
      value: topArea?.name,
      note: topArea ? `${topArea.complaints} complaints` : "",
    },
    {
      label: "Top technician",
      value: topTechnician?.name,
      note: topTechnician ? `${topTechnician.rate}% resolved` : "",
    },
  ];

  const exportReport = () => {
    const rows: (string | number)[][] = [
      ["Civic Bridge report"],
      ["Generated", new Date().toLocaleString()],
      ["Period", `${range.start || "Start"} to ${range.end || "Today"}`],
      [],
      ["Key metrics"],
      ...keyMetrics.map((m) => [m.title, m.value]),
      [],
      ["Department performance"],
      ["Department", "Total", "Resolved", "Pending", "Resolution rate (%)"],
      ...report.departments.map((d) => [d.name, d.total, d.resolved, d.pending, d.rate.toFixed(1)]),
      [],
      ["Complaints by area"],
      ["Area", "Complaints", "Resolved", "Resolution rate (%)"],
      ...report.areas.map((a) => [a.name, a.complaints, a.resolved, percent(a.resolved, a.complaints).toFixed(1)]),
      [],
      ["Monthly trends"],
      ["Month", "Total", "Resolved"],
      ...report.monthly.map((m) => [m.month, m.total, m.resolved]),
    ];

    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    downloadFile(`\uFEFF${csv}`, `civic-bridge-report-${toInputDate(new Date())}.csv`, "text/csv;charset=utf-8");
  };

  const rangeLabel =
    range.start && range.end
      ? "in the selected period"
      : range.start || range.end
        ? "in the chosen date range"
        : "across all time";

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            See how reported issues are handled across departments, areas, and technicians.
          </p>
          {updatedAt && (
            <p className="mt-1 text-xs text-slate-400">
              Updated {updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={exportReport} disabled={loading || !hasData} className={outlineButton}>
            <Download className="h-4 w-4" aria-hidden />
            Export CSV
          </button>
          <button onClick={fetchData} disabled={loading} className={solidButton}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <Panel className="flex flex-wrap items-end gap-x-6 gap-y-4 p-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-600">Period</p>
          <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Period">
            {[...PRESETS, { value: "custom", label: "Custom" }].map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => handlePreset(p.value)}
                aria-pressed={preset === p.value}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                  preset === p.value ? "bg-white text-teal-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div>
            <label htmlFor="range-start" className="mb-1.5 block text-xs font-medium text-slate-600">
              From
            </label>
            <input
              id="range-start"
              type="date"
              value={range.start}
              max={range.end || toInputDate(new Date())}
              onChange={(e) => handleDateChange("start", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="range-end" className="mb-1.5 block text-xs font-medium text-slate-600">
              To
            </label>
            <input
              id="range-end"
              type="date"
              value={range.end}
              min={range.start || undefined}
              max={toInputDate(new Date())}
              onChange={(e) => handleDateChange("end", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </Panel>

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
            className="rounded-md font-semibold text-red-800 underline underline-offset-2 hover:text-red-900 disabled:opacity-60"
          >
            Try again
          </button>
        </div>
      )}

      {loading && !hasData && !loadFailed ? (
        <LoadingState />
      ) : loadFailed ? null : !hasData ? (
        <Panel className="px-6 py-16 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
          <h2 className="mt-3 font-semibold text-slate-900">No complaints yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Reports will appear here once residents start submitting issues through the app.
          </p>
        </Panel>
      ) : (
        <div className="space-y-6" aria-busy={loading}>
          <section aria-labelledby="all-time-heading">
            <h2 id="all-time-heading" className="mb-3 text-sm font-semibold text-slate-900">
              All time
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {keyMetrics.map(({ title, value, icon: Icon, note }) => (
                <Panel key={title} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-slate-600">{title}</p>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
                  <p className="mt-1 text-xs text-slate-500">{note}</p>
                </Panel>
              ))}
            </div>
          </section>

          <section aria-labelledby="period-heading" className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <h2 id="period-heading" className="text-sm font-semibold text-slate-900">
                {report.inRange} of {complaints.length} complaints {rangeLabel}
              </h2>
              {report.change !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {report.change >= 0 ? (
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {Math.abs(report.change)}% vs previous period
                </span>
              )}
              {report.undated > 0 && report.inRange !== complaints.length && (
                <span className="text-xs text-slate-500">
                  {report.undated} without a date {report.undated === 1 ? "is" : "are"} left out
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard
                title="Monthly trends"
                subtitle="Last 6 months, not affected by the selected period"
                isEmpty={report.monthly.every((m) => m.total === 0)}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={report.monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Line type="monotone" dataKey="total" name="Total" stroke="#0ea5e9" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#0f766e" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Status" subtitle="Complaints by current status" isEmpty={report.inRange === 0}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.statusData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="value" name="Complaints" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                      {report.statusData.map((entry) => (
                        <Cell key={entry.name} fill={STATUS_COLORS[entry.name]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Departments" subtitle="Share of complaints by department" isEmpty={report.departments.length === 0}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={report.departments}
                      dataKey="total"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={2}
                      isAnimationActive={false}
                    >
                      {report.departments.map((d, i) => (
                        <Cell key={d.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Top technicians"
                subtitle="Share of assigned complaints resolved"
                isEmpty={report.topTechnicians.length === 0}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.topTechnicians} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} unit="%" tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={90}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: string) => shorten(v)}
                    />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="rate" name="Resolved (%)" fill="#0f766e" radius={[0, 6, 6, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Categories" subtitle="Most common complaint types" isEmpty={report.categories.length === 0}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.categories}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tickFormatter={(v: string) => shorten(v, 10)} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="value" name="Complaints" fill="#0ea5e9" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Peak hours"
                subtitle="When complaints are submitted"
                isEmpty={report.hours.every((h) => h.complaints === 0)}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.hours}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="hour" interval={2} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="complaints" name="Complaints" fill="#f59e0b" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel className="overflow-hidden">
              <h3 className="border-b border-slate-200 px-5 py-4 font-semibold text-slate-900">Department performance</h3>
              {report.departments.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">No data for this period</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Department</th>
                        <th className="px-3 py-3">Total</th>
                        <th className="px-3 py-3">Resolved</th>
                        <th className="px-3 py-3">Pending</th>
                        <th className="px-5 py-3">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.departments.map((dept) => (
                        <tr key={dept.name} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-5 py-3 text-slate-900">
                            {dept.icon} {dept.name}
                          </td>
                          <td className="px-3 py-3 text-slate-700">{dept.total}</td>
                          <td className="px-3 py-3 text-slate-700">{dept.resolved}</td>
                          <td className="px-3 py-3 text-slate-700">{dept.pending}</td>
                          <td className="px-5 py-3">
                            <RateBar value={dept.rate} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel className="overflow-hidden">
              <h3 className="border-b border-slate-200 px-5 py-4 font-semibold text-slate-900">Complaints by area</h3>
              {report.areas.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">No data for this period</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Area</th>
                        <th className="px-3 py-3">Complaints</th>
                        <th className="px-3 py-3">Resolved</th>
                        <th className="px-5 py-3">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.areas.map((area) => (
                        <tr key={area.name} className="hover:bg-slate-50">
                          <td className="max-w-[12rem] truncate px-5 py-3 text-slate-900" title={area.name}>
                            {area.name}
                          </td>
                          <td className="px-3 py-3 text-slate-700">{area.complaints}</td>
                          <td className="px-3 py-3 text-slate-700">{area.resolved}</td>
                          <td className="px-5 py-3">
                            <RateBar value={percent(area.resolved, area.complaints)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <Panel className="p-5">
            <h3 className="mb-4 font-semibold text-slate-900">Highlights</h3>
            <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {highlights.map((item) => (
                <div key={item.label}>
                  <dt className="text-xs text-slate-500">{item.label}</dt>
                  <dd className="mt-1 truncate text-lg font-semibold text-slate-900" title={item.value}>
                    {item.value || "–"}
                  </dd>
                  <dd className="text-xs text-slate-500">{item.note || "Nothing to show yet"}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      )}

      {loadFailed && (
        <Panel className="px-6 py-16 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
          <h2 className="mt-3 font-semibold text-slate-900">Report data isn't available</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500" role="alert">
            {error}
          </p>
          <button onClick={fetchData} disabled={loading} className={`${solidButton} mt-6`}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Try again
          </button>
        </Panel>
      )}
    </div>
  );
}