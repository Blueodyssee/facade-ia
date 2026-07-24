// Utilitaires d'export : watermark image + génération PDF avant/après.
// 100% côté navigateur (canvas, jsPDF, qrcode).

const LOGO_SRC = '/logo-gooweb.png';
const QR_TARGET = 'https://gooweb.biz';

// ─── Horodatage ───────────────────────────────────────────────────────────────

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Format fichier : YYYY-MM-DD_HHMM (heure locale) */
export function fileTimestamp(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Format lisible : JJ/MM/AAAA à HHhMM */
function humanTimestamp(d = new Date()): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} à ${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

// ─── Chargement d'image ─────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Impossible de charger l'image : ${src}`));
    img.src = src;
  });
}

// ─── 1. Image watermarkée ───────────────────────────────────────────────────────

/**
 * Compose l'image recolorisée (imageApres) avec le logo Gooweb au centre.
 * - Dimensions natives de imageApres
 * - Logo : largeur = 10% de la largeur, centré, opacité 60%
 * - Export JPEG qualité 0.80
 */
export async function createWatermarkedImage(afterDataUrl: string): Promise<string> {
  const [photo, logo] = await Promise.all([
    loadImage(afterDataUrl),
    loadImage(LOGO_SRC),
  ]);

  const W = photo.naturalWidth;
  const H = photo.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(photo, 0, 0, W, H);

  const lw = W * 0.1;
  const lh = lw * (logo.naturalHeight / logo.naturalWidth);
  const lx = (W - lw) / 2;
  const ly = (H - lh) / 2;

  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.drawImage(logo, lx, ly, lw, lh);
  ctx.restore();

  return canvas.toDataURL('image/jpeg', 0.8);
}

// ─── Partage mobile (Web Share API) ─────────────────────────────────────────────

/** Convertit une data-URL en File (pour navigator.share). */
export async function dataUrlToFile(
  dataUrl: string,
  filename: string,
  mimeFallback = 'image/jpeg'
): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const type = blob.type || mimeFallback;
  return new File([blob], filename, { type });
}

/** true si le navigateur peut partager des fichiers (typ. mobile). */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false;
  }
  // canShare n'existe pas partout ; on tente les files si share existe
  try {
    if (typeof navigator.canShare === 'function') {
      const probe = new File([new Blob(['x'], { type: 'image/jpeg' })], 't.jpg', {
        type: 'image/jpeg',
      });
      return navigator.canShare({ files: [probe] });
    }
  } catch {
    /* ignore */
  }
  // iOS Safari : share existe, canShare parfois absent → on tente au moment du share
  return true;
}

/**
 * Partage l'image watermarkée via le menu système (WhatsApp, Messages, Mail…).
 * Retourne : 'shared' | 'cancelled' | 'unsupported'
 */
export async function shareFacadeImage(opts: {
  imageDataUrl: string;
  colorName: string;
}): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return 'unsupported';
  }

  const filename = `gooweb_facade_${fileTimestamp()}.jpg`;
  const file = await dataUrlToFile(opts.imageDataUrl, filename, 'image/jpeg');
  const title = `Simulation façade — ${opts.colorName}`;
  const text = `Simulation de teinte de façade : ${opts.colorName} · Gooweb Color · rendu indicatif`;

  const payloadWithFiles: ShareData = { files: [file], title, text };
  const payloadTextOnly: ShareData = { title, text };

  try {
    if (typeof navigator.canShare === 'function' && navigator.canShare(payloadWithFiles)) {
      await navigator.share(payloadWithFiles);
      return 'shared';
    }
    // Tenter quand même avec fichiers (certains navigateurs sans canShare)
    try {
      await navigator.share(payloadWithFiles);
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Repli texte seul (rare) — l'utilisateur pourra joindre manuellement
      await navigator.share(payloadTextOnly);
      return 'shared';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}

// ─── 2. QR code ─────────────────────────────────────────────────────────────────

async function createQrDataUrl(): Promise<string> {
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(QR_TARGET, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
    color: { dark: '#111722', light: '#FFFFFF' },
  });
}

// ─── 3. PDF avant / après ───────────────────────────────────────────────────────

