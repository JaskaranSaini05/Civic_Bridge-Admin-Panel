import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { Users, Loader2, UserCheck, UserX } from "lucide-react";
import type { Technician } from "../types";

interface TechnicianSelectProps {
  department: string;
  value: string;
  onChange: (technicianId: string, technicianName: string) => void;
  disabled?: boolean;
  label?: string;
}

export default function TechnicianSelect({
  department,
  value,
  onChange,
  disabled = false,
  label = "Assign to Technician"
}: TechnicianSelectProps) {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!department) {
      setTechnicians([]);
      return;
    }

    const fetchTechnicians = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const techniciansRef = collection(db, "technicians");
        const q = query(
          techniciansRef,
          where("department", "==", department),
          where("isActive", "==", true)
        );
        
        const snapshot = await getDocs(q);
        const techs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Technician));
        
        setTechnicians(techs.sort((a, b) => a.name.localeCompare(b.name)));
        
        if (techs.length === 0) {
          setError(`No active technicians found in ${department} department`);
        }
      } catch (err) {
        console.error("Error fetching technicians:", err);
        setError("Failed to load technicians");
      } finally {
        setLoading(false);
      }
    };

    fetchTechnicians();
  }, [department]);

  const selectedTech = technicians.find(t => t.id === value);

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      
      <div className="relative">
        <select
          value={value}
          onChange={(e) => {
            const techId = e.target.value;
            const tech = technicians.find(t => t.id === techId);
            onChange(techId, tech?.name || "");
          }}
          disabled={disabled || loading || !department || technicians.length === 0}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all disabled:bg-gray-50 disabled:cursor-not-allowed"
        >
          <option value="">
            {!department 
              ? "Select a department first"
              : loading
              ? "Loading technicians..."
              : technicians.length === 0
              ? "No technicians available"
              : "Select a technician..."
            }
          </option>
          {technicians.map(tech => (
            <option key={tech.id} value={tech.id}>
              {tech.name} • {tech.area} • {tech.totalResolved || 0} resolved
            </option>
          ))}
        </select>
        
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          {loading ? (
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          ) : (
            <Users className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-2">
            <UserX className="w-4 h-4 text-amber-600" />
            <p className="text-sm text-amber-800">{error}</p>
          </div>
        </div>
      )}

      {selectedTech && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UserCheck className="w-5 h-5 text-blue-600" />
              <div>
                <p className="font-medium text-blue-900">{selectedTech.name}</p>
                <div className="flex items-center gap-4 text-sm text-blue-700">
                  <span>{selectedTech.email}</span>
                  <span>•</span>
                  <span>{selectedTech.phone}</span>
                  <span>•</span>
                  <span>{selectedTech.area}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-blue-900">
                {selectedTech.totalResolved || 0} resolved
              </div>
              {selectedTech.rating && (
                <div className="text-xs text-blue-700">
                  Rating: {selectedTech.rating.toFixed(1)} ⭐
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}