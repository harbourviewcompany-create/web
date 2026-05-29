import {createClient} from '@supabase/supabase-js';
export function createSupabaseServerClient(){return createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'http://localhost:54321',process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'local-service-key')}
