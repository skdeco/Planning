import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import { COOKIE_NAME } from "../shared/const.js";

interface NotifyMaterielBody {
  acheteurs?: string[];
  employeNom: string;
  chantierNom: string;
  articles: string[];
}

/** Échappe les caractères HTML dangereux pour éviter l'injection XSS dans les emails */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Envoie un email aux acheteurs via Resend lorsqu'un employé ajoute des articles.
 * Destinataires fixes : shai@skdeco.fr et kevin@skdeco.fr
 */
async function sendMaterielEmail(body: NotifyMaterielBody): Promise<boolean> {
  if (!ENV.resendApiKey) {
    console.warn("[Materiel] RESEND_API_KEY non configuré, email non envoyé");
    return false;
  }

  const { employeNom, chantierNom, articles } = body;
  const safeEmployeNom = escapeHtml(employeNom);
  const safeChantierNom = escapeHtml(chantierNom);
  const articlesList = articles.map(a => `<li>${escapeHtml(a)}</li>`).join("");

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1A3A6B; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">🛒 Nouvelle liste matériel — SK DECO Planning</h2>
      </div>
      <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0;">
        <p><strong>${safeEmployeNom}</strong> a ajouté des articles pour le chantier <strong>${safeChantierNom}</strong> :</p>
        <ul style="background: white; padding: 15px 30px; border-radius: 6px; border: 1px solid #e0e0e0;">
          ${articlesList}
        </ul>
        <p style="color: #666; font-size: 13px; margin-top: 20px;">
          Connectez-vous à SK DECO Planning pour valider les achats.
        </p>
        <a href="https://sk-deco-planning.vercel.app" 
           style="display: inline-block; background: #1A3A6B; color: white; padding: 10px 20px; 
                  border-radius: 6px; text-decoration: none; margin-top: 10px;">
          Voir la liste matériel
        </a>
      </div>
    </div>
  `;

  const textContent = `${employeNom} a ajouté des articles pour ${chantierNom} :\n${articles.map(a => `- ${a}`).join("\n")}\n\nConnectez-vous sur https://sk-deco-planning.vercel.app`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SK DECO Planning <notifications@skdeco.fr>",
        to: ["shai@skdeco.fr", "kevin@skdeco.fr"],
        subject: `🛒 Nouveau matériel à acheter — ${chantierNom}`,
        html: htmlContent,
        text: textContent,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[Materiel] Erreur Resend (${response.status}): ${detail}`);
      return false;
    }

    console.log(`[Materiel] Email envoyé pour ${chantierNom} par ${employeNom}`);
    return true;
  } catch (error) {
    console.warn("[Materiel] Erreur lors de l'envoi email:", error);
    return false;
  }
}

export function registerMaterielNotificationRoute(app: Express) {
  app.post("/api/notify-materiel", async (req: Request, res: Response) => {
    // Vérification d'authentification basique (cookie de session requis)
    const cookies = req.headers.cookie || '';
    if (!cookies.includes(COOKIE_NAME)) {
      res.status(401).json({ error: "Non authentifié" });
      return;
    }

    const body = req.body as NotifyMaterielBody;

    // Validation des entrées
    if (!body.employeNom || typeof body.employeNom !== 'string' ||
        !body.chantierNom || typeof body.chantierNom !== 'string' ||
        !Array.isArray(body.articles) || body.articles.length === 0 ||
        body.articles.length > 100 ||
        !body.articles.every(a => typeof a === 'string' && a.length < 500)) {
      res.status(400).json({ error: "Paramètres invalides" });
      return;
    }

    const success = await sendMaterielEmail(body);
    res.json({ success });
  });
}
