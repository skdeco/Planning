/**
 * Vercel Function : trouve la position du label "Pour le client" sur la
 * dernière page d'un devis PDF (texte → coordonnées).
 *
 * POST /api/find-signature-box  { url: string }
 * Retourne { x, y, pageWidth, pageHeight, page } ou { error: string }.
 *
 * x, y = position du début du label dans le système pdfreader (origine
 * top-left, unités points PDF = 1/72 inch). Le client convertit en
 * coordonnées pdf-lib (bottom-left origin) via :
 *   pdfLibY = pageHeight - y
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

interface PdfItem {
  x?: number;
  y?: number;
  w?: number;
  text?: string;
  page?: number;
}

const LABEL_REGEX = /pour\s*le\s*client/i;

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

    // @ts-ignore
    const { PdfReader } = await import('pdfreader');

    interface PageInfo { width: number; height: number; items: PdfItem[] }
    const result: { pages: Record<number, PageInfo> } = await new Promise((resolve, reject) => {
      const pages: Record<number, PageInfo> = {};
      let currentPage = 0;
      new PdfReader().parseBuffer(buffer, (err: any, item: any) => {
        if (err) return reject(err);
        if (!item) return resolve({ pages });
        if (item.page) {
          currentPage = item.page;
          pages[currentPage] = {
            width: item.width || 595,
            height: item.height || 842,
            items: [],
          };
        } else if (item.text && currentPage > 0) {
          pages[currentPage].items.push(item);
        }
      });
    });

    const pageNums = Object.keys(result.pages).map(Number).sort((a, b) => a - b);
    if (pageNums.length === 0) {
      return res.status(404).json({ error: 'PDF vide ou illisible' });
    }
    const lastPageNum = pageNums[pageNums.length - 1];
    const lastPage = result.pages[lastPageNum];

    // Chercher "Pour le client" sur la dernière page d'abord
    // (cas typique des devis SK DECO).
    let found: { x: number; y: number; page: number; pageWidth: number; pageHeight: number } | null = null;

    const findOnPage = (pageNum: number, pageInfo: PageInfo) => {
      // Stratégie : on regroupe les items par "ligne" (même Y à ±0.5 près)
      // puis on concatène le texte de la ligne pour matcher contre la regex.
      // Cela gère le cas où "Pour le client" est éclaté en plusieurs items.
      const lineGroups: { y: number; items: PdfItem[] }[] = [];
      for (const item of pageInfo.items) {
        const y = item.y ?? 0;
        let g = lineGroups.find(g => Math.abs(g.y - y) < 0.6);
        if (!g) {
          g = { y, items: [] };
          lineGroups.push(g);
        }
        g.items.push(item);
      }
      for (const g of lineGroups) {
        g.items.sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
        const text = g.items.map(it => it.text || '').join('');
        if (LABEL_REGEX.test(text)) {
          const firstItem = g.items[0];
          return {
            x: firstItem.x ?? 0,
            y: firstItem.y ?? 0,
            page: pageNum,
            pageWidth: pageInfo.width,
            pageHeight: pageInfo.height,
          };
        }
      }
      return null;
    };

    // Essai 1 : dernière page (cas standard)
    found = findOnPage(lastPageNum, lastPage);

    // Essai 2 : balayer toutes les pages depuis la dernière vers la première
    if (!found) {
      for (let i = pageNums.length - 2; i >= 0; i--) {
        const p = pageNums[i];
        found = findOnPage(p, result.pages[p]);
        if (found) break;
      }
    }

    if (!found) {
      return res.status(404).json({
        error: 'Label "Pour le client" non trouvé dans le devis',
      });
    }

    return res.status(200).json(found);
  } catch (e: any) {
    console.error('[find-signature-box]', e);
    return res.status(500).json({ error: e?.message || 'Erreur extraction' });
  }
}
