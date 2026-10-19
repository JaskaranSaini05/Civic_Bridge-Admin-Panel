export type ComplaintStatus = "Pending" | "In Progress" | "Resolved" | "Closed";
export type UserRole = "admin" | "technician" | "user";

export interface Complaint {
  id: string;
  title: string;
  description: string;
  category: string;
  department: string;
  status: ComplaintStatus;
  address: string;
  lat?: number;
  lng?: number;
  imageUrl?: string | null;
  createdAt: any; // Firestore Timestamp or Date
  updatedAt: any;
  userId: string;
  userEmail: string;
  userName?: string;
  userPhone?: string;
  assignedTo?: string; // Technician ID
  assignedToName?: string;
  assignedAt?: any;
  assignedBy?: string;
  priority?: "Low" | "Medium" | "High" | "Critical";
  notes?: string[];
  resolution?: string;
  resolvedAt?: any;
}

export interface Technician {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  specialization?: string;
  area: string;
  role: UserRole;
  isActive: boolean;
  assignedComplaints: string[]; // Array of complaint IDs
  createdAt: any;
  rating?: number;
  totalResolved?: number;
}

export interface Department {
  id: string;
  name: string;
  description: string;
  categories: string[];
  icon?: string;
  color?: string;
  headTechnician?: string;
  isActive: boolean;
  createdAt: any;
}