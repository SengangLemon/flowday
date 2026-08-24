import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

let mobileClient: SupabaseClient | null = null;

export function createClient() {
  if (!mobileClient) {
    mobileClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: {
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: 'flowday-native-auth-v1',
        },
      },
    );
  }
  return mobileClient;
}
