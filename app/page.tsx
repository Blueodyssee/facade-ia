'use client';

import { useState, useRef, useEffect } from 'react';
import { createWatermarkedImage, generateFacadePDF, fileTimestamp, extractDominantColor, hexToColorName, makeSolidSwatch, matchAspect } from './lib/export';

// ─── Types ───────────────────────────────────────────────────────────────────

type Color = {
  id: string;
  name: string;
  fullName: string;
  hex: string;
  ncs: string;
  lrv: string;
  recolorPrompt: string;
  reason: string;
};

type AppStep = 'upload' | 'analyzing' | 'colors' | 'recoloring' | 'result';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function compressImage(dataUrl: string, maxPx = 1280, quality = 0.88): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        const ratio = Math.min(maxPx / width, maxPx / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SpinnerIcon() {
  return (
    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ColorCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden bg-white shadow-sm border border-gray-100 animate-pulse">
      <div className="h-40 animate-shimmer" />
      <div className="p-5 space-y-3">
        <div className="h-5 bg-gray-100 rounded-full w-3/4" />
        <div className="h-3 bg-gray-100 rounded-full w-1/3" />
        <div className="h-4 bg-gray-100 rounded-full w-full" />
        <div className="h-4 bg-gray-100 rounded-full w-2/3" />
      </div>
    </div>
  );
}

// ─── Color Card ───────────────────────────────────────────────────────────────

function ColorCard({ color, onSelect }: { color: Color; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="group text-left rounded-2xl overflow-hidden bg-white shadow-sm border border-gray-100 hover:shadow-lg hover:border-gray-200 hover:-translate-y-1 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
    >
      {/* Color swatch */}
      <div
        className="h-44 w-full relative"
        style={{ backgroundColor: color.hex }}
      >
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center bg-black/10 backdrop-blur-[1px]">
          <span className="bg-white text-gray-900 text-sm font-semibold px-5 py-2 rounded-full shadow-lg">
            Choisir cette couleur
          </span>
        </div>
      </div>

      {/* Card info */}
      <div className="p-5 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{color.id}</p>
            <p className="text-lg font-semibold text-gray-900 leading-tight">{color.name}</p>
          </div>
          <span
            className="mt-1 w-7 h-7 rounded-full border-2 border-white shadow-md flex-shrink-0"
            style={{ backgroundColor: color.hex }}
          />
        </div>
        <p className="text-xs text-gray-400 font-mono">{color.ncs}</p>
        {color.reason && (
          <p className="text-sm text-gray-600 leading-relaxed pt-1 border-t border-gray-50">
            {color.reason}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Email Modal ──────────────────────────────────────────────────────────────

function EmailModal({
  onClose,
  onSend,
  colorName,
}: {
  onClose: () => void;
  onSend: (email: string) => void;
  colorName: string;
}) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!email || !email.includes('@')) return;
    setSending(true);
    await onSend(email);
    setSending(false);
    setSent(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
        {sent ? (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto">
              <CheckIcon />
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">Email envoyé !</p>
              <p className="text-sm text-gray-500 mt-1">Votre simulation a été envoyée à <strong>{email}</strong></p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Envoyer par email</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none">×</button>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              Recevez votre simulation de façade <strong>{colorName}</strong> directement par email.
            </p>
            <input
              type="email"
              placeholder="votre@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-gray-900 transition-colors mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm"
              >
                Annuler
              </button>
              <button
                onClick={handleSend}
                disabled={!email.includes('@') || sending}
                className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm flex items-center justify-center gap-2"
              >
                {sending ? <><SpinnerIcon /> Envoi…</> : 'Envoyer'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [step, setStep] = useState<AppStep>('upload');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [userColorImage, setUserColorImage] = useState<string | null>(null);
  const [userColor, setUserColor] = useState<Color | null>(null);
  const [colors, setColors] = useState<Color[]>([]);
  const [selectedColor, setSelectedColor] = useState<Color | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [watermarkedImage, setWatermarkedImage] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [dragFacade, setDragFacade] = useState(false);
  const [dragColor, setDragColor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // ── Lecture de la photo de façade (sans déclencher d'action) ──────────────

  const readFacadeFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('La photo de façade doit être une image (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('Image trop grande (max 20 Mo).');
      return;
    }
    setError(null);
    try {
      const raw = await readFileAsDataUrl(file);
      const compressed = await compressImage(raw);
      setUploadedImage(compressed);
    } catch (err) {
      console.error(err);
      setError('Impossible de lire cette photo. Essayez une autre image.');
    }
  };

  const clearFacade = () => setUploadedImage(null);

  // ── Lecture de la teinte personnelle (sans déclencher d'action) ───────────

  const handleColorFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('La teinte doit être une image (JPG, PNG, WebP).');
      return;
    }
    setError(null);
    try {
      const raw = await readFileAsDataUrl(file);
      const compressed = await compressImage(raw, 400, 0.9);
      const hex = await extractDominantColor(compressed);
      setUserColorImage(compressed);
      setUserColor({
        id: 'USER',
        name: 'Votre teinte',
        fullName: 'Votre teinte personnalisée',
        hex,
        ncs: '',
        lrv: '',
        recolorPrompt: `a ${hexToColorName(hex)} color`,
        reason: 'Teinte que vous avez fournie.',
      });
    } catch (err) {
      console.error(err);
      setError('Impossible de lire cette teinte. Essayez une autre image.');
    }
  };

  const clearUserColor = () => {
    setUserColorImage(null);
    setUserColor(null);
  };

  // ── Coller depuis le presse-papier (bouton « Coller ») ────────────────────

  const readClipboardImage = async (): Promise<File | null> => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) return null;
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          const blob = await item.getType(type);
          return new File([blob], 'presse-papier.png', { type });
        }
      }
    } catch (e) {
      console.error('Clipboard read error:', e);
    }
    return null;
  };

  const pasteInto = async (target: 'facade' | 'color') => {
    const file = await readClipboardImage();
    if (!file) {
      setError("Aucune image dans le presse-papier. Copiez d'abord une image (ou utilisez « Choisir »).");
      return;
    }
    if (target === 'facade') readFacadeFile(file);
    else handleColorFile(file);
  };

  // ── Actions de l'écran de préparation ─────────────────────────────────────

  const proceedWithColor = () => {
    if (!uploadedImage || !userColor) return;
    runRecolor(userColor, uploadedImage, 'upload', userColorImage);
  };

  const proceedWithPresets = async () => {
    if (!uploadedImage) return;
    setError(null);
    setStep('analyzing');
    setLoadingMessage('Analyse de votre façade en cours…');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: uploadedImage }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      if (!data.isValidFacade) {
        setError("Cette image ne semble pas être une façade de bâtiment. Veuillez en uploader une autre.");
        setStep('upload');
        return;
      }

      setColors(data.colors);
      setStep('colors');
    } catch (err) {
      console.error(err);
      setError('Une erreur est survenue lors de l\'analyse. Vérifiez votre clé OPENROUTER_API_KEY.');
      setStep('upload');
    }
  };

  // ── Drag & drop (façade + teinte) ─────────────────────────────────────────

  const onDropFacade = (e: React.DragEvent) => {
    e.preventDefault();
    setDragFacade(false);
    const file = e.dataTransfer.files[0];
    if (file) readFacadeFile(file);
  };

  const onDropColor = (e: React.DragEvent) => {
    e.preventDefault();
    setDragColor(false);
    const file = e.dataTransfer.files[0];
    if (file) handleColorFile(file);
  };

  // ── Color selection & recoloring ──────────────────────────────────────────

  const runRecolor = async (
    color: Color,
    image: string,
    onErrorStep: AppStep = 'colors',
    referenceImage?: string | null
  ) => {
    setSelectedColor(color);
    setStep('recoloring');
    setError(null);
    setWatermarkedImage(null);

    const messages = [
      `Application de ${color.name}…`,
      `L'IA retravaille votre façade…`,
      `Peaufinage des détails…`,
      `Presque terminé…`,
    ];
    let msgIdx = 0;
    setLoadingMessage(messages[0]);
    const interval = setInterval(() => {
      msgIdx = (msgIdx + 1) % messages.length;
      setLoadingMessage(messages[msgIdx]);
    }, 4000);

    try {
      const res = await fetch('/api/recolor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image,
          colorName: color.fullName,
          colorHex: color.hex,
          colorPrompt: color.recolorPrompt,
          referenceImage: referenceImage || undefined,
        }),
      });

      clearInterval(interval);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Recoloring failed');
      }

      const data = await res.json();
      // Recadre le résultat au ratio de la photo d'origine (corrige le carré).
      let finalImage = data.resultUrl;
      try {
        finalImage = await matchAspect(data.resultUrl, image);
      } catch (e) {
        console.error('Aspect match error:', e);
      }
      setResultImage(finalImage);
      setStep('result');
    } catch (err) {
      clearInterval(interval);
      console.error(err);
      setError('Erreur lors du recoloriage. Vérifiez votre clé OPENROUTER_API_KEY.');
      setStep(onErrorStep);
      setSelectedColor(null);
    }
  };

  const handleColorSelect = (color: Color) => {
    if (!uploadedImage) return;
    // On fournit une vignette unie de la couleur comme référence visuelle,
    // ce qui rend le recoloriage nettement plus fiable.
    const swatch = makeSolidSwatch(color.hex);
    runRecolor(color, uploadedImage, 'colors', swatch);
  };

  // ── Collage global (Ctrl+V) sur l'écran de préparation ────────────────────
  // Si aucune façade n'est encore présente → la photo va dans la façade,
  // sinon elle va dans la teinte.

  useEffect(() => {
    if (step !== 'upload') return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            if (!uploadedImage) readFacadeFile(file);
            else handleColorFile(file);
          }
          break;
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, uploadedImage]);

  // ── Génération du watermark dès que le résultat est prêt ───────────────────

  useEffect(() => {
    if (step === 'result' && resultImage && !watermarkedImage) {
      createWatermarkedImage(resultImage)
        .then(setWatermarkedImage)
        .catch((e) => console.error('Watermark error:', e));
    }
  }, [step, resultImage, watermarkedImage]);

  // ── Download (image watermarkée) ───────────────────────────────────────────

  const handleDownload = () => {
    const img = watermarkedImage || resultImage;
    if (!img) return;
    const a = document.createElement('a');
    a.href = img;
    a.download = `gooweb_facade_${fileTimestamp()}.jpg`;
    a.click();
  };

  // ── Génération du PDF avant/après ──────────────────────────────────────────

  const handlePdf = async () => {
    if (!uploadedImage || !resultImage || !selectedColor) return;
    setPdfLoading(true);
    try {
      const watermarked = watermarkedImage || (await createWatermarkedImage(resultImage));
      if (!watermarkedImage) setWatermarkedImage(watermarked);
      await generateFacadePDF({
        beforeUrl: uploadedImage,
        watermarkedAfterUrl: watermarked,
        nomCouleur: selectedColor.fullName,
      });
    } catch (e) {
      console.error('PDF error:', e);
      setError('Erreur lors de la génération du PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  // ── Email ─────────────────────────────────────────────────────────────────

  const handleEmailSend = async (email: string) => {
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          colorName: selectedColor?.fullName,
          resultImageUrl: watermarkedImage || resultImage,
        }),
      });
      const data = await res.json();
      if (data.error === 'EMAIL_NOT_CONFIGURED') {
        alert('Service email non configuré. Téléchargez l\'image et partagez-la manuellement.');
      }
    } catch (err) {
      console.error('Email error:', err);
    }
  };

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setStep('upload');
    setUploadedImage(null);
    setUserColorImage(null);
    setUserColor(null);
    setColors([]);
    setSelectedColor(null);
    setResultImage(null);
    setWatermarkedImage(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#F7F6F3]/80 backdrop-blur-md border-b border-gray-200/60">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center">
              <span className="text-[#F0EEE8] text-xs font-bold">F</span>
            </div>
            <span className="font-semibold text-gray-900 tracking-tight">FaçadeIA</span>
          </div>
          {step !== 'upload' && (
            <button
              onClick={handleReset}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1.5"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Recommencer
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-10 md:py-16 space-y-10">

        {/* Hero text — only on upload step */}
        {step === 'upload' && (
          <div className="text-center space-y-3 animate-fade-in">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight text-balance">
              Visualisez votre façade<br className="hidden md:block" /> en couleur
            </h1>
            <p className="text-gray-500 text-base md:text-lg max-w-lg mx-auto text-balance">
              Uploadez une photo de votre maison — et votre teinte si vous en avez une.
              Sinon, laissez l&apos;IA vous proposer 4 teintes adaptées à votre façade.
            </p>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm animate-fade-in flex items-start gap-2">
            <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-2.192-.833-2.964 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* ── STEP: Upload — préparation (2 zones + actions) ── */}
        {step === 'upload' && (
          <div className="animate-fade-in space-y-6">
            {/* Inputs fichiers cachés */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) readFacadeFile(file);
                e.target.value = '';
              }}
            />
            <input
              ref={colorInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleColorFile(file);
                e.target.value = '';
              }}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* ── Zone façade (obligatoire) ── */}
              <div
                className={`relative border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer min-h-[260px] flex
                  ${dragFacade ? 'border-gray-900 bg-gray-50 scale-[1.01]' : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'}`}
                onDrop={onDropFacade}
                onDragOver={(e) => { e.preventDefault(); setDragFacade(true); }}
                onDragLeave={() => setDragFacade(false)}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadedImage ? (
                  <div className="w-full p-3 flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="relative rounded-xl overflow-hidden flex-1 min-h-[180px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={uploadedImage} alt="Façade" className="absolute inset-0 w-full h-full object-cover" />
                    </div>
                    <div className="flex items-center justify-between pt-3">
                      <span className="text-sm font-medium text-gray-700">📷 Photo de façade</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          Remplacer
                        </button>
                        <button
                          onClick={clearFacade}
                          className="text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          Retirer
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center px-6 py-8 w-full space-y-3">
                    <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
                      <UploadIcon />
                    </div>
                    <div className="space-y-0.5">
                      <p className="font-semibold text-gray-900">Photo de façade</p>
                      <p className="text-xs text-gray-400">Glissez-déposez, choisissez ou collez • JPG, PNG, WebP</p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        className="bg-gray-900 text-white px-4 py-2 rounded-full text-xs font-medium hover:bg-gray-700 transition-colors"
                      >
                        Choisir
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); pasteInto('facade'); }}
                        className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-full text-xs font-medium hover:bg-gray-50 transition-colors"
                      >
                        Coller
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Zone teinte (optionnelle) ── */}
              <div
                className={`relative border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer min-h-[260px] flex
                  ${dragColor ? 'border-gray-900 bg-gray-50 scale-[1.01]' : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'}`}
                onDrop={onDropColor}
                onDragOver={(e) => { e.preventDefault(); setDragColor(true); }}
                onDragLeave={() => setDragColor(false)}
                onClick={() => colorInputRef.current?.click()}
              >
                {userColor ? (
                  <div className="w-full p-3 flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="relative rounded-xl overflow-hidden flex-1 min-h-[180px] flex items-center justify-center" style={{ backgroundColor: userColor.hex }}>
                      {userColorImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={userColorImage} alt="Teinte" className="max-h-full max-w-full object-contain" />
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-3">
                      <span className="text-sm font-medium text-gray-700">🎨 Votre teinte <span className="font-mono text-xs text-gray-400">{userColor.hex}</span></span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => colorInputRef.current?.click()}
                          className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          Remplacer
                        </button>
                        <button
                          onClick={clearUserColor}
                          className="text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          Retirer
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center px-6 py-8 w-full space-y-3">
                    <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
                      <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                      </svg>
                    </div>
                    <div className="space-y-0.5">
                      <p className="font-semibold text-gray-900">Votre teinte <span className="text-gray-400 font-normal">(optionnel)</span></p>
                      <p className="text-xs text-gray-400">Glissez-déposez, choisissez ou collez une couleur</p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); colorInputRef.current?.click(); }}
                        className="bg-gray-900 text-white px-4 py-2 rounded-full text-xs font-medium hover:bg-gray-700 transition-colors"
                      >
                        Choisir
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); pasteInto('color'); }}
                        className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-full text-xs font-medium hover:bg-gray-50 transition-colors"
                      >
                        Coller
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Boutons d'action (adaptatifs) ── */}
            <div className="space-y-3">
              {!uploadedImage && (
                <button
                  disabled
                  className="w-full bg-gray-200 text-gray-400 py-4 rounded-xl font-medium cursor-not-allowed"
                >
                  Ajoutez une photo de façade pour continuer
                </button>
              )}

              {uploadedImage && userColor && (
                <>
                  <button
                    onClick={proceedWithColor}
                    className="w-full bg-gray-900 text-white py-4 rounded-xl font-semibold hover:bg-gray-800 transition-colors shadow-sm"
                  >
                    Coloriser avec ma teinte
                  </button>
                  <div className="text-center">
                    <button
                      onClick={proceedWithPresets}
                      className="text-sm text-gray-500 hover:text-gray-900 underline-offset-2 hover:underline transition-colors"
                    >
                      ou choisir parmi 4 teintes proposées
                    </button>
                  </div>
                </>
              )}

              {uploadedImage && !userColor && (
                <button
                  onClick={proceedWithPresets}
                  className="w-full bg-gray-900 text-white py-4 rounded-xl font-semibold hover:bg-gray-800 transition-colors shadow-sm"
                >
                  Voir les 4 teintes proposées
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP: Analyzing ── */}
        {step === 'analyzing' && (
          <div className="animate-fade-in space-y-8">
            {/* Preview */}
            {uploadedImage && (
              <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100 max-h-72 md:max-h-96">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={uploadedImage} alt="Façade uploadée" className="w-full h-full object-cover" />
              </div>
            )}
            {/* Skeleton cards */}
            <div>
              <div className="flex items-center gap-3 mb-5">
                <SpinnerIcon />
                <p className="text-gray-700 font-medium">{loadingMessage}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <ColorCardSkeleton />
                <ColorCardSkeleton />
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: Colors ── */}
        {step === 'colors' && (
          <div className="animate-fade-in space-y-8">
            {/* Original image preview (compact) */}
            {uploadedImage && (
              <div className="flex items-center gap-4 bg-white rounded-2xl p-3 shadow-sm border border-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={uploadedImage}
                  alt="Votre façade"
                  className="w-16 h-16 object-cover rounded-xl flex-shrink-0"
                />
                <div>
                  <p className="font-medium text-gray-900 text-sm">Votre façade analysée</p>
                </div>
              </div>
            )}

            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-6">Sélectionnez une couleur pour simuler le rendu sur votre façade</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {colors.map((color) => (
                  <ColorCard
                    key={color.id}
                    color={color}
                    onSelect={() => handleColorSelect(color)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: Recoloring ── */}
        {step === 'recoloring' && selectedColor && (
          <div className="animate-fade-in space-y-8">
            {/* Before image */}
            {uploadedImage && (
              <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100 max-h-72 md:max-h-96 relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={uploadedImage}
                  alt="Façade originale"
                  className="w-full h-full object-cover opacity-60"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/30 backdrop-blur-[2px]">
                  <div
                    className="w-16 h-16 rounded-2xl border-4 border-white shadow-xl"
                    style={{ backgroundColor: selectedColor.hex }}
                  />
                  <div className="text-center">
                    <p className="font-semibold text-gray-900 text-lg">{selectedColor.fullName}</p>
                    <p className="text-sm text-gray-600 mt-1 flex items-center gap-2 justify-center">
                      <SpinnerIcon />
                      {loadingMessage}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Progress steps */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="space-y-4">
                {[
                  { label: 'Image analysée', done: true },
                  { label: `Couleur sélectionnée — ${selectedColor.name}`, done: true },
                  { label: 'Recoloriage IA en cours', done: false, active: true },
                  { label: 'Génération du résultat', done: false },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                        ${s.done ? 'bg-gray-900 text-white' : s.active ? 'bg-gray-900 text-white animate-pulse-slow' : 'bg-gray-100 text-gray-400'}`}
                    >
                      {s.done ? <CheckIcon /> : i + 1}
                    </div>
                    <span className={`text-sm ${s.done || s.active ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                      {s.label}
                    </span>
                    {s.active && (
                      <span className="ml-auto">
                        <SpinnerIcon />
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-5 text-center">Cette étape peut prendre 30 à 60 secondes</p>
            </div>
          </div>
        )}

        {/* ── STEP: Result ── */}
        {step === 'result' && uploadedImage && resultImage && selectedColor && (
          <div className="animate-fade-in space-y-8">
            {/* Before / After */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Avant / Après</h2>
              <p className="text-sm text-gray-500 mb-5">
                Façade avec la couleur <strong>{selectedColor.fullName}</strong> — {selectedColor.ncs}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Before */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Avant</span>
                  </div>
                  <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100 aspect-[4/3]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={uploadedImage}
                      alt="Façade originale"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                {/* After */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Après</span>
                    <span
                      className="text-xs font-medium px-2.5 py-1 rounded-full text-white"
                      style={{ backgroundColor: selectedColor.hex === '#F0EEE8' ? '#999' : selectedColor.hex }}
                    >
                      {selectedColor.name}
                    </span>
                  </div>
                  <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100 aspect-[4/3] relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={watermarkedImage || resultImage}
                      alt={`Façade avec ${selectedColor.name}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Color info card */}
            <div
              className="rounded-2xl p-5 flex items-center gap-4"
              style={{ backgroundColor: selectedColor.hex === '#F0EEE8' ? '#f5f5f5' : `${selectedColor.hex}22` }}
            >
              <div
                className="w-14 h-14 rounded-xl flex-shrink-0 border-2 border-white shadow"
                style={{ backgroundColor: selectedColor.hex }}
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{selectedColor.fullName}</p>
                <p className="text-sm text-gray-500 font-mono">{selectedColor.ncs}</p>
                <p className="text-sm text-gray-600 mt-1">{selectedColor.reason}</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={handleDownload}
                className="flex items-center justify-center gap-2 bg-gray-900 text-white py-3.5 rounded-xl font-medium hover:bg-gray-800 transition-colors shadow-sm"
              >
                <DownloadIcon />
                Télécharger l&apos;image
              </button>
              <button
                onClick={handlePdf}
                disabled={pdfLoading}
                className="flex items-center justify-center gap-2 bg-gray-900 text-white py-3.5 rounded-xl font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {pdfLoading ? <SpinnerIcon /> : <PdfIcon />}
                {pdfLoading ? 'Génération…' : 'Télécharger le PDF'}
              </button>
              <button
                onClick={() => setEmailModalOpen(true)}
                className="flex items-center justify-center gap-2 border border-gray-200 bg-white text-gray-700 py-3.5 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                <MailIcon />
                Envoyer par email
              </button>
            </div>

            {/* Try other color — only when preset colors were proposed */}
            {colors.length > 0 && (
              <div className="text-center">
                <button
                  onClick={() => {
                    setStep('colors');
                    setResultImage(null);
                    setWatermarkedImage(null);
                    setSelectedColor(null);
                  }}
                  className="text-sm text-gray-500 hover:text-gray-900 underline-offset-2 hover:underline transition-colors"
                >
                  Essayer une autre teinte
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200/60 py-6 text-center">
        <p className="text-xs text-gray-400">
          FaçadeIA • Simulation indicative générée par IA • Les couleurs peuvent varier selon votre écran
        </p>
      </footer>

      {/* Email Modal */}
      {emailModalOpen && selectedColor && (
        <EmailModal
          onClose={() => setEmailModalOpen(false)}
          onSend={handleEmailSend}
          colorName={selectedColor.fullName}
        />
      )}
    </div>
  );
}
