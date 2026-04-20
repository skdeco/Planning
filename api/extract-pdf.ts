/**
 * Vercel Function : extrait le texte d'un PDF depuis son URL.
 * POST /api/extract-pdf avec body JSON { url: string }
 * Retourne { text: string } ou { error: string }
 *
 * Utilise `pdfreader` et reconstruit les lignes par position Y.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

interface PdfItem {
  x?: number;
  y?: number;
  w?: number;
  text?: string;
  page?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const body = req.body;
    const url = typeof body === 'string' ? JSON.parse(body)?.url : body?.url;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL manquante' });
    }

    const pdfRes = await fetch(url);
    if (!pdfRes.ok) {
      return res.status(400).json({ error: `Téléchargement PDF échoué: ${pdfRes.status}` });
    }
    const arrayBuffer = await pdfRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Collecter tous les items avec leur position
    // @ts-ignore
    const { PdfReader } = await import('pdfreader');
    const items: PdfItem[] = await new Promise((resolve, reject) => {
      const all: PdfItem[] = [];
      let currentPage = 0;
      new PdfReader().parseBuffer(buffer, (err: any, item: any) => {
        if (err) return reject(err);
        if (!item) return resolve(all);
        if (item.page) {
          currentPage = item.page;
        } else if (item.text) {
          all.push({ ...item, page: currentPage });
        }
      });
    });

    // Grouper par page puis par ligne (même Y, tolérance 0.5)
    const pages: Record<number, PdfItem[][]> = {};
    items.forEach(item => {
      const p = item.page || 1;
      if (!pages[p]) pages[p] = [];
      const y = item.y ?? 0;
      // Trouver une ligne existante à la même hauteur
      let line = pages[p].find(l => {
        const ly = l[0]?.y ?? 0;
        return Math.abs(ly - y) < 0.5;
      });
      if (!line) {
        line = [];
        pages[p].push(line);
      }
      line.push(item);
    });

    // Pour chaque page, trier les lignes par Y (haut → bas)
    // et dans chaque ligne, trier les items par X (gauche → droite)
    const lines: string[] = [];
    const sortedPages = Object.keys(pages).map(Number).sort((a, b) => a - b);
    for (const p of sortedPages) {
      const pageLines = pages[p];
      pageLines.sort((a, b) => (a[0]?.y ?? 0) - (b[0]?.y ?? 0));
      for (const line of pageLines) {
        line.sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
        // Concaténer les items d'une ligne avec un espace seulement si les items sont distants
        let lineText = '';
        let lastX = -Infinity;
        let lastW = 0;
        for (const item of line) {
          const x = item.x ?? 0;
          const text = item.text || '';
          const gap = x - (lastX + lastW);
          // Si gap > 0.5, insérer un espace
          if (lineText && gap > 0.5) lineText += ' ';
          lineText += text;
          lastX = x;
          lastW = item.w ?? text.length * 0.5;
        }
        if (lineText.trim()) lines.push(lineText.trim());
      }
      lines.push(''); // saut de ligne entre pages
    }

    const text = lines.join('\n');
    return res.status(200).json({
      text,
      pages: sortedPages.length,
    });
  } catch (e: any) {
    console.error('[extract-pdf]', e);
    return res.status(500).json({ error: e?.message || 'Erreur extraction' });
  }
}
