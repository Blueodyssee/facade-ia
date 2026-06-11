import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

const COLORS = [
  {
    id: 'G00',
    name: 'Naturel',
    fullName: 'G00 Naturel',
    hex: '#F0EEE8',
    ncs: '0502-Y50R',
    lrv: '0.24',
    recolorPrompt: 'very light warm off-white, almost white with barely visible warm undertones, like natural linen',
  },
  {
    id: 'R93',
    name: 'Brique Chaud',
    fullName: 'R93 Brique Chaud',
    hex: '#C46248',
    ncs: '4040-Y80R',
    lrv: '0.68',
    recolorPrompt: 'warm terracotta brick red, earthy and rich, like traditional fired clay bricks',
  },
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

Analyse cette image de façade et rédige une courte phrase en français (max 20 mots) expliquant POURQUOI chacune de ces 2 couleurs serait belle sur CETTE façade spécifique. Considère le style architectural, l'environnement, les matériaux visibles.

Réponds UNIQUEMENT avec ce JSON valide, sans aucun texte avant ou après :
{
  "isValidFacade": true,
  "colors": [
    {
      "id": "G00",
      "name": "Naturel",
      "fullName": "G00 Naturel",
      "hex": "#F0EEE8",
      "ncs": "0502-Y50R",
      "lrv": "0.24",
      "recolorPrompt": "very light warm off-white, almost white with barely visible warm undertones, like natural linen",
      "reason": "Ta phrase personnalisée ici pour cette façade..."
    },
    {
      "id": "R93",
      "name": "Brique Chaud",
      "fullName": "R93 Brique Chaud",
      "hex": "#C46248",
      "ncs": "4040-Y80R",
      "lrv": "0.68",
      "recolorPrompt": "warm terracotta brick red, earthy and rich, like traditional fired clay bricks",
      "reason": "Ta phrase personnalisée ici pour cette façade..."
    }
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

    // Ensure all fields are present (merge with defaults)
    if (parsed.colors) {
      parsed.colors = parsed.colors.map((c: Record<string, string>, i: number) => ({
        ...COLORS[i],
        ...c,
        hex: COLORS[i].hex,
        recolorPrompt: COLORS[i].recolorPrompt,
      }));
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error('Analyze error:', err);
    // Return fallback colors with generic reasons
    return NextResponse.json({
      isValidFacade: true,
      colors: [
        {
          ...{
            id: 'G00',
            name: 'Naturel',
            fullName: 'G00 Naturel',
            hex: '#F0EEE8',
            ncs: '0502-Y50R',
            lrv: '0.24',
            recolorPrompt: 'very light warm off-white, almost white with barely visible warm undertones, like natural linen',
          },
          reason: 'Apporte luminosité et élégance intemporelle à cette façade.',
        },
        {
          ...{
            id: 'R93',
            name: 'Brique Chaud',
            fullName: 'R93 Brique Chaud',
            hex: '#C46248',
            ncs: '4040-Y80R',
            lrv: '0.68',
            recolorPrompt: 'warm terracotta brick red, earthy and rich, like traditional fired clay bricks',
          },
          reason: 'Donne caractère et chaleur authentique à cette façade.',
        },
      ],
    });
  }
}
