'use client';

import { useState, useCallback, useRef } from 'react';

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
  const [colors, setColors] = useState<Color[]>([]);
  const [selectedColor, setSelectedColor] = useState<Color | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Image upload handler ──────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Veuillez sélectionner une image (JPG, PNG, WebP).');
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
      setStep('analyzing');
      setLoadingMessage('Analyse de votre façade en cours…');

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: compressed }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      if (!data.isValidFacade) {
        setError("Cette image ne semble pas être une façade de bâtiment. Veuillez en uploader une autre.");
        setStep('upload');
        setUploadedImage(null);
        return;
      }

      setColors(data.colors);
      setStep('colors');
    } catch (err) {
      console.error(err);
      setError('Une erreur est survenue lors de l\'analyse. Vérifiez votre clé ANTHROPIC_API_KEY.');
      setStep('upload');
      setUploadedImage(null);
    }
  }, []);

  // ── Drag & drop ───────────────────────────────────────────────────────────

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  // ── Color selection & recoloring ──────────────────────────────────────────

  const handleColorSelect = async (color: Color) => {
    if (!uploadedImage) return;
    setSelectedColor(color);
    setStep('recoloring');
    setError(null);

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
          image: uploadedImage,
          colorName: color.fullName,
          colorHex: color.hex,
          colorPrompt: color.recolorPrompt,
        }),
      });

      clearInterval(interval);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Recoloring failed');
      }

      const data = await res.json();
      setResultImage(data.resultUrl);
      setStep('result');
    } catch (err) {
      clearInterval(interval);
      console.error(err);
      setError('Erreur lors du recoloriage. Vérifiez votre clé REPLICATE_API_TOKEN.');
      setStep('colors');
      setSelectedColor(null);
    }
  };

  // ── Download ──────────────────────────────────────────────────────────────

  const handleDownload = () => {
    if (!resultImage) return;
    const a = document.createElement('a');
    a.href = resultImage;
    a.download = `facade-${selectedColor?.id || 'simulation'}.jpg`;
    a.click();
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
          resultImageUrl: resultImage,
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
    setColors([]);
    setSelectedColor(null);
    setResultImage(null);
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
            <p className="text-gray-500 text-base md:text-lg max-w-md mx-auto text-balance">
              Uploadez une photo de votre maison et découvrez 2 teintes sélectionnées par l&apos;IA pour votre façade.
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

        {/* ── STEP: Upload ── */}
        {step === 'upload' && (
          <div
            className={`relative border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer
              ${isDragging ? 'border-gray-900 bg-gray-50 scale-[1.01]' : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <div className="flex flex-col items-center justify-center py-16 md:py-24 px-8 text-center space-y-4">
              <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center">
                <UploadIcon />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-gray-900 text-lg">
                  {isDragging ? 'Déposez votre photo ici' : 'Uploader une photo de façade'}
                </p>
                <p className="text-gray-400 text-sm">Glissez-déposez ou cliquez pour choisir • JPG, PNG, WebP (max 20 Mo)</p>
              </div>
              <button
                className="mt-2 bg-gray-900 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-700 transition-colors shadow-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Choisir une photo
              </button>
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
                  <p className="text-xs text-gray-400 mt-0.5">Choisissez une couleur ci-dessous pour voir le rendu</p>
                </div>
              </div>
            )}

            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">2 couleurs recommandées</h2>
              <p className="text-sm text-gray-500 mb-6">Sélectionnez une couleur pour simuler le rendu sur votre façade</p>
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
                      src={resultImage}
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
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-900 text-white py-3.5 rounded-xl font-medium hover:bg-gray-800 transition-colors shadow-sm"
              >
                <DownloadIcon />
                Télécharger la simulation
              </button>
              <button
                onClick={() => setEmailModalOpen(true)}
                className="flex-1 flex items-center justify-center gap-2 border border-gray-200 bg-white text-gray-700 py-3.5 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                <MailIcon />
                Envoyer par email
              </button>
            </div>

            {/* Try other color */}
            <div className="text-center">
              <button
                onClick={() => {
                  setStep('colors');
                  setResultImage(null);
                  setSelectedColor(null);
                }}
                className="text-sm text-gray-500 hover:text-gray-900 underline-offset-2 hover:underline transition-colors"
              >
                Essayer l&apos;autre couleur
              </button>
            </div>
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
