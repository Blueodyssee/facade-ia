'use client';

import { useState, useRef, useEffect } from 'react';
import {
  createWatermarkedImage,
  generateFacadePDF,
  fileTimestamp,
  shareFacadeImage,
  canShareFiles,
} from './lib/export';

// ─── Types ───────────────────────────────────────────────────────────────────

type Color = {
  id: string;
  name: string;
  fullName: string;
  hex: string;
  reason: string;
};

type AppStep = 'upload' | 'analyzing' | 'colors' | 'recoloring' | 'result';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function compressImage(dataUrl: string, maxPx = 1280, quality = 0.88): Promise<string> {
  return new Promise((resolve, reject) => {
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
    img.onerror = () => reject(new Error('Impossible de lire l\'image'));
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

/** Message d'erreur lisible à partir d'une réponse API. */
async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data?.error && typeof data.error === 'string') return data.error;
    if (data?.message && typeof data.message === 'string') return data.message;
  } catch {
    /* ignore */
  }
  return fallback;
}

// Vignette unie de la couleur cible (2ᵉ image pour l'IA). 128px suffit.
function makeColorSwatch(hex: string, size = 128): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  return canvas.toDataURL('image/png');
}

// Letterbox : transforme la photo en carré avec des bandes grises neutres, et renvoie
// la zone (en fractions 0→1) où se trouve la vraie photo, pour la recadrer après.
function padToSquare(
  dataUrl: string,
  bandColor = '#9aa0a6'
): Promise<{ square: string; region: { x: number; y: number; w: number; h: number } }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      const s = Math.max(w, h);
      const canvas = document.createElement('canvas');
      canvas.width = s;
      canvas.height = s;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = bandColor;
      ctx.fillRect(0, 0, s, s);
      const x = Math.round((s - w) / 2);
      const y = Math.round((s - h) / 2);
      ctx.drawImage(img, x, y, w, h);
      resolve({
        square: canvas.toDataURL('image/jpeg', 0.92),
        region: { x: x / s, y: y / s, w: w / s, h: h / s },
      });
    };
    img.src = dataUrl;
  });
}

