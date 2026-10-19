import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase";
import {
  FileText,
  CheckCircle2,
  Clock,
  Users,
  Wrench,
  Star,
  Download,
  RefreshCw,
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

const STATUSES = ["Pending", "Assigned", "In Progress", "Resolved"];

const STATUS_ALIASES: Record<string, string> = {
  pending: "Pending",
  assigned: "Assigned",
  inprogress: "In Progress",
  resolved: "Resolved",
};

const STATUS_COLORS: Record<string, string> = {
  Pending: "#F59E0B",
  Assigned: "#6366F1",
  "In Progress": "#3B82F6",
  Resolved: "#10B981",
};

const CHART_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
];

const PRESETS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 3 months" },
  { value: "365", label: "Last year" },
];

// Used only when a complaint has no valid `department` value.
// Where two departments are listed for a keyword, the first one that exists in DEPARTMENTS is used.
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

// "YYYY-MM-DD" in local time, the format date inputs use
function toInputDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseInputDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getPresetRange(days: number) {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1));
  return { start: toInputDate(start), end: toInputDate(end) };
}

function normalizeStatus(status?: string) {
  if (!status) return "Pending";
  const key = status.replace(/\s/g, "").toLowerCase();
  return STATUS_ALIASES[key] || status;
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
    <div className="border border-gray-200 rounded p-4">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="text-xs text-gray-500 mb-4">{subtitle}</p>
      {isEmpty ? (
        <p className="h-64 flex items-center justify-center text-sm text-gray-500">
          No data for this period
        </p>
      ) : (
        <div className="h-64">{children}</div>
      )}
    </div>
  );
}

const inputClass =
  "px-3 py-2 border border-gray-300 rounded bg-white text-sm focus:outline-none focus:border-blue-500";

