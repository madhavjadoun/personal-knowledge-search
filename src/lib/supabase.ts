import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️ Supabase env vars missing. Check .env.local");
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Automatically persist the session in localStorage so getUser()
    // returns the real user after page refreshes and OAuth redirects.
    persistSession: true,
    // Auto-refresh the access token before it expires.
    autoRefreshToken: true,
    // Detect and exchange the OAuth code/hash in the URL automatically.
    // This is what makes the browser pick up the session after Google
    // redirects back — without needing a separate server-side callback.
    detectSessionInUrl: true,
    // Use PKCE flow (the default for browser clients with this key type).
    flowType: "pkce",
  },
});
