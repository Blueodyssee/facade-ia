import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const START = 300;
const KEY = 'gooweb_sim_counter';

// ── Mode global (Upstash Redis REST) si configuré ──────────────────────────────
const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(URL && TOKEN);

// ── Repli local en mémoire (dev / pas d'Upstash) ───────────────────────────────
let memCounter: number | null = null;

async function upstash(parts: string[]): Promise<unknown> {
  const res = await fetch(`${URL}/${parts.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  const data = await res.json();
  return data.result;
}

async function getCount(): Promise<number> {
  if (useUpstash) {
    const v = await upstash(['get', KEY]);
    if (v === null || v === undefined) {
      await upstash(['set', KEY, String(START)]);
      return START;
    }
    return Number(v);
  }
  if (memCounter === null) memCounter = START;
  return memCounter;
}

async function setCount(value: number): Promise<void> {
  if (useUpstash) {
    await upstash(['set', KEY, String(value)]);
  } else {
    memCounter = value;
  }
}

// GET → valeur restante
export async function GET() {
  const remaining = await getCount();
  return NextResponse.json({ remaining });
}

// POST { action: 'decrement' | 'refund' }
export async function POST(req: Request) {
  let action = 'decrement';
  try {
    const body = await req.json();
    if (body?.action) action = body.action;
  } catch {
    /* corps vide → décrément par défaut */
  }

  const current = await getCount();

  if (action === 'refund') {
    const next = Math.min(START, current + 1);
    await setCount(next);
    return NextResponse.json({ remaining: next, blocked: false });
  }

  // décrément : bloque si déjà à 0
  if (current <= 0) {
    return NextResponse.json({ remaining: 0, blocked: true });
  }
  const next = Math.max(0, current - 1);
  await setCount(next);
  return NextResponse.json({ remaining: next, blocked: false });
}
