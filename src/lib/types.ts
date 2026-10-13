export type Status = "planned" | "in-progress" | "completed";

export type CategoryId =
  | "economics"
  | "empirical"
  | "datascience"
  | "specialization"
  | "thesis"
  | "further"
  | "additional";

export interface Category {
  id: CategoryId;
  name: string;
  short: string;
  required: number;
  excludedFromTotal?: boolean;
}

// Field names and shapes are the classic UI's localStorage format and must
// not change: both UIs read and write the same "ects-tracker-state" key.
export interface Course {
  id: string;
  category: CategoryId;
  homeCategory?: CategoryId;
  name: string;
  ects: number;
  semester: string;
  status: Status;
  grade: string;
  professor?: string;
  examType?: string;
  notes?: string;
  language?: string;
  contactHours?: number | null;
  workloadHours?: number | null;
  skills?: string;
  studipLink?: string;
  offeringType?: string | null;
  compulsory?: boolean | null;
  hypothetical?: boolean;
}

export interface TrackerState {
  courses: Course[];
  theme: "light" | "dark";
  graduationDate: string;
  targetGrade: string;
  lastBackupAt: string | null;
  installBannerDismissed: boolean;
  usageCount: number;
}