type PdfInput = {
  beforeUrl: string;
  watermarkedAfterUrl: string;
  nomCouleur: string;
};

function fitDimensions(natW: number, natH: number, maxW: number, maxH: number) {
  const scale = Math.min(maxW / natW, maxH / natH);
  return { w: natW * scale, h: natH * scale };
}

export async function generateFacadePDF({
  beforeUrl,
  watermarkedAfterUrl,
  nomCouleur,
}: PdfInput): Promise<void> {
  const { jsPDF } = await import('jspdf');

  const [beforeImg, afterImg, logo, qrDataUrl] = await Promise.all([
    loadImage(beforeUrl),
    loadImage(watermarkedAfterUrl),
    loadImage(LOGO_SRC),
    createQrDataUrl(),
  ]);

  const now = new Date();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const PAGE_W = 210;
  const PAGE_H = 297;
  const M = 12;
  const usableW = PAGE_W - 2 * M;

  const logoH = 11;
  const logoW = logoH * (logo.naturalWidth / logo.naturalHeight);
  let y = M;
  doc.addImage(logo, 'PNG', M, y, logoW, logoH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(17, 23, 34);
  const titleX = M + logoW + 4;
  const titleMaxW = PAGE_W - M - titleX;
  const titleLines = doc.splitTextToSize(
    `Simulation de teinte de façade avec ${nomCouleur}`,
    titleMaxW
  );
  const lineH = 6;
  const titleBlockH = titleLines.length * lineH;
  const titleY = y + (logoH - titleBlockH) / 2 + lineH - 1.5;
  doc.text(titleLines, titleX, titleY);

  const headerBottom = y + logoH + 4;
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.3);
  doc.line(M, headerBottom, PAGE_W - M, headerBottom);

  const FOOTER_H = 30;
  const footerTop = PAGE_H - M - FOOTER_H;
  doc.line(M, footerTop, PAGE_W - M, footerTop);

  const bodyTop = headerBottom + 5;
  const bodyBottom = footerTop - 4;
  const bodyH = bodyBottom - bodyTop;

  const LABEL_H = 6;
  const GAP = 5;
  const slotH = (bodyH - 2 * LABEL_H - GAP) / 2;

  doc.setTextColor(90, 90, 90);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');

  let cursorY = bodyTop;
  doc.text('AVANT', M, cursorY + 4);
  cursorY += LABEL_H;
  const bDim = fitDimensions(beforeImg.naturalWidth, beforeImg.naturalHeight, usableW, slotH);
  doc.addImage(beforeImg, 'JPEG', M + (usableW - bDim.w) / 2, cursorY, bDim.w, bDim.h);
  cursorY += slotH + GAP;

  doc.text('APRÈS', M, cursorY + 4);
  cursorY += LABEL_H;
  const aDim = fitDimensions(afterImg.naturalWidth, afterImg.naturalHeight, usableW, slotH);
  doc.addImage(afterImg, 'JPEG', M + (usableW - aDim.w) / 2, cursorY, aDim.w, aDim.h);

  const qrSize = 22;
  const qrX = PAGE_W - M - qrSize;
  const qrY = footerTop + 3;
  doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text('gooweb.biz', qrX + qrSize / 2, qrY + qrSize + 3, { align: 'center' });

  const footTextY = footerTop + 6;
  const footMaxW = qrX - M - 4;
  doc.setFontSize(8.5);
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'bold');
  doc.text('Gooweb – 06 69 95 18 13 – contact@gooweb.biz – gooweb.biz', M, footTextY, {
    maxWidth: footMaxW,
  });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90, 90, 90);
  doc.setFontSize(8);
  doc.text(`Simulation réalisée le ${humanTimestamp(now)}`, M, footTextY + 6, {
    maxWidth: footMaxW,
  });
  const disclaimer = doc.splitTextToSize(
    "Simulation indicative, la teinte finale peut varier selon l'éclairage, le support et la finition.",
    footMaxW
  );
  doc.text(disclaimer, M, footTextY + 11);

  doc.save(`gooweb_facade_${fileTimestamp(now)}.pdf`);
}
