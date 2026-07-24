import { NextRequest, NextResponse } from 'next/server';
import { COLORS, toPublicColor } from '../../lib/colors';

export const maxDuration = 30;

const MAX_IMAGE_CHARS = 8_000_000;

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Aucune image fournie' }, { status: 400 });
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

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Service d\'analyse non configuré' },
        { status: 500 }
      );
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://facade-ia.vercel.app',
        'X-Title': 'Gooweb Color',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4.6',
        max_tokens: 600,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: image },
              },
              {
                type: 'text',
                text: `Tu es un consultant expert en couleurs pour façades de bâtiments.

Analyse cette image de façade et rédige, pour CHACUNE des ${COLORS.length} couleurs ci-dessous, une courte phrase en français (max 20 mots) expliquant POURQUOI cette couleur serait belle sur CETTE façade spécifique. Considère le style architectural, l'environnement, les matériaux visibles.

Les ${COLORS.length} couleurs (dans cet ordre) : ${COLORS.map((c) => `${c.fullName}`).join(', ')}.

Réponds UNIQUEMENT avec ce JSON valide, sans aucun texte avant ou après :
{
  "isValidFacade": true,
  "colors": [
${COLORS.map(
  (c) => `    { "id": "${c.id}", "reason": "Ta phrase personnalisée pour ${c.fullName}..." }`
).join(',\n')}
  ]
}

Si l'image ne montre pas une façade de bâtiment, mets "isValidFacade": false et des reasons génériques.`,
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Analyze OpenRouter error:', err.slice(0, 400));
      return NextResponse.json(
        { error: 'L\'analyse a échoué. Réessayez dans un instant.' },
        { status: 502 }
      );
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      return NextResponse.json(
        { error: 'Réponse d\'analyse vide. Réessayez.' },
        { status: 502 }
      );
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Analyse illisible. Réessayez.' },
        { status: 502 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const reasonsById: Record<string, string> = {};
    if (Array.isArray(parsed.colors)) {
      parsed.colors.forEach((c: { id?: string; reason?: string }, i: number) => {
        const key = c.id || COLORS[i]?.id;
        if (key && c.reason) reasonsById[key] = c.reason;
      });
    }

    // Pas de recolorPrompt côté client
    const colors = COLORS.map((c) =>
      toPublicColor(
        c,
        reasonsById[c.id] || `Une teinte ${c.name.toLowerCase()} qui valorise cette façade.`
      )
    );

    return NextResponse.json({
      isValidFacade: parsed.isValidFacade !== false,
      colors,
    });
  } catch (err) {
    console.error('Analyze error:', err);
    return NextResponse.json(
      { error: 'Une erreur est survenue lors de l\'analyse. Réessayez.' },
      { status: 500 }
    );
  }
}
