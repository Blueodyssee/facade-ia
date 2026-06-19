import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

// Les 10 teintes du nuancier (rangées du plus clair au plus foncé).
// Le hex est mesuré directement sur les échantillons du dossier /couleurs.
// `recolorPrompt` = courte description anglaise de la couleur, INVISIBLE côté client,
// envoyée à l'IA de recoloriage. Indispensable à la fidélité couleur (testé le 19/06/2026).
const COLORS = [
  { id: 'G10',  name: 'Blanc Lumière',   fullName: 'G10 Blanc Lumière',   hex: '#F6F5F3',
    recolorPrompt: 'a bright clean white, very light and crisp, like fresh white paint' },
  { id: '320',  name: 'Blanc Cassé',     fullName: '320 Blanc Cassé',     hex: '#E2DCD4',
    recolorPrompt: 'a warm off-white cream, soft and light' },
  { id: 'J50',  name: 'Jaune Paille',    fullName: 'J50 Jaune Paille',    hex: '#F0CD75',
    recolorPrompt: 'a warm straw yellow, golden and sunny' },
  { id: 'T20',  name: 'Sable Clair',     fullName: 'T20 Sable Clair',     hex: '#DCBE98',
    recolorPrompt: 'a light sandy beige, warm and soft' },
  { id: '190',  name: 'Beige',           fullName: '190 Beige',           hex: '#D6BB9E',
    recolorPrompt: 'a natural warm beige, a soft tan tone' },
  { id: 'G37',  name: 'Sable Rosé',      fullName: 'G37 Sable Rosé',      hex: '#D8B4A1',
    recolorPrompt: 'a soft pinkish rosy beige, a sandy pink tone' },
  { id: 'G16',  name: 'Gris Nuage',      fullName: 'G16 Gris Nuage',      hex: '#BAB8B5',
    recolorPrompt: 'a light neutral cloud grey, soft and slightly cool' },
  { id: 'V59',  name: 'Vert Sauge',      fullName: 'V59 Vert Sauge',      hex: '#ACB28E',
    recolorPrompt: 'a soft muted sage green, a greyish dusty green like dried sage leaves' },
  { id: 'R80',  name: 'Terre de Sienne', fullName: 'R80 Terre de Sienne', hex: '#BB633D',
    recolorPrompt: 'a warm terracotta sienna, an earthy brick orange-red' },
  { id: '0147', name: 'Brun Doux',       fullName: '0147 Brun Doux',      hex: '#A46B3F',
    recolorPrompt: 'a warm soft brown, a caramel earthy brown tone' },
];

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://facade-ia.vercel.app',
        'X-Title': 'FaçadeIA',
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
      throw new Error(`OpenRouter error: ${err}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('No content in OpenRouter response');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    const parsed = JSON.parse(jsonMatch[0]);

    // Build the full color objects from our reference list, attaching the
    // AI-written reason (matched by id, falling back to position).
    const reasonsById: Record<string, string> = {};
    if (Array.isArray(parsed.colors)) {
      parsed.colors.forEach((c: { id?: string; reason?: string }, i: number) => {
        const key = c.id || COLORS[i]?.id;
        if (key && c.reason) reasonsById[key] = c.reason;
      });
    }

    const colors = COLORS.map((c) => ({
      ...c,
      reason: reasonsById[c.id] || `Une teinte ${c.name.toLowerCase()} qui valorise cette façade.`,
    }));

    return NextResponse.json({
      isValidFacade: parsed.isValidFacade !== false,
      colors,
    });
  } catch (err) {
    console.error('Analyze error:', err);
    // Fallback: return all reference colors with generic reasons
    return NextResponse.json({
      isValidFacade: true,
      colors: COLORS.map((c) => ({
        ...c,
        reason: `Une teinte ${c.name.toLowerCase()} qui valorise cette façade.`,
      })),
    });
  }
}
