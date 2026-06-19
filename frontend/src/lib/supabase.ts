import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasSupabaseConfig) {
  console.warn('Supabase environment variables are not set. Supabase mode is unavailable.');
}

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (null as unknown as ReturnType<typeof createClient>);

// Database types
export interface User {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'SOP_PREPARER' | 'SUPPORT'
  createdAt: string
  updatedAt: string
}

export interface Cohort {
  id: string
  name: string
  description?: string | null
  venue?: string | null
  startDate?: string | null
  endDate?: string | null
  status?: 'ACTIVE' | 'ARCHIVED'
}

export interface Week {
  id: number
  cohortId: string
  weekNumber: number
  title?: string | null
}

export interface Day {
  id: number
  weekId: number
  dayName: string
  week?: Week
}

export interface Activity {
  id: number
  dayId: number
  time: string
  description: string
  period: 'MORNING' | 'AFTERNOON' | 'EVENING'
  orderIndex: number
  day?: Day
}

export interface PendingChange {
  id: string
  weekId: number
  changeType: 'ADD' | 'EDIT' | 'DELETE'
  changeData: any
  userId: string
  createdAt: string
  user?: User
}

export interface RejectedChange {
  id: string
  weekId: number
  changeType: 'ADD' | 'EDIT' | 'DELETE'
  changeData: any
  userId: string
  submittedAt: string
  rejectedBy: string
  rejectedAt: string
  rejectionReason: string
  isRead: boolean
  user?: User
}
