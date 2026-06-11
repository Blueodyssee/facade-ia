import { NextRequest, NextResponse } from 'next/server';

// Protège tout le site par un mot de passe partagé (HTTP Basic Auth).
// Le mot de passe est défini par la variable d'environnement APP_PASSWORD
// (valeur par défaut "web" si non configurée).
export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD || 'web';

  const authHeader = req.headers.get('authorization');

  if (authHeader) {
    // Format attendu : "Basic base64(user:pass)"
    const encoded = authHeader.split(' ')[1] || '';
    const decoded = Buffer.from(encoded, 'base64').toString();
    const pass = decoded.split(':')[1] || '';

    if (pass === password) {
      return NextResponse.next();
    }
  }

  // Demande l'authentification (popup navigateur)
  return new NextResponse('Authentification requise', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="FacadeIA", charset="UTF-8"',
    },
  });
}

// N'applique la protection qu'aux pages, pas aux fichiers statiques internes
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
