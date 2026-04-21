/**
 * Vercel Function : envoie un email via Resend.
 * POST /api/send-email avec body { to, subject, text, html? }
 * Nécessite env RESEND_API_KEY (gratuit sur resend.com jusqu'à 100/j).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEFAULT_FROM = process.env.RESEND_FROM || 'SK DECO <contact@skdeco.fr>';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY manquante. Configurez la clé dans les variables d\'environnement Vercel.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { to, subject, text, html, from } = body || {};
    if (!to || !subject || (!text && !html)) {
      return res.status(400).json({ error: 'Champs requis : to, subject, text ou html' });
    }
    const payload = {
      from: from || DEFAULT_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      text: text || undefined,
      html: html || undefined,
    };
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(resp.status).json({ error: (data as any)?.message || 'Envoi échoué', details: data });
    }
    return res.status(200).json({ ok: true, id: (data as any)?.id });
  } catch (e: any) {
    console.error('[send-email]', e);
    return res.status(500).json({ error: e?.message || 'Erreur envoi email' });
  }
}
