export const DEPARTMENTS = [
  {
    id: "electricity",
    name: "Electricity Department",
    description: "Handles power supply, wiring, and electrical maintenance issues",
    categories: ["Power Outage", "Street Light", "Electrical Wiring", "Meter Issue", "Transformer"],
    icon: "⚡",
    color: "yellow",
    defaultPriority: "High"
  },
  {
    id: "water",
    name: "Water Works Department",
    description: "Manages water supply, drainage, and sewage systems",
    categories: ["Water Supply", "Pipe Leakage", "Drainage", "Sewage", "Water Quality"],
    icon: "💧",
    color: "blue",
    defaultPriority: "Medium"
  },
  {
    id: "roads",
    name: "Roads & Transport",
    description: "Road maintenance, potholes, traffic signals, and public transport",
    categories: ["Pothole", "Road Damage", "Traffic Signal", "Speed Breaker", "Public Transport"],
    icon: "🛣️",
    color: "gray",
    defaultPriority: "Medium"
  },
  {
    id: "sanitation",
    name: "Sanitation Department",
    description: "Garbage collection, street cleaning, and waste management",
    categories: ["Garbage Collection", "Street Cleaning", "Waste Disposal", "Recycling", "Illegal Dumping"],
    icon: "🚮",
    color: "green",
    defaultPriority: "Low"
  },
  {
    id: "building",
    name: "Building & Construction",
    description: "Building permits, illegal constructions, and structural safety",
    categories: ["Illegal Construction", "Building Safety", "Permit Issue", "Land Dispute", "Demolition"],
    icon: "🏗️",
    color: "orange",
    defaultPriority: "High"
  },
  {
    id: "health",
    name: "Public Health",
    description: "Public health issues, clinics, and sanitation complaints",
    categories: ["Public Clinic", "Disease Control", "Sanitation", "Food Safety", "Vaccination"],
    icon: "🏥",
    color: "red",
    defaultPriority: "Critical"
  },
  {
    id: "parks",
    name: "Parks & Recreation",
    description: "Parks maintenance, playgrounds, and recreational facilities",
    categories: ["Park Maintenance", "Playground", "Sports Facility", "Tree Maintenance", "Public Garden"],
    icon: "🌳",
    color: "emerald",
    defaultPriority: "Low"
  }
];

export const PRIORITIES = [
  { value: "Low", label: "Low", color: "gray", description: "Non-urgent, can wait" },
  { value: "Medium", label: "Medium", color: "blue", description: "Standard priority" },
  { value: "High", label: "High", color: "orange", description: "Urgent attention needed" },
  { value: "Critical", label: "Critical", color: "red", description: "Immediate action required" }
];

export function getDepartmentById(id: string) {
  return DEPARTMENTS.find(dept => dept.id === id);
}

export function getDepartmentByCategory(category: string) {
  return DEPARTMENTS.find(dept => 
    dept.categories.some(cat => 
      cat.toLowerCase() === category.toLowerCase()
    )
  );
}

export function getColorClass(color: string, type: "bg" | "text" | "border" = "bg") {
  const map: Record<string, string> = {
    yellow: `${type}-yellow-500`,
    blue: `${type}-blue-500`,
    gray: `${type}-gray-500`,
    green: `${type}-green-500`,
    orange: `${type}-orange-500`,
    red: `${type}-red-500`,
    emerald: `${type}-emerald-500`,
    purple: `${type}-purple-500`
  };
  return map[color] || `${type}-gray-500`;
}