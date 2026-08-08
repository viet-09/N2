// js/supabase.js
// Supabase client + auth glue.
// Anonymous key is intentionally public — Supabase row-level security
// (see supabase/schema.sql) keeps every per-user table locked to its owner.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.0/+esm';

// Fill these from your Supabase project settings (Project URL + anon public key).
// Both values are safe to ship in the client bundle.
const SUPABASE_URL = window.__SUPABASE_URL__ || '';
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__ || '';

let _client = null;

export function getClient() {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[supabase] URL/anon key not configured — running offline-only.');
    return null;
  }
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: localStorage,
      storageKey: 'n2_sb_session',
      detectSessionInUrl: true,
    },
  });
  return _client;
}

/** True when project credentials are present. */
export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Trigger Google OAuth flow. Resolves to the redirect URL the browser will navigate to. */
export async function signInWithGoogle() {
  const sb = getClient();
  if (!sb) throw new Error('Supabase not configured');
  const redirectTo = `${location.origin}${location.pathname}`;
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw error;
}

export async function signOut() {
  const sb = getClient();
  if (!sb) return;
  await sb.auth.signOut();
}

export async function currentUser() {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

/** Subscribe to auth state changes. Returns the subscription handle. */
export function onAuthChange(handler) {
  const sb = getClient();
  if (!sb) {
    handler(null);
    return { data: { subscription: { unsubscribe: () => {} } } };
  }
  return sb.auth.onAuthStateChange((_event, session) => handler(session?.user ?? null));
}

/** Look up the public leaderboard view. Public read — no JWT required. */
export async function fetchLeaderboard(limit = 50) {
  const sb = getClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('leaderboard')
    .select('rank,user_id,display_name,avatar_type,avatar_data,streak,total_score,ai_level')
    .order('rank', { ascending: true })
    .limit(limit);
  if (error) {
    console.warn('[supabase] leaderboard query failed:', error.message);
    return [];
  }
  return data || [];
}