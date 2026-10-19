import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  Mail, 
  Phone,
  AlertCircle,
  CheckCircle,
  Wrench,
  MessageSquare,
  Paperclip,
  Send,
  Loader2
} from "lucide-react";
import TechnicianSelect from "./TechnicianSelect";
import { DEPARTMENTS, PRIORITIES, getDepartmentById } from "../utils/department";
import type { Complaint } from "../types";

export default function ComplaintDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [note, setNote] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchComplaint = async () => {
      try {
        setLoading(true);
        const docRef = doc(db, "complaints", id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setComplaint({ id: docSnap.id, ...docSnap.data() } as Complaint);
        } else {
          navigate("/admin/complaints");
        }
      } catch (error) {
        console.error("Error fetching complaint:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchComplaint();
  }, [id, navigate]);

  const handleStatusChange = async (newStatus: Complaint["status"]) => {
    if (!complaint || updating) return;

    try {
      setUpdating(true);
      const updateData: any = {
        status: newStatus,
        updatedAt: Timestamp.now()
      };

      if (newStatus === "Resolved" || newStatus === "Closed") {
        updateData.resolvedAt = Timestamp.now();
      }

      await updateDoc(doc(db, "complaints", complaint.id), updateData);
      setComplaint(prev => prev ? { ...prev, ...updateData } : null);
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const handleAssignTechnician = async (technicianId: string, technicianName: string) => {
    if (!complaint || updating) return;

    try {
      setUpdating(true);
      const updateData = {
        assignedTo: technicianId,
        assignedToName: technicianName,
        assignedAt: Timestamp.now(),
        status: "In Progress" as const,
        updatedAt: Timestamp.now()
      };

      await updateDoc(doc(db, "complaints", complaint.id), updateData);
      setComplaint(prev => prev ? { ...prev, ...updateData } : null);
    } catch (error) {
      console.error("Error assigning technician:", error);
      alert("Failed to assign technician");
    } finally {
      setUpdating(false);
    }
  };

  const handlePriorityChange = async (priority: Complaint["priority"]) => {
    if (!complaint || updating) return;

    try {
      setUpdating(true);
      await updateDoc(doc(db, "complaints", complaint.id), {
        priority,
        updatedAt: Timestamp.now()
      });
      setComplaint(prev => prev ? { ...prev, priority } : null);
    } catch (error) {
      console.error("Error updating priority:", error);
      alert("Failed to update priority");
    } finally {
      setUpdating(false);
    }
  };

  const handleAddNote = async () => {
    if (!complaint || !note.trim() || updating) return;

    try {
      setUpdating(true);
      const newNote = `[${new Date().toLocaleString()}] ${note}`;
      const updatedNotes = [...(complaint.notes || []), newNote];
      
      await updateDoc(doc(db, "complaints", complaint.id), {
        notes: updatedNotes,
        updatedAt: Timestamp.now()
      });
      
      setComplaint(prev => prev ? { ...prev, notes: updatedNotes } : null);
      setNote("");
    } catch (error) {
      console.error("Error adding note:", error);
      alert("Failed to add note");
    } finally {
      setUpdating(false);
    }
  };

  const department = getDepartmentById(complaint?.department || "");

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">Loading complaint details...</p>
        </div>
      </div>
    );
  }

  if (!complaint) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">Complaint Not Found</h3>
          <button
            onClick={() => navigate("/admin/complaints")}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Complaints
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate("/admin/complaints")}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Complaints
          </button>
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{complaint.title}</h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-medium">
                  {department?.icon || "📋"} {complaint.category}
                </span>
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
                  complaint.status === "Resolved" ? "bg-emerald-100 text-emerald-800" :
                  complaint.status === "In Progress" ? "bg-blue-100 text-blue-800" :
                  complaint.status === "Pending" ? "bg-amber-100 text-amber-800" :
                  "bg-gray-100 text-gray-800"
                }`}>
                  {complaint.status === "Resolved" && <CheckCircle className="w-4 h-4" />}
                  {complaint.status === "In Progress" && <Wrench className="w-4 h-4" />}
                  {complaint.status === "Pending" && <Clock className="w-4 h-4" />}
                  {complaint.status}
                </span>
              </div>
            </div>
            
            <div className="text-sm text-gray-600">
              ID: <span className="font-mono text-gray-800">{complaint.id}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Complaint Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description Card */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Description</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{complaint.description}</p>
              
              {complaint.imageUrl && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Attached Image</h3>
                  <img
                    src={complaint.imageUrl}
                    alt="Complaint"
                    className="rounded-lg max-w-md border border-gray-200"
                  />
                </div>
              )}
            </div>

            {/* Location & Contact Card */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Location & Contact</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Location
                  </h3>
                  <p className="text-gray-900">{complaint.address}</p>
                  {complaint.lat && complaint.lng && (
                    <p className="text-sm text-gray-600 mt-1">
                      Coordinates: {complaint.lat.toFixed(6)}, {complaint.lng.toFixed(6)}
                    </p>
                  )}
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Submitted By
                  </h3>
                  <div className="space-y-1">
                    <p className="text-gray-900">{complaint.userName || "Unknown"}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="w-4 h-4" />
                      {complaint.userEmail}
                    </div>
                    {complaint.userPhone && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Phone className="w-4 h-4" />
                        {complaint.userPhone}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Notes Section */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Notes & Updates</h2>
                <button
                  onClick={() => setShowNotes(!showNotes)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  {showNotes ? "Hide" : "Show"} Notes
                </button>
              </div>
              
              {showNotes && (
                <>
                  <div className="space-y-3 mb-6 max-h-60 overflow-y-auto">
                    {(complaint.notes || []).length > 0 ? (
                      complaint.notes!.map((note, index) => (
                        <div key={index} className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-gray-700 text-sm">{note}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-sm">No notes added yet</p>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Add a note..."
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none"
                      onKeyPress={(e) => e.key === 'Enter' && handleAddNote()}
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={!note.trim() || updating}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {updating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Add
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Column - Actions & Info */}
          <div className="space-y-6">
            {/* Status Control Card */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Status Control</h2>
              
              <div className="space-y-3">
                {(["Pending", "In Progress", "Resolved", "Closed"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    disabled={updating || complaint.status === status}
                    className={`w-full px-4 py-3 rounded-lg border text-left transition-all ${
                      complaint.status === status
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                    } ${updating ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{status}</span>
                      {complaint.status === status && (
                        <CheckCircle className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Department & Assignment */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Department & Assignment</h2>
              
              {department && (
                <div className="mb-6 p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{department.icon}</span>
                    <div>
                      <p className="font-medium text-blue-900">{department.name}</p>
                      <p className="text-sm text-blue-700">{department.description}</p>
                    </div>
                  </div>
                </div>
              )}

              <TechnicianSelect
                department={complaint.department}
                value={complaint.assignedTo || ""}
                onChange={handleAssignTechnician}
                disabled={updating}
                label="Assign Technician"
              />

              {complaint.assignedTo && complaint.assignedAt && (
                <div className="mt-4 p-3 rounded-lg bg-green-50 border border-green-200">
                  <p className="text-sm text-green-800">
                    Assigned to <span className="font-semibold">{complaint.assignedToName}</span> on{" "}
                    {complaint.assignedAt?.toDate
                      ? complaint.assignedAt.toDate().toLocaleString()
                      : new Date(complaint.assignedAt).toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            {/* Priority & Timestamps */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Priority & Timestamps</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Priority Level
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PRIORITIES.map((priority) => (
                      <button
                        key={priority.value}
                        onClick={() => handlePriorityChange(priority.value as any)}
                        disabled={updating}
                        className={`px-3 py-2 rounded-lg border transition-all ${
                          complaint.priority === priority.value
                            ? `border-${priority.color}-500 bg-${priority.color}-50 text-${priority.color}-700`
                            : `border-gray-200 hover:border-${priority.color}-300 text-gray-700`
                        }`}
                      >
                        {priority.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Created
                    </span>
                    <span className="text-gray-900">
                      {complaint.createdAt?.toDate
                        ? complaint.createdAt.toDate().toLocaleString()
                        : new Date(complaint.createdAt).toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Last Updated
                    </span>
                    <span className="text-gray-900">
                      {complaint.updatedAt?.toDate
                        ? complaint.updatedAt.toDate().toLocaleString()
                        : new Date(complaint.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  
                  {complaint.resolvedAt && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Resolved At</span>
                      <span className="text-gray-900">
                        {complaint.resolvedAt?.toDate
                          ? complaint.resolvedAt.toDate().toLocaleString()
                          : new Date(complaint.resolvedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}