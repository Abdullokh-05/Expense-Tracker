import { createClient } from '@supabase/supabase-js'

// The project's address and publishable key. Both are public by design (every browser that
// opens the app gets them); what keeps data private is row level security in the database
// (supabase/migrations). VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY override them, e.g. for a
// test project. Never put the secret key or the database password here.
const PROJECT_URL = 'https://ikjjcviiqtdjpzjorqug.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_NbUBYpsVqYS916JGGa22Bw_n_6pmBlS'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || PROJECT_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
