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

// ─── Letterbox : transforme une image en carré (bandes neutres) ─────────────────

/**
 * Place l'image au centre d'un canevas CARRÉ (côté = plus grande dimension),
 * en remplissant le reste de gris neutre. Comme l'entrée envoyée au modèle est
 * déjà carrée, celui-ci ne rogne plus les côtés : le cadrage est préservé.
 * On retire ensuite les bandes avec matchAspect().
 */
export async function padToSquare(imageDataUrl: string): Promise<string> {
  const img = await loadImage(imageDataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const size = Math.max(w, h);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);

  return canvas.toDataURL('image/jpeg', 0.92);
}

// ─── Recadrage au ratio de la photo d'origine ───────────────────────────────────

/**
 * Recadre (centré) l'image résultat pour qu'elle ait le MÊME ratio
 * largeur/hauteur que la photo d'origine. Évite le rendu carré du modèle.
 * Retourne un data URL JPEG.
 */
export async function matchAspect(resultUrl: string, originalUrl: string): Promise<string> {
  const [result, original] = await Promise.all([
    loadImage(resultUrl),
    loadImage(originalUrl),
  ]);

  const ow = original.naturalWidth;
  const oh = original.naturalHeight;
  const targetAspect = ow / oh;
  const rw = result.naturalWidth;
  const rh = result.naturalHeight;
  const currentAspect = rw / rh;

  // Zone source à conserver (recadrage centré au bon ratio)
  let cropW = rw;
  let cropH = rh;
  if (currentAspect > targetAspect) {
    cropW = Math.round(rh * targetAspect); // trop large → on rogne les côtés
  } else {
    cropH = Math.round(rw / targetAspect); // trop haut → on rogne en haut/bas
  }
  const sx = Math.round((rw - cropW) / 2);
  const sy = Math.round((rh - cropH) / 2);

  // Sortie aux dimensions EXACTES de l'original → proportions strictement
  // identiques entre avant et après (pixel pour pixel).
  const canvas = document.createElement('canvas');
  canvas.width = ow;
  canvas.height = oh;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(result, sx, sy, cropW, cropH, 0, 0, ow, oh);

  return canvas.toDataURL('image/jpeg', 0.92);
}

// ─── Extraction de couleur d'une teinte uploadée ────────────────────────────────

/**
 * Extrait la couleur moyenne du centre d'une image de teinte (échantillon).
 * On échantillonne uniquement la zone centrale (50%) pour ignorer
 * les bordures, le texte et les étiquettes éventuelles.
 * Retourne un hex "#RRGGBB".
 */
