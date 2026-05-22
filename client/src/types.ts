export type DriverStatus = 'new' | 'contacted' | 'interview' | 'documents' | 'training' | 'active' | 'inactive' | 'rejected';

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'recruiter';
  phone?: string;
  avatar_color: string;
}

export interface Driver {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  status: DriverStatus;
  recruiter_id: number;
  recruiter_name?: string;
  recruiter_email?: string;
  recruiter_phone?: string;
  recruiter_color?: string;
  start_date?: string;
  truck_type?: string;
  license_class?: string;
  experience_years?: number;
  source?: string;
  endorsements?: string;
  salary_expectation?: string;
  bio?: string;
  lead_id?: number;
  created_at: string;
  updated_at: string;
}

export interface StatusHistory {
  id: number;
  driver_id: number;
  old_status?: string;
  new_status: string;
  changed_by: number;
  changed_by_name: string;
  notes?: string;
  created_at: string;
}

export interface Note {
  id: number;
  driver_id: number;
  recruiter_id: number;
  recruiter_name: string;
  avatar_color: string;
  text: string;
  created_at: string;
}

export interface Email {
  id: number;
  driver_id: number;
  driver_name?: string;
  driver_email?: string;
  recruiter_id: number;
  recruiter_name?: string;
  subject: string;
  body: string;
  template_used?: string;
  status: string;
  sent_at: string;
}

export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
  category: string;
}

export interface Activity {
  id: number;
  recruiter_id: number;
  recruiter_name?: string;
  driver_id?: number;
  driver_name?: string;
  action: string;
  details?: string;
  created_at: string;
}

export interface DashboardStats {
  totals: {
    total: number;
    active: number;
    new_leads: number;
    interviews: number;
    in_training: number;
    documents: number;
    rejected: number;
    contacted: number;
  };
  pipeline: { status: string; count: number }[];
  recentActivity: Activity[];
  startingSoon: Driver[];
  emailsThisMonth: { count: number };
  monthlyData: { month: string; count: number }[];
}
