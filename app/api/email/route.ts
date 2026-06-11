import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { to, colorName, resultImageUrl } = await req.json();

    if (!to || !colorName) {
      return NextResponse.json({ error: 'Missing email or color' }, { status: 400 });
    }

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.EMAIL_FROM || 'FaçadeIA <noreply@facadeia.fr>';

    if (!resendKey) {
      // If Resend not configured, return instructions
      return NextResponse.json({
        error: 'EMAIL_NOT_CONFIGURED',
        message: 'Service email non configuré. Téléchargez l\'image et envoyez-la manuellement.',
      }, { status: 503 });
    }

    const { Resend } = await import('resend');
    const resend = new Resend(resendKey);

    // If resultImageUrl is a data URL, convert to attachment
    let attachments: { filename: string; content: Buffer }[] = [];
    if (resultImageUrl?.startsWith('data:')) {
      const base64Data = resultImageUrl.split(',')[1];
      attachments = [
        {
          filename: `facade-${colorName.replace(/\s+/g, '-').toLowerCase()}.jpg`,
          content: Buffer.from(base64Data, 'base64'),
        },
      ];
    }

    await resend.emails.send({
      from: fromEmail,
      to,
      subject: `Votre simulation de façade — ${colorName}`,
      html: `
        <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
          <div style="background: #1a1a1a; padding: 32px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #F0EEE8; margin: 0; font-size: 24px; font-weight: 600;">FaçadeIA</h1>
            <p style="color: #999; margin: 8px 0 0; font-size: 14px;">Simulation de couleur de façade</p>
          </div>
          <div style="background: #fff; padding: 32px; border-radius: 0 0 12px 12px; border: 1px solid #eee;">
            <h2 style="font-size: 20px; font-weight: 600; margin: 0 0 16px;">Votre simulation est prête</h2>
            <p style="color: #555; line-height: 1.6; margin: 0 0 24px;">
              Voici votre façade simulée avec la couleur <strong>${colorName}</strong>.
              L'image est jointe à cet email.
            </p>
            <div style="background: #f7f6f3; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <p style="margin: 0; font-size: 14px; color: #666;">
                💡 <strong>Conseil :</strong> Pour valider votre choix, nous vous recommandons de tester un échantillon physique de la peinture sur votre façade avant de commencer les travaux.
              </p>
            </div>
            <p style="color: #999; font-size: 13px; margin: 0;">
              Simulation générée par FaçadeIA • Cette image est indicative
            </p>
          </div>
        </div>
      `,
      attachments,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Email error:', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