export async function extractDominantColor(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const size = 60;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, size, size);

  // Zone centrale (25% → 75%)
  const a = Math.floor(size * 0.25);
  const b = Math.floor(size * 0.75);
  const { data } = ctx.getImageData(a, a, b - a, b - a);

  let r = 0, g = 0, bl = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    // Ignore les pixels quasi transparents
    if (data[i + 3] < 200) continue;
    r += data[i];
    g += data[i + 1];
    bl += data[i + 2];
    n++;
  }
  if (n === 0) return '#CCCCCC';

  const toHex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`.toUpperCase();
}

/** Génère une vignette unie (data URL PNG) à partir d'un hex. */
export function makeSolidSwatch(hex: string, size = 256): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  return canvas.toDataURL('image/png');
}

/** Décrit grossièrement une couleur hex en anglais (pour guider l'IA). */
export function hexToColorName(hex: string): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  // Clarté
  const light =
    l < 0.2 ? 'very dark' : l < 0.4 ? 'dark' : l < 0.6 ? 'medium' : l < 0.82 ? 'light' : 'very pale';
  // Saturation
  const sat = s < 0.12 ? 'neutral greyish' : s < 0.3 ? 'soft muted' : s < 0.6 ? '' : 'vivid';

  // Teinte
  let hue: string;
  if (s < 0.08) hue = 'grey';
  else if (h < 15 || h >= 345) hue = 'red';
  else if (h < 45) hue = 'orange';
  else if (h < 65) hue = 'yellow';
  else if (h < 90) hue = 'yellow-green';
  else if (h < 150) hue = 'green';
  else if (h < 190) hue = 'teal';
  else if (h < 215) hue = 'cyan-blue';
  else if (h < 255) hue = 'blue';
  else if (h < 290) hue = 'violet';
  else if (h < 330) hue = 'magenta-pink';
  else hue = 'rose-pink';

  return [light, sat, hue].filter(Boolean).join(' ');
}

// ─── 1. Image watermarkée ───────────────────────────────────────────────────────

/**
 * Compose l'image recolorisée (imageApres) avec le logo Gooweb au centre.
 * - Dimensions natives de imageApres (aucun redimensionnement de la photo)
 * - Logo : largeur = 10% de la largeur, centré, opacité 60%, sans ombre
 * - Export JPEG qualité 0.80
 * Retourne le data URL JPEG.
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

  // Photo en pleine taille
  ctx.drawImage(photo, 0, 0, W, H);

  // Logo : 10% de la largeur, ratio conservé, centré, 60% d'opacité
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
  beforeUrl: string; // photo d'origine (data URL)
  watermarkedAfterUrl: string; // image watermarkée du §1 (data URL JPEG)
  nomCouleur: string; // ex. "R93 Brique Chaud"
};

/** Calcule les dimensions d'affichage en respectant le ratio (fit dans maxW × maxH). */
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
  const M = 12; // marge
  const usableW = PAGE_W - 2 * M; // 186 mm

  // ── En-tête : logo + titre ──
  const logoH = 11;
  const logoW = logoH * (logo.naturalWidth / logo.naturalHeight);
  let y = M;
  doc.addImage(logo, 'PNG', M, y, logoW, logoH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(17, 23, 34); // #111722
  const titleX = M + logoW + 4;
  const titleMaxW = PAGE_W - M - titleX;
  const titleLines = doc.splitTextToSize(
    `Simulation de teinte de façade avec ${nomCouleur}`,
    titleMaxW
  );
  // Centrage vertical du titre par rapport au logo
  const lineH = 6;
  const titleBlockH = titleLines.length * lineH;
  const titleY = y + (logoH - titleBlockH) / 2 + lineH - 1.5;
  doc.text(titleLines, titleX, titleY);

  // Filet sous l'en-tête
  const headerBottom = y + logoH + 4;
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.3);
  doc.line(M, headerBottom, PAGE_W - M, headerBottom);

  // ── Pied de page : on réserve sa zone ──
  const FOOTER_H = 30;
  const footerTop = PAGE_H - M - FOOTER_H;
  doc.line(M, footerTop, PAGE_W - M, footerTop);

  // ── Corps : deux images empilées (AVANT puis APRÈS) ──
  const bodyTop = headerBottom + 5;
  const bodyBottom = footerTop - 4;
  const bodyH = bodyBottom - bodyTop;

  const LABEL_H = 6;
  const GAP = 5;
  // Hauteur max disponible pour chaque image (2 labels + 1 gap retirés, partagé en 2)
  const slotH = (bodyH - 2 * LABEL_H - GAP) / 2;

  doc.setTextColor(90, 90, 90);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');

  // AVANT
  let cursorY = bodyTop;
  doc.text('AVANT', M, cursorY + 4);
  cursorY += LABEL_H;
  const bDim = fitDimensions(beforeImg.naturalWidth, beforeImg.naturalHeight, usableW, slotH);
  doc.addImage(beforeImg, 'JPEG', M + (usableW - bDim.w) / 2, cursorY, bDim.w, bDim.h);
  cursorY += slotH + GAP;

  // APRÈS (image watermarkée)
  doc.text('APRÈS', M, cursorY + 4);
  cursorY += LABEL_H;
  const aDim = fitDimensions(afterImg.naturalWidth, afterImg.naturalHeight, usableW, slotH);
  doc.addImage(afterImg, 'JPEG', M + (usableW - aDim.w) / 2, cursorY, aDim.w, aDim.h);

  // ── Pied de page : texte à gauche, QR à droite ──
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
    'Simulation indicative, la teinte finale peut varier selon l\'éclairage, le support et la finition.',
    footMaxW
  );
  doc.text(disclaimer, M, footTextY + 11);

  doc.save(`gooweb_facade_${fileTimestamp(now)}.pdf`);
}
