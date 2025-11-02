import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Debug logging (only in browser)
if (typeof window !== 'undefined') {
  console.log('Supabase Client Config:', {
    url: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'MISSING',
    key: supabaseKey ? 'Present' : 'MISSING',
    environment: process.env.NODE_ENV
  });
}

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

// Keep your existing configuration exactly as is
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    storageKey: 'topdecile-auth',  // Important: Keep this!
    detectSessionInUrl: true,
    flowType: 'pkce',
    autoRefreshToken: true,
  },
  // Add debug fetch wrapper
  global: {
    fetch: (url, options = {}) => {
      if (typeof window !== 'undefined') {
        console.log('Supabase fetch:', url);
      }
      return fetch(url, { ...options });
    },
  },
});

// Single signInWithEmail function
export async function signInWithEmail(email, password) {
  try {
    console.log('Attempting sign in...');
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('Sign in error:', error);
      
      // Mobile-specific error messages
      if (error.message.includes('Failed to fetch')) {
        throw new Error('Network error. Please check your connection and try again.');
      }
      return { data: null, error };
    }

    console.log('Sign in successful');
    return { data, error: null };
  } catch (err) {
    console.error('Unexpected sign in error:', err);
    return {
      data: null,
      error: {
        message: err.message || 'An unexpected error occurred',
        status: err.status || 500,
      },
    };
  }
}