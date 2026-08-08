// supabase/functions/evaluate-ai/index.ts
// Edge Function (Supabase Deno) — AI level evaluation.
// POST /functions/v1/evaluate-ai
// Body: { metrics: { totalCorrect: number, totalAttempted: number,
//                     byCategory: Record<string, { correct: number, attempted: number }>,
//                     recentLessonIds: string[] } }
// Response: { level: "N5"|"N4"|"N3"|"N2"|"N1", reasoning: string }
// Persists ai_level + ai_level_updated_at on user_profiles.
//
// Auth: Supabase verifies the Authorization JWT automatically. Anonymous → 401.
// Secrets (set via `supabase secrets set`):
//   GEMINI_API_KEY       — Google AI Studio key
//   SUPABASE_URL         — auto-injected
//   SUPABASE_ANON_KEY    — auto-injected (used only to forward the user's JWT)
//
// Deploy:
//   supabase functions deploy evaluate-ai --project-ref <ref>
//   supabase secrets set GEMINI_API_KEY=... --project-ref <ref>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

const ALLOWED_LEVELS = new Set(['N5', 'N4', 'N3', 'N2', 'N1']);

const SYSTEM = [
  'Bạn là chuyên gia đánh giá trình độ JLPT.',
  'Dựa trên accuracy + số câu đã làm + độ phủ category, hãy chọn level N5|N4|N3|N2|N1 phù hợp nhất.',
  'Trả về JSON thuần: {"level":"N5|N4|N3|N2|N1","reasoning":"<giải thích ≤120 ký tự>"}',
  'Không kèm markdown, không giải thích ngoài JSON.',
].join(' ');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeParseLevel(text: string): { level: string; reasoning: string } {
  const fallback = { level: 'N3', reasoning: 'Fallback do AI response invalid' };
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const level = typeof parsed.level === 'string' && ALLOWED_LEVELS.has(parsed.level)
      ? parsed.level
      : 'N3';
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 200) : '';
    return { level, reasoning };
  } catch {
    return fallback;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return jsonResponse({ error: 'Server misconfigured: missing secrets' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing bearer token' }, 401);
  }

  // Forward user's JWT to a scoped client so RLS kicks in.
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userErr } = await sb.auth.getUser();
  if (userErr || !user) return jsonResponse({ error: 'Invalid session' }, 401);

  let metrics: {
    totalCorrect?: number;
    totalAttempted?: number;
    byCategory?: Record<string, { correct?: number; attempted?: number }>;
    recentLessonIds?: string[];
  } = {};
  try {
    metrics = await req.json();
  } catch {
    return jsonResponse({ error: 'Body must be JSON' }, 400);
  }

  const totalCorrect = Number(metrics.totalCorrect) || 0;
  const totalAttempted = Number(metrics.totalAttempted) || 0;
  const byCategory = metrics.byCategory ?? {};
  const recent = Array.isArray(metrics.recentLessonIds) ? metrics.recentLessonIds.slice(0, 20) : [];
  const accuracy = totalAttempted > 0 ? totalCorrect / totalAttempted : 0;

  const prompt = [
    SYSTEM,
    '',
    `Accuracy: ${(accuracy * 100).toFixed(1)}%`,
    `Total: ${totalCorrect}/${totalAttempted}`,
    `By category: ${JSON.stringify(byCategory)}`,
    `Recent lesson IDs: ${recent.join(', ') || '(none)'}`,
  ].join('\n');

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  let result = { level: 'N3', reasoning: 'AI evaluation unavailable' };
  try {
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }),
    });
    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '');
      console.error('Gemini non-OK:', geminiRes.status, errText.slice(0, 200));
    } else {
      const geminiJson = await geminiRes.json();
      const text = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      result = safeParseLevel(text);
    }
  } catch (err) {
    console.error('Gemini call failed:', err);
  }

  const { error: updateErr } = await sb
    .from('user_profiles')
    .update({
      ai_level: result.level,
      ai_level_updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);

  if (updateErr) {
    console.error('Profile update failed:', updateErr);
    return jsonResponse({ error: 'Profile update failed', detail: updateErr.message }, 500);
  }

  return jsonResponse({ level: result.level, reasoning: result.reasoning });
});