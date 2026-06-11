import Replicate from 'replicate';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { image, colorName, colorHex, colorPrompt } = await req.json();

    if (!image || !colorName) {
      return NextResponse.json({ error: 'Missing image or color data' }, { status: 400 });
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'REPLICATE_API_TOKEN not configured' }, { status: 500 });
    }

    const replicate = new Replicate({ auth: token });

    const prompt = `Change ONLY the exterior wall color of this house facade to ${colorName} — ${colorPrompt} (hex ${colorHex}). The wall paint color must change to exactly this color. Keep absolutely everything else completely identical and unchanged: the exact same architecture, windows, doors, shutters, roof, chimney, vegetation, sky, ground, shadows, highlights, lighting direction, texture details, and photo quality. Photorealistic result, maintain exact perspective and composition.`;

    // Use FLUX Kontext Pro for high-quality targeted image editing
    let output: unknown;
    try {
      output = await replicate.run('black-forest-labs/flux-kontext-pro', {
        input: {
          prompt,
          input_image: image,
          output_format: 'jpg',
          output_quality: 92,
          safety_tolerance: 5,
          aspect_ratio: 'match_input_image',
        },
      });
    } catch {
      // Fallback to SDXL img2img if FLUX Kontext is unavailable
      output = await replicate.run(
        'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e68f3b00fc41f449d8f7f64c9',
        {
          input: {
            prompt,
            image,
            prompt_strength: 0.45,
            num_inference_steps: 40,
            guidance_scale: 7.5,
            refine: 'expert_ensemble_refiner',
          },
        }
      );
    }

    // Extract URL from output (can be string, array, or ReadableStream)
    let resultUrl: string | null = null;

    if (typeof output === 'string') {
      resultUrl = output;
    } else if (Array.isArray(output) && output.length > 0) {
      resultUrl = String(output[0]);
    } else if (output && typeof output === 'object' && 'url' in output) {
      resultUrl = String((output as { url: string }).url);
    }

    if (!resultUrl) {
      throw new Error('No output URL received from Replicate');
    }

    // Fetch the image and return as base64 so client doesn't need CORS
    const imgResponse = await fetch(resultUrl);
    if (!imgResponse.ok) throw new Error('Failed to fetch result image');

    const buffer = await imgResponse.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
    const dataUrl = `data:${contentType};base64,${base64}`;

    return NextResponse.json({ resultUrl: dataUrl });
  } catch (err) {
    console.error('Recolor error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Recoloring failed: ${message}` }, { status: 500 });
  }
}
