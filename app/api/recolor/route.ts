import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { image, swatch, colorName, colorHex, colorPrompt } = await req.json();

    if (!image || !colorName) {
      return NextResponse.json({ error: 'Missing image or color data' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });
    }

    const prompt = `You are given two images. The FIRST is a photo of a house/building. The SECOND is a solid color swatch showing the EXACT target wall paint color: ${colorPrompt} (color "${colorName}", hex ${colorHex}). FULLY repaint ALL the exterior facade walls of the building in the first image so they CLEARLY and OBVIOUSLY become exactly that color — a strong, unmistakable repaint, NOT a faint tint or subtle wash. Keep absolutely everything else completely identical and unchanged: the same architecture, windows, doors, shutters, roof, signs, chimney, vegetation, sky, ground, shadows, lighting direction and framing. Do NOT zoom, do NOT crop, keep the same composition. The image may contain neutral grey bands on the edges; leave them exactly as they are.`;

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://facade-ia.vercel.app',
        'X-Title': 'FaçadeIA',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image',
        modalities: ['image', 'text'],
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: image } },
              ...(swatch ? [{ type: 'image_url', image_url: { url: swatch } }] : []),
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter error: ${errText}`);
    }

    const data = await res.json();

    // Image-output models return images on the assistant message
    const message = data.choices?.[0]?.message;
    const resultUrl: string | undefined =
      message?.images?.[0]?.image_url?.url || message?.images?.[0]?.url;

    if (!resultUrl) {
      throw new Error(
        `No image in response: ${JSON.stringify(data).slice(0, 300)}`
      );
    }

    // resultUrl is already a data URL (data:image/...;base64,...) — return as-is
    return NextResponse.json({ resultUrl });
  } catch (err) {
    console.error('Recolor error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Recoloring failed: ${message}` }, { status: 500 });
  }
}
