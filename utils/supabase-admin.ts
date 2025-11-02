// utils/supabase-admin.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Never allow this to be bundled on the client
if (typeof window !== 'undefined') {
  throw new Error('supabaseAdmin must never be imported in the browser');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  throw new Error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_KEY');
}

// Reuse the client across HMR reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var __supabaseAdmin__: SupabaseClient<any, 'public', any> | undefined;
}

export const supabaseAdmin: SupabaseClient =
  global.__supabaseAdmin__ ??
  createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    db: { schema: 'public' },
  });

if (process.env.NODE_ENV !== 'production') {
  global.__supabaseAdmin__ = supabaseAdmin;
}

export default supabaseAdmin;
