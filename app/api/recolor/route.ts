import { NextRequest, NextResponse } from 'next/server';
import { getColorById } from '../../lib/colors';

export const maxDuration = 120;

/** Taille max d'une data-URL image (~6 Mo base64 ≈ image compressée raisonnable). */
const MAX_IMAGE_CHARS = 8_000_000;

/**
 * Modèles d'édition d'image, par ordre de préférence (qualité de recoloriage).
 * V2 (commit c85cc6b) utilisait gemini-3-pro en premier — bien plus fidèle
 * que Nano Banana seul (trop clair / recoloriage partiel).
 *
 * Override possible : RECOLOR_MODEL=google/gemini-2.5-flash-image (moins cher)
 * ou RECOLOR_MODEL=google/gemini-3-pro-image-preview (qualité max).
 */
function getModels(): string[] {
  const forced = process.env.RECOLOR_MODEL?.trim();
  if (forced) return [forced];

  return [
    'google/gemini-3-pro-image-preview',
    'google/gemini-2.5-flash-image',
  ];
}

function extractResultUrl(data: unknown): string | undefined {
  const message = (data as {
    choices?: Array<{
      message?: {
        images?: Array<{ image_url?: { url?: string }; url?: string }>;
        content?: unknown;
      };
    }>;
  })?.choices?.[0]?.message;

  if (!message) return undefined;

  const fromImages =
    message.images?.[0]?.image_url?.url || message.images?.[0]?.url;
  if (fromImages) return fromImages;

  // Certains formats renvoient l'image dans content[]
  const content = message.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const p = part as {
        type?: string;
        image_url?: { url?: string };
        url?: string;
      };
      if (p.type === 'image_url' && p.image_url?.url) return p.image_url.url;
      if (typeof p.url === 'string' && p.url.startsWith('data:image')) return p.url;
    }
  }

  if (typeof content === 'string' && content.startsWith('data:image')) {
    return content;
  }

  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      image,
      swatch,
      colorId,
      colorName,
      colorHex,
      colorPrompt: clientPrompt,
    } = body as {
      image?: string;
      swatch?: string;
      colorId?: string;
      colorName?: string;
      colorHex?: string;
      colorPrompt?: string;
    };

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Image manquante' }, { status: 400 });
    }
    if (!image.startsWith('data:image')) {
      return NextResponse.json({ error: 'Format image invalide' }, { status: 400 });
    }
    if (image.length > MAX_IMAGE_CHARS) {
      return NextResponse.json(
        { error: 'Image trop volumineuse. Compressez la photo et réessayez.' },
        { status: 400 }
      );
    }

    // Palette serveur = source de vérité (prompt + hex + nom).
    const palette = getColorById(colorId);
    const resolvedName = palette?.fullName || colorName;
    const resolvedHex = palette?.hex || colorHex || '';
    const resolvedPrompt =
      palette?.recolorPrompt ||
      clientPrompt ||
      (resolvedHex ? `opaque facade paint exactly ${resolvedHex}` : '');

    if (!resolvedName) {
      return NextResponse.json({ error: 'Couleur manquante' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Service de recoloriage non configuré' },
        { status: 500 }
      );
    }

    // Prompt inspiré V2 (fidélité) + insistances anti « teinte trop claire / partielle ».
    const keepRule =
      'Keep absolutely everything else completely identical and unchanged: the exact same architecture, windows, doors, shutters, roof, chimney, vegetation, sky, ground, shadows, highlights, lighting direction, wall texture grain, materials and details. Photorealistic result, maintain the exact same perspective, framing and composition. Do not add or remove any object. The image may contain neutral grey bands on the edges; leave them exactly as they are.';

    const prompt = swatch
      ? `You are given two images. The FIRST is a photo of a house/building. The SECOND is a solid colour paint swatch showing the EXACT target wall colour: ${resolvedPrompt} (colour "${resolvedName}", hex ${resolvedHex}).

FULLY repaint ALL exterior facade walls of the building so they become OPAQUE wall paint matching the swatch EXACTLY — same hue, same darkness, same saturation. Strong, unmistakable full-coverage repaint of every wall surface (including recesses, side walls, under eaves). NOT a faint tint, NOT a translucent wash, NOT a lightened pastel version of the swatch.

${keepRule}`
      : `Change ONLY the exterior wall/facade colour of this house to ${resolvedName} — ${resolvedPrompt} (target hex ${resolvedHex}). The wall paint must CLEARLY and FULLY become this colour at full opacity — same darkness as the hex, not lightened. ${keepRule}`;

    const content: Array<Record<string, unknown>> = [
      { type: 'image_url', image_url: { url: image } },
    ];
    if (swatch && typeof swatch === 'string' && swatch.startsWith('data:image')) {
      content.push({ type: 'image_url', image_url: { url: swatch } });
    }
    content.push({ type: 'text', text: prompt });

    const models = getModels();
    let data: unknown = null;
    let lastErr = '';

    for (const model of models) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://facade-ia.vercel.app',
          'X-Title': 'Gooweb Color',
        },
        body: JSON.stringify({
          model,
          modalities: ['image', 'text'],
          messages: [{ role: 'user', content }],
        }),
      });

      if (!res.ok) {
        lastErr = await res.text();
        console.error(`Recolor model ${model} failed:`, lastErr.slice(0, 400));
        continue;
      }

      data = await res.json();
      const resultUrl = extractResultUrl(data);
      if (resultUrl) {
        return NextResponse.json({ resultUrl, model });
      }

      lastErr = `No image in response from ${model}`;
      console.error(lastErr, JSON.stringify(data).slice(0, 300));
      data = null;
    }

    throw new Error(
      lastErr
        ? `Recoloring failed: ${lastErr.slice(0, 280)}`
        : 'Recoloring failed: no model available'
    );
  } catch (err) {
    console.error('Recolor error:', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    // Ne pas renvoyer de corps OpenRouter brut trop long au client
    const safe =
      message.includes('OPENROUTER') || message.includes('OpenRouter')
        ? 'Le service de recoloriage est temporairement indisponible. Réessayez dans un instant.'
        : message.startsWith('Recoloring failed')
          ? 'Le recoloriage a échoué. Réessayez avec une autre photo ou teinte.'
          : message;
    return NextResponse.json({ error: safe }, { status: 500 });
  }
}
