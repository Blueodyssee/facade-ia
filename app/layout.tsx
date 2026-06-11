import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FaçadeIA — Visualisez votre façade en couleur',
  description: 'Simulez la couleur de votre façade en quelques secondes grâce à l\'IA',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-[#F7F6F3] text-gray-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
