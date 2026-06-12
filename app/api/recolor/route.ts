import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { image, colorName, colorHex, colorPrompt, referenceImage } = await req.json();

    if (!image || !colorName) {
      return NextResponse.json({ error: 'Missing image or color data' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });
    }

    const keepRule = `Keep absolutely everything else completely identical and unchanged: the exact same architecture, windows, doors, shutters, roof, chimney, vegetation, sky, ground, shadows, highlights, lighting direction, texture, materials and details. Photorealistic result, maintain the exact same perspective, framing and composition. Do not add or remove any object.`;

    // Le contenu envoyé : la photo de façade, puis (optionnel) la teinte de
    // référence, puis l'instruction texte.
    const content: Array<Record<string, unknown>> = [
      { type: 'image_url', image_url: { url: image } },
    ];

    let prompt: string;
    if (referenceImage) {
      // Teinte personnalisée : on fournit l'échantillon comme 2e image.
      content.push({ type: 'image_url', image_url: { url: referenceImage } });
      prompt = `The FIRST image is a house. The SECOND image is a flat paint colour swatch. Repaint ONLY the exterior walls/facade of the house so they are exactly the solid colour of the swatch in the second image (${colorPrompt}, approximately hex ${colorHex}). The new wall colour must clearly and visibly match that swatch. ${keepRule}`;
    } else {
      prompt = `Change ONLY the exterior wall/facade color of this house to ${colorName} — ${colorPrompt} (target color hex ${colorHex}). The wall paint color must clearly and visibly become this color. ${keepRule}`;
    }
    content.push({ type: 'text', text: prompt });

    // Modèles d'édition d'image, par ordre de préférence (qualité de recoloriage).
    // gemini-3-pro recolorise réellement ; 3.1-flash sert de repli si indispo.
    const models = [
      'google/gemini-3-pro-image-preview',
      'google/gemini-3.1-flash-image-preview',
    ];

    let res: Response | null = null;
    let lastErr = '';
    for (const model of models) {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://facade-ia.vercel.app',
          'X-Title': 'FaçadeIA',
        },
        body: JSON.stringify({
          model,
          modalities: ['image', 'text'],
          messages: [{ role: 'user', content }],
        }),
      });
      if (res.ok) break;
      lastErr = await res.text();
      res = null;
    }

    if (!res) {
      throw new Error(`OpenRouter error: ${lastErr}`);
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