export default function Reports() {
  const [complaints, setComplaints] = useState<ReportComplaint[]>([]);
  const [technicians, setTechnicians] = useState<ReportTechnician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState("30");
  const [range, setRange] = useState(() => getPresetRange(30));

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [complaintSnap, technicianSnap] = await Promise.all([
        getDocs(collection(db, "complaints")),
        getDocs(collection(db, "technicians")),
      ]);

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
      setTechnicians(
        technicianSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ReportTechnician[]
      );
    } catch (err) {
      console.error("Error fetching report data:", err);
      setError("Failed to load report data. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handlePresetChange = (value: string) => {
    setPreset(value);
    if (value !== "custom") setRange(getPresetRange(Number(value)));
  };

  const handleDateChange = (field: "start" | "end", value: string) => {
    setRange((prev) => ({ ...prev, [field]: value }));
    setPreset("custom");
  };

  // One pass over the complaints builds everything the page shows
  const report = useMemo(() => {
    const rangeStart = range.start ? parseInputDate(range.start) : null;
    const endDay = range.end ? parseInputDate(range.end) : null;
    // The end date is inclusive, so compare against the start of the next day
    const rangeEnd = endDay
      ? new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() + 1)
      : null;

    const isInRange = (date: Date | null) => {
      if (!date) return !rangeStart && !rangeEnd;
      if (rangeStart && date < rangeStart) return false;
      if (rangeEnd && date >= rangeEnd) return false;
      return true;
    };

    const now = new Date();
    const currentMonth = now.getFullYear() * 12 + now.getMonth();

    // Last 6 months, index 5 is the current month
    const monthly = Array.from({ length: 6 }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        month: date.toLocaleDateString("en-US", { month: "short" }),
        total: 0,
        resolved: 0,
      };
    });

    const overallStatus: Counter = {};
    const rangeStatus: Counter = {};
    const categoryCounts: Counter = {};
    const hourCounts: number[] = new Array(24).fill(0);
    const departmentMap = new Map<string, { department: Department; total: number; resolved: number; pending: number }>();
    const areaMap = new Map<string, { name: string; complaints: number; resolved: number }>();
    const technicianMap = new Map<string, { assigned: number; resolved: number }>();
    let inRange = 0;

    for (const c of complaints) {
      const status = normalizeStatus(c.status);
      const isResolved = status === "Resolved";

      count(overallStatus, status);

      if (c.createdAt) {
        const monthsAgo =
          currentMonth - (c.createdAt.getFullYear() * 12 + c.createdAt.getMonth());
        if (monthsAgo >= 0 && monthsAgo < 6) {
          monthly[5 - monthsAgo].total++;
          if (isResolved) monthly[5 - monthsAgo].resolved++;
        }
      }

      if (!isInRange(c.createdAt)) continue;

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

      const areaName = c.address ? c.address.split(",")[0].trim() || "Unknown Area" : "Unknown Area";
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
        rate: (resolved / total) * 100,
      }))
      .sort((a, b) => b.total - a.total);

    let highestRateDepartment = departments[0];
    for (const d of departments) {
      if (d.rate > highestRateDepartment.rate) highestRateDepartment = d;
    }

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
            rate: Math.round((stats.resolved / stats.assigned) * 100),
          },
        ];
      })
      .sort((a, b) => b.rate - a.rate || b.assigned - a.assigned)
      .slice(0, 8);

    let activeTechnicians = 0;
    let ratingTotal = 0;
    let ratedCount = 0;
    for (const t of technicians) {
      if (t.isActive) activeTechnicians++;
      if (t.rating) {
        ratingTotal += t.rating;
        ratedCount++;
      }
    }

    return {
      inRange,
      monthly,
      statusData: STATUSES.map((name) => ({ name, value: rangeStatus[name] || 0 })),
      departments,
      highestRateDepartment: departments.length > 0 ? highestRateDepartment : undefined,
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
      activeTechnicians,
      avgRating: ratedCount > 0 ? ratingTotal / ratedCount : null,
    };
  }, [complaints, technicians, range]);

  const { overall } = report;

  const keyMetrics = [
    { title: "Total Complaints", value: overall.total, icon: FileText, note: "All complaints in system" },
    {
      title: "Resolved Rate",
      value: overall.total > 0 ? `${((overall.resolved / overall.total) * 100).toFixed(1)}%` : "-",
      icon: CheckCircle2,
      note: "Resolved out of all",
    },
    { title: "Pending", value: overall.pending, icon: Clock, note: "Awaiting action" },
    { title: "Assigned", value: overall.assigned, icon: Users, note: "Assigned to technicians" },
    { title: "Active Technicians", value: report.activeTechnicians, icon: Wrench, note: "Currently active" },
    {
      title: "Avg. Rating",
      value: report.avgRating === null ? "-" : `${report.avgRating.toFixed(1)}/5`,
      icon: Star,
      note: "Rated technicians only",
    },
  ];

  const topDepartment = report.departments[0];
  const highestRate = report.highestRateDepartment;
  const topArea = report.areas[0];
  const topTechnician = report.topTechnicians[0];

  const summary = [
    {
      label: "Most Active Department",
      value: topDepartment?.name,
      note: topDepartment ? `${topDepartment.total} complaints` : "",
    },
    {
      label: "Highest Resolution Rate",
      value: highestRate?.name,
      note: highestRate ? `${highestRate.rate.toFixed(1)}%` : "",
    },
    {
      label: "Most Active Area",
      value: topArea?.name,
      note: topArea ? `${topArea.complaints} complaints` : "",
    },
    {
      label: "Top Technician",
      value: topTechnician?.name,
      note: topTechnician ? `${topTechnician.rate}% resolution rate` : "",
    },
  ];

  const loadFailed = error !== null && complaints.length === 0;

  const exportReport = () => {
    const data = {
      generatedAt: new Date().toISOString(),
      dateRange: range,
      keyMetrics: keyMetrics.map(({ title, value }) => ({ title, value })),
      departments: report.departments.map(({ name, total, resolved, pending, rate }) => ({
        name,
        total,
        resolved,
        pending,
        resolutionRate: Number(rate.toFixed(1)),
      })),
      monthlyTrends: report.monthly,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `complaint_report_${toInputDate(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Analytics Dashboard</h1>
            <p className="text-sm text-gray-600 mt-1">Performance insights and metrics overview</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={exportReport}
              disabled={loading || loadFailed}
              className="flex items-center gap-2 px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Date range */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Period</label>
            <select value={preset} onChange={(e) => handlePresetChange(e.target.value)} className={inputClass}>
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom range</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">From</label>
            <input
              type="date"
              value={range.start}
              max={range.end || undefined}
              onChange={(e) => handleDateChange("start", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">To</label>
            <input
              type="date"
              value={range.end}
              min={range.start || undefined}
              onChange={(e) => handleDateChange("end", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {error && (
          <div className="border border-red-200 bg-red-50 text-red-700 text-sm rounded px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <div className="border border-gray-200 rounded p-12 text-center text-gray-600">
            Loading report data...
          </div>
        ) : (
          !loadFailed && (
            <>
              {/* Key metrics */}
              <div>
                <p className="text-xs text-gray-500 mb-2">
                  Key metrics cover all complaints. Everything below covers the selected period.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  {keyMetrics.map((metric) => {
                    const Icon = metric.icon;
                    return (
                      <div key={metric.title} className="border border-gray-200 rounded p-4">
                        <div className="flex items-start justify-between">
                          <p className="text-sm text-gray-600">{metric.title}</p>
                          <Icon className="w-5 h-5 text-gray-400" />
                        </div>
                        <p className="text-2xl font-semibold text-gray-900 mt-1">{metric.value}</p>
                        <p className="text-xs text-gray-500 mt-2">{metric.note}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="text-sm text-gray-600">
                {report.inRange} of {complaints.length} complaints are in the selected period
              </p>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard
                  title="Monthly Trends"
                  subtitle="Last 6 months, not affected by the selected period"
                  isEmpty={report.monthly.every((m) => m.total === 0)}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={report.monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="month" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="total" name="Total" stroke="#3B82F6" strokeWidth={2} isAnimationActive={false} />
                      <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#10B981" strokeWidth={2} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard
                  title="Status Distribution"
                  subtitle="Complaints by current status"
                  isEmpty={report.inRange === 0}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.statusData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" name="Complaints" isAnimationActive={false}>
                        {report.statusData.map((entry) => (
                          <Cell key={entry.name} fill={STATUS_COLORS[entry.name]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard
                  title="Department Distribution"
                  subtitle="Complaints by department"
                  isEmpty={report.departments.length === 0}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={report.departments} dataKey="total" nameKey="name" outerRadius={80} isAnimationActive={false}>
                        {report.departments.map((d, i) => (
                          <Cell key={d.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard
                  title="Top Technicians"
                  subtitle="Resolution rate for assigned complaints"
                  isEmpty={report.topTechnicians.length === 0}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.topTechnicians} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis type="number" domain={[0, 100]} />
                      <YAxis type="category" dataKey="name" width={100} />
                      <Tooltip />
                      <Bar dataKey="rate" name="Resolution rate (%)" fill="#10B981" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard
                  title="Category Breakdown"
                  subtitle="Most common complaint types"
                  isEmpty={report.categories.length === 0}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.categories}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" name="Complaints" fill="#3B82F6" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard
                  title="Peak Hours"
                  subtitle="Complaints submitted by hour of day"
                  isEmpty={report.hours.every((h) => h.complaints === 0)}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.hours}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="hour" interval={2} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="complaints" name="Complaints" fill="#F97316" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-gray-200 rounded overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-900">Department Performance</h3>
                  </div>
                  {report.departments.length === 0 ? (
                    <p className="p-6 text-center text-sm text-gray-500">No data for this period</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
                          <tr>
                            <th className="px-4 py-3">Department</th>
                            <th className="px-4 py-3">Total</th>
                            <th className="px-4 py-3">Resolved</th>
                            <th className="px-4 py-3">Pending</th>
                            <th className="px-4 py-3">Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {report.departments.map((dept) => (
                            <tr key={dept.name} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-gray-900">
                                {dept.icon} {dept.name}
                              </td>
                              <td className="px-4 py-3 text-gray-700">{dept.total}</td>
                              <td className="px-4 py-3 text-gray-700">{dept.resolved}</td>
                              <td className="px-4 py-3 text-gray-700">{dept.pending}</td>
                              <td className="px-4 py-3 text-gray-700">{dept.rate.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="border border-gray-200 rounded overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-900">Complaints by Area</h3>
                  </div>
                  {report.areas.length === 0 ? (
                    <p className="p-6 text-center text-sm text-gray-500">No data for this period</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
                          <tr>
                            <th className="px-4 py-3">Area</th>
                            <th className="px-4 py-3">Complaints</th>
                            <th className="px-4 py-3">Resolved</th>
                            <th className="px-4 py-3">Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {report.areas.map((area) => (
                            <tr key={area.name} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-gray-900">{area.name}</td>
                              <td className="px-4 py-3 text-gray-700">{area.complaints}</td>
                              <td className="px-4 py-3 text-gray-700">{area.resolved}</td>
                              <td className="px-4 py-3 text-gray-700">
                                {((area.resolved / area.complaints) * 100).toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="border border-gray-200 rounded p-4">
                <h3 className="font-semibold text-gray-900 mb-4">Summary</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {summary.map((item) => (
                    <div key={item.label}>
                      <p className="text-xs text-gray-500">{item.label}</p>
                      <p className="text-lg font-semibold text-gray-900 mt-1">{item.value || "-"}</p>
                      <p className="text-xs text-gray-500">{item.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}