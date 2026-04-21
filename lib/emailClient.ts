/**
 * Client email : envoie via l'endpoint Vercel /api/send-email (Resend).
 * Échoue silencieusement pour ne pas bloquer l'UX si Resend est indisponible.
 */
import { Platform } from 'react-native';

const API_BASE = Platform.OS === 'web'
  ? '' // chemin relatif
  : 'https://sk-deco-planning.vercel.app';

export async function envoyerEmail(opts: {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch(`${API_BASE}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: (data as any)?.error || `HTTP ${resp.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erreur réseau' };
  }
}

export function emailFigerSituation(params: {
  chantierNom: string;
  clientPrenom: string;
  numeroSituation: string;
  montantTTC: number;
  lien: string;
}): { subject: string; html: string; text: string } {
  const { chantierNom, clientPrenom, numeroSituation, montantTTC, lien } = params;
  const montantFmt = montantTTC.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  const subject = `SK DECO — Nouveau point financier pour ${chantierNom}`;
  const text = `Bonjour ${clientPrenom},

Un nouveau point financier de situation vient d'être établi pour votre chantier "${chantierNom}".

Référence : ${numeroSituation}
Montant : ${montantFmt} € TTC

Vous pouvez consulter le détail depuis votre espace client :
${lien}

Cordialement,
SK DECO
contact@skdeco.fr`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; color:#2C2C2C; background:#F5EDE3; padding:20px;">
<div style="max-width:560px; margin:0 auto; background:#fff; border-radius:12px; padding:24px;">
  <h1 style="font-size:22px; color:#C9A96E; margin-bottom:4px;">SK DECO</h1>
  <p style="color:#8C8077; font-size:12px; margin-top:0;">Travaux & Décoration</p>
  <hr style="border:none; border-top:2px solid #C9A96E; margin:16px 0;">
  <p style="font-size:14px;">Bonjour ${clientPrenom},</p>
  <p style="font-size:14px;">Un nouveau <strong>point financier de situation</strong> vient d'être établi pour votre chantier :</p>
  <div style="background:#FAF7F3; border-left:4px solid #C9A96E; padding:14px; border-radius:8px; margin:14px 0;">
    <p style="font-size:11px; color:#8C6D2F; font-weight:700; text-transform:uppercase; margin:0;">Chantier</p>
    <p style="font-size:16px; font-weight:800; margin:4px 0 10px 0;">${chantierNom}</p>
    <p style="font-size:11px; color:#8C6D2F; font-weight:700; text-transform:uppercase; margin:0;">Référence</p>
    <p style="font-size:14px; font-weight:700; margin:4px 0 10px 0;">${numeroSituation}</p>
    <p style="font-size:11px; color:#8C6D2F; font-weight:700; text-transform:uppercase; margin:0;">Montant</p>
    <p style="font-size:20px; font-weight:800; color:#8C6D2F; margin:4px 0;">${montantFmt} € TTC</p>
  </div>
  <a href="${lien}" style="display:inline-block; background:#2C2C2C; color:#C9A96E; text-decoration:none; padding:12px 24px; border-radius:10px; font-weight:800; font-size:14px;">Accéder à mon espace client</a>
  <p style="font-size:12px; color:#8C8077; margin-top:24px;">Cordialement,<br>L'équipe SK DECO</p>
</div>
</body></html>`;

  return { subject, html, text };
}
