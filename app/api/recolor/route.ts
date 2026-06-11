import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { image, colorName, colorHex, colorPrompt } = await req.json();

    if (!image || !colorName) {
      return NextResponse.json({ error: 'Missing image or color data' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });
    }

    const prompt = `Change ONLY the exterior wall/facade color of this house to ${colorName} — ${colorPrompt} (target color hex ${colorHex}). The wall paint color must become exactly this color. Keep absolutely everything else completely identical and unchanged: the exact same architecture, windows, doors, shutters, roof, chimney, vegetation, sky, ground, shadows, highlights, lighting direction, texture, materials and details. Photorealistic result, maintain the exact same perspective, framing and composition. Do not add or remove any object.`;

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