// Recadre l'image carrée renvoyée par l'IA sur la zone d'origine (retire les bandes).
function cropToRegion(
  dataUrl: string,
  region: { x: number; y: number; w: number; h: number }
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const W = img.width;
      const H = img.height;
      const sx = Math.round(region.x * W);
      const sy = Math.round(region.y * H);
      const sw = Math.round(region.w * W);
      const sh = Math.round(region.h * H);
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.src = dataUrl;
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

function PdfIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
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

function ColorCard({
  color,
  onSelect,
  disabled,
}: {
  color: Color;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="group text-left rounded-2xl overflow-hidden bg-white shadow-sm border border-gray-100 hover:shadow-lg hover:border-gray-200 hover:-translate-y-1 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none disabled:hover:translate-y-0"
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
        {color.reason && (
          <p className="text-sm text-gray-600 leading-relaxed pt-1 border-t border-gray-50">
            {color.reason}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [step, setStep] = useState<AppStep>('upload');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [colors, setColors] = useState<Color[]>([]);
  const [selectedColor, setSelectedColor] = useState<Color | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [watermarkedImage, setWatermarkedImage] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [dragFacade, setDragFacade] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recolorAbortRef = useRef<AbortController | null>(null);

  // ── Compteur de simulations (chargé au démarrage) ──────────────────────────

  useEffect(() => {
    fetch('/api/counter')
      .then((r) => r.json())
      .then((d) => setRemaining(d.remaining))
      .catch((e) => console.error('Counter load error:', e));
  }, []);

  // Partage natif (WhatsApp etc.) — disponible surtout sur mobile
  useEffect(() => {
    setCanShare(canShareFiles());
  }, []);

  // Cleanup si on quitte la page pendant un recolor
  useEffect(() => {
    return () => {
      recolorAbortRef.current?.abort();
    };
  }, []);

  // ── Photo de façade : lecture + analyse directe ───────────────────────────

  const handleFacadeFile = async (file: File) => {
    if (busy) return;
    if (!file.type.startsWith('image/')) {
      setError('La photo de façade doit être une image (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('Image trop grande (max 20 Mo).');
      return;
    }
    setError(null);
    setBusy(true);
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
      if (!res.ok) {
        throw new Error(await readApiError(res, 'L\'analyse a échoué. Réessayez.'));
      }
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
      const msg = err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'analyse.';
      setError(msg);
      setStep('upload');
      setUploadedImage(null);
    } finally {
      setBusy(false);
    }
  };

  // ── Drag & drop (façade) ───────────────────────────────────────────────────

  const onDropFacade = (e: React.DragEvent) => {
    e.preventDefault();
    setDragFacade(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFacadeFile(file);
  };

  // ── Color selection & recoloring ──────────────────────────────────────────

  const runRecolor = async (
    color: Color,
    image: string,
    onErrorStep: AppStep = 'colors'
  ) => {
    setSelectedColor(color);
    setStep('recoloring');
    setError(null);
    setWatermarkedImage(null);

    // Messages « mode visite » : le façadier peut parler du devis pendant l'attente
    const messages = [
      `Application de ${color.name}…`,
      'Pendant ce temps, vous pouvez parler du devis…',
      'L’IA peaufine le rendu avant/après…',
      'Presque prêt — environ 1 minute au total…',
    ];
    let msgIdx = 0;
    setLoadingMessage(messages[0]);
    const interval = setInterval(() => {
      msgIdx = (msgIdx + 1) % messages.length;
      setLoadingMessage(messages[msgIdx]);
    }, 4500);

    recolorAbortRef.current?.abort();
    const abort = new AbortController();
    recolorAbortRef.current = abort;
    // Timeout client (le modèle premium peut prendre ~1–2 min)
    const timeoutId = setTimeout(() => abort.abort(), 150_000);

    try {
      const swatch = makeColorSwatch(color.hex);
      const { square, region } = await padToSquare(image);

      const res = await fetch('/api/recolor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: square,
          swatch,
          colorId: color.id,
          colorName: color.fullName,
          colorHex: color.hex,
        }),
        signal: abort.signal,
      });

      if (!res.ok) {
        throw new Error(
          await readApiError(res, 'Le recoloriage a échoué. Réessayez.')
        );
      }

      const data = await res.json();
      let finalUrl: string = data.resultUrl;
      try {
        finalUrl = await cropToRegion(data.resultUrl, region);
      } catch (e) {
        console.error('Recadrage post-IA échoué, image conservée telle quelle:', e);
      }
      setResultImage(finalUrl);
      setStep('result');
      return true;
    } catch (err) {
      console.error(err);
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Le recoloriage a pris trop de temps. Réessayez.');
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : 'Erreur lors du recoloriage. Réessayez.';
        setError(msg);
      }
      setStep(onErrorStep);
      setSelectedColor(null);
      return false;
    } finally {
      clearInterval(interval);
      clearTimeout(timeoutId);
    }
  };

  const handleColorSelect = async (color: Color) => {
    if (!uploadedImage || busy) return;

    if (remaining !== null && remaining <= 0) {
      setError('Plus de simulations disponibles pour le moment.');
      return;
    }

    setBusy(true);

    // On réserve une simulation (décrément global).
    try {
      const r = await fetch('/api/counter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decrement' }),
      });
      const d = await r.json();
      setRemaining(d.remaining);
      if (d.blocked) {
        setError('Plus de simulations disponibles pour le moment.');
        setBusy(false);
        return;
      }
    } catch (e) {
      console.error('Counter decrement error:', e);
      // En cas d'erreur du compteur, on laisse passer la simulation.
    }

    const ok = await runRecolor(color, uploadedImage, 'colors');

    if (!ok) {
      try {
        const r = await fetch('/api/counter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'refund' }),
        });
        const d = await r.json();
        setRemaining(d.remaining);
      } catch (e) {
        console.error('Counter refund error:', e);
      }
    }

    setBusy(false);
  };

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

  // ── Partage natif (WhatsApp, Messages, Mail…) ─────────────────────────────

  const handleShare = async () => {
    if (!resultImage || !selectedColor) return;
    setShareLoading(true);
    setShareHint(null);
    setError(null);
    try {
      const watermarked =
        watermarkedImage || (await createWatermarkedImage(resultImage));
      if (!watermarkedImage) setWatermarkedImage(watermarked);

      const outcome = await shareFacadeImage({
        imageDataUrl: watermarked,
        colorName: selectedColor.fullName,
      });

      if (outcome === 'unsupported') {
        setShareHint(
          'Partage non disponible ici. Téléchargez l’image puis envoyez-la via WhatsApp ou mail.'
        );
        handleDownload();
      } else if (outcome === 'shared') {
        setShareHint('Envoyé via le menu de partage de votre téléphone.');
      }
      // cancelled → rien
    } catch (e) {
      console.error('Share error:', e);
      setShareHint(
        'Impossible de partager automatiquement. Téléchargez l’image puis envoyez-la au client.'
      );
    } finally {
      setShareLoading(false);
    }
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

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = () => {
    recolorAbortRef.current?.abort();
    setBusy(false);
    setStep('upload');
    setUploadedImage(null);
    setColors([]);
    setSelectedColor(null);
    setResultImage(null);
    setWatermarkedImage(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** Texte lisible sur fond de teinte claire. */
  const isLightHex = (hex: string) => {
    const m = hex.replace('#', '');
    if (m.length < 6) return true;
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col pb-safe">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#F7F6F3]/80 backdrop-blur-md border-b border-gray-200/60 pt-safe">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-gooweb.png" alt="Gooweb" className="h-7 w-auto flex-shrink-0" />
            <span className="font-semibold text-gray-900 tracking-tight truncate">Gooweb Color</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {remaining !== null && (
              <span
                className={`text-xs font-medium px-2 py-1 sm:px-2.5 rounded-full whitespace-nowrap ${
                  remaining <= 0
                    ? 'bg-red-50 text-red-600'
                    : remaining <= 20
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-gray-100 text-gray-500'
                }`}
                title="Simulations restantes"
              >
                <span className="sm:hidden">{remaining}</span>
                <span className="hidden sm:inline">
                  {remaining} simulation{remaining > 1 ? 's' : ''}
                </span>
              </span>
            )}
            {step !== 'upload' && (
              <button
                type="button"
                onClick={handleReset}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1 min-h-[44px] min-w-[44px] sm:min-w-0 justify-center sm:justify-start px-1"
                aria-label="Recommencer"
              >
                <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="hidden sm:inline">Recommencer</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 md:py-16 space-y-8 md:space-y-10">

        {/* Hero text — only on upload step */}
        {step === 'upload' && (
          <div className="text-center space-y-3 animate-fade-in">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight text-balance">
              Visualisez votre façade<br className="hidden md:block" /> en couleur
            </h1>
            <p className="text-gray-500 text-base md:text-lg max-w-md mx-auto text-balance">
              Uploadez une photo de votre maison et découvrez 10 teintes adaptées à votre façade.
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

        {/* ── STEP: Upload (zone unique) ── */}
        {step === 'upload' && (
          <div
            className={`relative border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer animate-fade-in
              ${dragFacade ? 'border-gray-900 bg-gray-50 scale-[1.01]' : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'}`}
            onDrop={onDropFacade}
            onDragOver={(e) => { e.preventDefault(); setDragFacade(true); }}
            onDragLeave={() => setDragFacade(false)}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFacadeFile(file);
                e.target.value = '';
              }}
            />
            <div className="flex flex-col items-center justify-center py-14 md:py-24 px-6 md:px-8 text-center space-y-4">
              <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center">
                <UploadIcon />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-gray-900 text-lg">
                  {dragFacade ? 'Déposez votre photo ici' : 'Photo de façade'}
                </p>
                <p className="text-gray-400 text-sm">
                  Caméra ou galerie • JPG, PNG, WebP (max 20 Mo)
                </p>
              </div>
              <button
                type="button"
                className="mt-1 bg-gray-900 text-white px-6 py-3 min-h-[44px] rounded-full text-sm font-medium hover:bg-gray-700 transition-colors shadow-sm"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                Prendre / choisir une photo
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
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
                <ColorCardSkeleton />
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
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
                {colors.map((color) => (
                  <ColorCard
                    key={color.id}
                    color={color}
                    disabled={busy}
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
              {/* Barre indéterminée — l'écran « bouge » pendant l'attente */}
              <div className="mt-5 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full w-1/3 bg-gray-900 rounded-full animate-progress-indeterminate" />
              </div>
              <p className="text-xs text-gray-400 mt-4 text-center">
                Environ 1 minute · idéal pour parler du devis avec le client
              </p>
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
                Façade avec la couleur <strong>{selectedColor.fullName}</strong>
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Before */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Avant</span>
                  </div>
                  <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100 aspect-[4/3] bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={uploadedImage}
                      alt="Façade originale"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>

                {/* After */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Après</span>
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        isLightHex(selectedColor.hex) ? 'text-gray-800' : 'text-white'
                      }`}
                      style={{ backgroundColor: selectedColor.hex }}
                    >
                      {selectedColor.name}
                    </span>
                  </div>
                  <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100 aspect-[4/3] relative bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={watermarkedImage || resultImage}
                      alt={`Façade avec ${selectedColor.name}`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Color info card */}
            <div
              className="rounded-2xl p-5 flex items-center gap-4"
              style={{
                backgroundColor: isLightHex(selectedColor.hex)
                  ? '#f5f5f5'
                  : `${selectedColor.hex}22`,
              }}
            >
              <div
                className="w-14 h-14 rounded-xl flex-shrink-0 border-2 border-white shadow"
                style={{ backgroundColor: selectedColor.hex }}
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{selectedColor.fullName}</p>
                <p className="text-sm text-gray-600 mt-1">{selectedColor.reason}</p>
              </div>
            </div>

            {/* Actions terrain : envoyer d'abord, puis téléchargements */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleShare}
                disabled={shareLoading}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-3.5 min-h-[48px] rounded-xl font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {shareLoading ? <SpinnerIcon /> : <ShareIcon />}
                {shareLoading
                  ? 'Préparation…'
                  : canShare
                    ? 'Envoyer au client'
                    : 'Envoyer au client (partage)'}
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center justify-center gap-2 bg-white text-gray-900 border border-gray-200 py-3.5 min-h-[48px] rounded-xl font-medium hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <DownloadIcon />
                  Télécharger l&apos;image
                </button>
                <button
                  type="button"
                  onClick={handlePdf}
                  disabled={pdfLoading}
                  className="flex items-center justify-center gap-2 bg-white text-gray-900 border border-gray-200 py-3.5 min-h-[48px] rounded-xl font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {pdfLoading ? <SpinnerIcon /> : <PdfIcon />}
                  {pdfLoading ? 'Génération…' : 'Télécharger le PDF'}
                </button>
              </div>

              {shareHint && (
                <p className="text-sm text-gray-600 text-center bg-white border border-gray-100 rounded-xl px-3 py-2">
                  {shareHint}
                </p>
              )}

              <p className="text-xs text-gray-400 text-center leading-relaxed">
                Montrez ce rendu au client, puis envoyez-le pour qu’il le garde.
                Simulation indicative.
              </p>
            </div>

            {/* Try other color — only when preset colors were proposed */}
            {colors.length > 0 && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setStep('colors');
                    setResultImage(null);
                    setWatermarkedImage(null);
                    setSelectedColor(null);
                    setShareHint(null);
                  }}
                  className="inline-flex items-center gap-2 text-base font-semibold text-blue-600 hover:text-blue-700 hover:underline underline-offset-4 transition-colors min-h-[44px]"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
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
          Gooweb Color • Simulation indicative générée par IA • Les couleurs peuvent varier selon votre écran
        </p>
      </footer>
    </div>
  );
}
