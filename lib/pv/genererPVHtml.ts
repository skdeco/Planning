import type {
  Chantier,
  Apporteur,
  MarcheChantier,
  SupplementMarche,
} from '@/app/types';
import type { PVReception } from '@/app/types';
import {
  calculPaiementChantier,
  formatEUR,
} from '@/lib/pv/calculPaiementChantier';

/**
 * Coordonnées légales de SK DECO affichées dans la carte "Entreprise"
 * du PV de réception.
 *
 * TODO : à terme, déplacer dans un écran "Paramètres de l'entreprise"
 * pour qu'un futur compte multi-tenant puisse personnaliser ces infos.
 * Pour l'instant, hardcodé car mono-entreprise.
 */
const SK_DECO_INFO = {
  raisonSociale: 'SK DECO',
  qualite: "Entreprise Tous Corps d'État",
  rue: '34 rue du Commandant Mouchotte',
  codePostal: '94160',
  ville: 'Saint-Mandé',
  siret: '813 532 876 00022',
  telephone: '07 63 62 84 10',
  email: 'contact@skdeco.fr',
} as const;

/**
 * Génère le HTML complet du PV de réception pour conversion en PDF
 * via expo-print.
 *
 * Design "Studio architecture chic" — palette bordeaux/aubergine SK DECO :
 *  - Primary  #5C1F2E (bordeaux profond)
 *  - Cream    #FBF7F2 (fond doux)
 *  - Ink      #1A1A1A (texte principal)
 *  - Muted    #6B7280 (texte secondaire)
 *  - Rule     #D8CFC4 (filets fins)
 *  - Danger   #B91C1C (réserves à traiter)
 *
 * Structure :
 *  - Page 1 (cover) : page de garde premium pleine page
 *  - Page 2+ : sections numérotées 01/02/03/04 + header/footer @page
 *
 * ⚠️ Toutes les images doivent être passées en data URI (base64) :
 * - logoDataUri : logo SK DECO (chargé via expo-asset)
 * - signatures : déjà en data URI dans pv (Plan D — DETTE-PV-DATAURI-001)
 * - photosResolved : map URL Supabase → data URI (pré-fetché par genererPVPdf)
 *   Une URL absente = photo cassée → placeholder ⚠️ affiché
 *
 * Pas de réseau dans cette fonction : 100% pur.
 *
 * Règles de pagination (validées sur stress test 15 pièces / 19 réserves) :
 *  - Body : orphans/widows 2 globaux
 *  - Titres h2/h3 : page-break-after avoid
 *  - Header de pièce, sous-titres groupes : page-break-after avoid
 *  - Réserve : page-break-inside avoid STRICT (jamais coupée)
 *  - Photos block : page-break-inside avoid
 *  - Récap chiffré : page-break-inside avoid (juridique)
 *  - Signatures : page-break-inside avoid (juridique)
 *  - Footer mention : page-break-inside avoid
 */

export interface GenererPVHtmlParams {
  pv: PVReception;
  chantier: Chantier;
  apporteurs: Apporteur[];
  marchesChantier: MarcheChantier[];
  supplementsMarche: SupplementMarche[];
  logoDataUri: string;
  /** Map URL Supabase → data URI base64. URL absente = photo cassée. */
  photosResolved: Record<string, string>;
}

/* ────────────────────────────────────────────────────────────────────
 * Helpers de formatage
 * ──────────────────────────────────────────────────────────────────── */

function escapeHtml(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateFR(iso: string | undefined): string {
  if (!iso) return '—';
  const ymd = iso.includes('T') ? iso.split('T')[0] : iso;
  const parts = ymd.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function formatDateLong(iso: string | undefined): string {
  if (!iso) return '—';
  const ymd = iso.includes('T') ? iso.split('T')[0] : iso;
  const parts = ymd.split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  const mIdx = parseInt(m, 10) - 1;
  if (mIdx < 0 || mIdx > 11) return iso;
  return `${parseInt(d, 10)} ${MOIS_FR[mIdx]} ${y}`;
}

function formatDateTimeFR(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatAdresseLignes(chantier: Chantier): string {
  const ligne1 = (chantier.rue || '').trim();
  const ligne2Parts = [chantier.codePostal, chantier.ville].filter(Boolean);
  const ligne2 = ligne2Parts.join(' ').trim();

  // Cas idéal : nouvelle structure rue + CP + ville
  if (ligne1 || ligne2) {
    const ligne3 = chantier.pays && chantier.pays !== 'France' ? chantier.pays : '';
    return [ligne1, ligne2, ligne3].filter(Boolean).map(escapeHtml).join('<br/>');
  }

  // Fallback legacy : on accepte chantier.adresse seulement si elle ressemble
  // à une vraie adresse (contient au moins un chiffre = numéro de rue ou CP)
  const legacy = (chantier.adresse || '').trim();
  if (legacy && legacy !== '—' && /\d/.test(legacy)) {
    return escapeHtml(legacy);
  }

  // Aucune adresse exploitable : retourne chaîne vide → le rendu masque le bloc
  return '';
}

/* ────────────────────────────────────────────────────────────────────
 * Page de garde (cover) — pleine page A4
 * ──────────────────────────────────────────────────────────────────── */

function renderCover(
  pv: PVReception,
  chantier: Chantier,
  apporteurs: Apporteur[],
  logoDataUri: string,
): string {
  const numero = escapeHtml(pv.numeroPV || '—');
  const dateLongue = formatDateLong(pv.dateReception);
  const nomChantier = escapeHtml(chantier.nom);
  const adresse = formatAdresseLignes(chantier);

  const parties = buildPartiesCards(chantier, apporteurs);
  const partiesCssClass = parties.count === 3 ? 'cover-parties cover-parties-three' : 'cover-parties cover-parties-two';

  return `
<div class="cover">
  <div class="cover-band"></div>
  <div class="cover-content">
    <div class="cover-top">
      <div class="cover-logo">
        ${logoDataUri
          ? `<img src="${logoDataUri}" alt="SK DECO"/>`
          : '<div class="cover-logo-fallback">SK DECO</div>'
        }
      </div>
      <div class="cover-eyebrow">Document officiel</div>
      <h1 class="cover-title">Procès-verbal<br/>de réception</h1>
      <div class="cover-divider"></div>
      <div class="cover-chantier">
        <div class="cover-label">Chantier</div>
        <div class="cover-chantier-nom">${nomChantier}</div>
        ${adresse ? `<div class="cover-chantier-adresse">${adresse}</div>` : ''}
      </div>
    </div>

    <div class="cover-parties-wrapper">
      <div class="${partiesCssClass}">
        ${parties.html}
      </div>
    </div>

    <div class="cover-bottom">
      <div class="cover-meta">
        <div class="cover-meta-block">
          <div class="cover-meta-label">Référence</div>
          <div class="cover-meta-value">${numero}</div>
        </div>
        <div class="cover-meta-divider"></div>
        <div class="cover-meta-block">
          <div class="cover-meta-label">Date de réception</div>
          <div class="cover-meta-value">${dateLongue}</div>
        </div>
      </div>
      <div class="cover-footer">SK DECO — Aménagement &amp; Décoration d'intérieur</div>
    </div>
  </div>
</div>
`;
}

/* ────────────────────────────────────────────────────────────────────
 * Section 01 — Parties
 * ──────────────────────────────────────────────────────────────────── */

function renderSectionHeader(num: string, title: string): string {
  return `
    <div class="section-header">
      <span class="section-num">${num}</span>
      <h2 class="section-title">${title}</h2>
      <span class="section-rule"></span>
    </div>
  `;
}

/**
 * Construit les 3 cards parties (Entreprise / Client / Architecte si présent).
 * Utilisé sur la page de garde (tiers inférieur).
 */
function buildPartiesCards(
  chantier: Chantier,
  apporteurs: Apporteur[],
): { html: string; count: number } {
  const entrepriseHtml = `
    <div class="partie">
      <div class="partie-role">Entreprise titulaire</div>
      <div class="partie-nom">${escapeHtml(SK_DECO_INFO.raisonSociale)}</div>
      <div class="partie-info partie-info-strong">${escapeHtml(SK_DECO_INFO.qualite)}</div>
      <div class="partie-info">${escapeHtml(SK_DECO_INFO.rue)}<br/>${escapeHtml(SK_DECO_INFO.codePostal)} ${escapeHtml(SK_DECO_INFO.ville)}</div>
      <div class="partie-info partie-info-meta">SIRET : ${escapeHtml(SK_DECO_INFO.siret)}</div>
      <div class="partie-info partie-info-meta">${escapeHtml(SK_DECO_INFO.telephone)}<br/>${escapeHtml(SK_DECO_INFO.email)}</div>
    </div>
  `;

  // Client (Apporteur lié, sinon legacy texte)
  const clientApp = chantier.clientApporteurId
    ? apporteurs.find(a => a.id === chantier.clientApporteurId)
    : undefined;

  let clientHtml = '';
  if (clientApp) {
    const nom = escapeHtml(`${clientApp.prenom} ${clientApp.nom}`.trim());
    const societe = clientApp.societe
      ? `<div class="partie-info">${escapeHtml(clientApp.societe)}</div>`
      : '';
    const adresse = clientApp.adresse
      ? `<div class="partie-info">${escapeHtml(clientApp.adresse)}</div>`
      : '';
    const tel = clientApp.telephone
      ? `<div class="partie-info partie-info-meta">${escapeHtml(clientApp.telephone)}</div>`
      : '';
    const email = clientApp.email
      ? `<div class="partie-info partie-info-meta">${escapeHtml(clientApp.email)}</div>`
      : '';
    clientHtml = `
      <div class="partie">
        <div class="partie-role">Maître d'ouvrage / Client</div>
        <div class="partie-nom">${nom}</div>
        ${societe}
        ${adresse}
        ${tel}
        ${email}
      </div>
    `;
  } else if (chantier.client) {
    clientHtml = `
      <div class="partie">
        <div class="partie-role">Maître d'ouvrage / Client</div>
        <div class="partie-nom">${escapeHtml(chantier.client)}</div>
      </div>
    `;
  } else {
    clientHtml = `
      <div class="partie">
        <div class="partie-role">Maître d'ouvrage / Client</div>
        <div class="partie-nom">—</div>
        <div class="partie-info">À renseigner</div>
      </div>
    `;
  }

  // Architecte (optionnel)
  const architecte = chantier.architecteId
    ? apporteurs.find(a => a.id === chantier.architecteId)
    : undefined;
  let architecteHtml = '';
  let count = 2;
  if (architecte) {
    count = 3;
    const nom = escapeHtml(`${architecte.prenom} ${architecte.nom}`.trim());
    const societe = architecte.societe
      ? `<div class="partie-info">${escapeHtml(architecte.societe)}</div>`
      : '';
    architecteHtml = `
      <div class="partie">
        <div class="partie-role">Architecte / Maître d'œuvre</div>
        <div class="partie-nom">${nom}</div>
        ${societe}
      </div>
    `;
  }

  const html = `${entrepriseHtml}${clientHtml}${architecteHtml}`;
  return { html, count };
}

/* ────────────────────────────────────────────────────────────────────
 * Section 02 — Pièces & réserves
 * ──────────────────────────────────────────────────────────────────── */

function renderPhotoThumb(
  url: string,
  photosResolved: Record<string, string>,
): string {
  const dataUri = photosResolved[url];
  if (dataUri) {
    return `<div class="photo-thumb"><img src="${dataUri}" alt="photo"/></div>`;
  }
  return `<div class="photo-thumb photo-thumb-broken"><span class="photo-broken-icon">⚠</span></div>`;
}

function renderReserves(
  reserves: Array<{
    id: string;
    description: string;
    lotDevisNomSnapshot?: string;
    categorieLibre?: string;
    photos?: string[];
    levee?: { le: string; photos?: string[]; commentaire?: string };
  }>,
  photosResolved: Record<string, string>,
  isLevee: boolean,
): string {
  if (reserves.length === 0) return '';

  return reserves.map(r => {
    const cat = r.lotDevisNomSnapshot || r.categorieLibre;
    const catHtml = cat ? `<div class="reserve-cat">${escapeHtml(cat)}</div>` : '';

    const photosConstat = (r.photos && r.photos.length > 0)
      ? `<div class="photos-block">
          <div class="photos-label">Constat — ${r.photos.length} photo${r.photos.length > 1 ? 's' : ''}</div>
          <div class="photos-grid">
            ${r.photos.map(url => renderPhotoThumb(url, photosResolved)).join('')}
          </div>
        </div>`
      : '';

    const photosLevee = (isLevee && r.levee && r.levee.photos && r.levee.photos.length > 0)
      ? `<div class="photos-block">
          <div class="photos-label">Levée — ${r.levee.photos.length} photo${r.levee.photos.length > 1 ? 's' : ''}</div>
          <div class="photos-grid">
            ${r.levee.photos.map(url => renderPhotoThumb(url, photosResolved)).join('')}
          </div>
        </div>`
      : '';

    const leveeMeta = (isLevee && r.levee)
      ? `<div class="reserve-levee-meta">Levée le ${formatDateFR(r.levee.le)}</div>`
      : '';

    // Règle V6 stricte : on ne coupe JAMAIS une réserve (même avec beaucoup
    // de photos). Si une réserve trop grosse ne tient pas sur la page,
    // le navigateur la poussera vers la suivante et acceptera la coupure
    // uniquement si elle dépasse la hauteur d'une page entière (cas rare).
    return `
      <div class="reserve ${isLevee ? 'reserve-levee' : 'reserve-pending'}">
        <div class="reserve-desc ${isLevee ? 'reserve-desc-levee' : ''}">${escapeHtml(r.description)}</div>
        ${catHtml}
        ${leveeMeta}
        ${photosConstat}
        ${photosLevee}
      </div>
    `;
  }).join('');
}

function renderPieces(
  pv: PVReception,
  photosResolved: Record<string, string>,
): string {
  const pieces = pv.pieces || [];

  if (pieces.length === 0) {
    return `
<section class="section">
  <div class="section-intro">
    ${renderSectionHeader('01', 'Pièces &amp; réserves')}
    <div class="empty">Aucune pièce dans ce PV.</div>
  </div>
</section>
`;
  }

  // Comptes globaux
  let totalATraiter = 0;
  let totalLevees = 0;
  pieces.forEach(p => {
    (p.reserves || []).forEach(r => {
      if (r.levee) totalLevees++;
      else totalATraiter++;
    });
  });

  // Synthèse — tags élégants
  const tagsHtml: string[] = [];
  tagsHtml.push(`<span class="synthese-tag">${pieces.length} pièce${pieces.length > 1 ? 's' : ''}</span>`);
  if (totalATraiter > 0) {
    tagsHtml.push(`<span class="synthese-tag tag-pending">${totalATraiter} réserve${totalATraiter > 1 ? 's' : ''} à traiter</span>`);
  }
  if (totalLevees > 0) {
    tagsHtml.push(`<span class="synthese-tag tag-success">${totalLevees} levée${totalLevees > 1 ? 's' : ''}</span>`);
  }
  if (totalATraiter === 0 && totalLevees === 0) {
    tagsHtml.push(`<span class="synthese-tag tag-success">Aucune réserve</span>`);
  }
  const synthese = `<div class="synthese">${tagsHtml.join('')}</div>`;

  // Pièces
  const piecesHtml = pieces.map(piece => {
    const reserves = piece.reserves || [];
    const reservesPending = reserves.filter(r => !r.levee);
    const reservesLevees = reserves.filter(r => !!r.levee);

    let statusHtml = '';
    let bodyHtml = '';

    if (reserves.length === 0) {
      statusHtml = `<span class="piece-status status-clean">Conforme — sans réserve</span>`;
    } else {
      const parts: string[] = [];
      if (reservesPending.length > 0) {
        parts.push(`${reservesPending.length} à traiter`);
      }
      if (reservesLevees.length > 0) {
        parts.push(`${reservesLevees.length} levée${reservesLevees.length > 1 ? 's' : ''}`);
      }
      statusHtml = `<span class="piece-status">${parts.join(' · ')}</span>`;

      const pendingBlock = reservesPending.length > 0
        ? `<div class="reserves-group">
             <div class="reserves-group-title">À traiter (${reservesPending.length})</div>
             ${renderReserves(reservesPending, photosResolved, false)}
           </div>`
        : '';
      const leveesBlock = reservesLevees.length > 0
        ? `<div class="reserves-group">
             <div class="reserves-group-title">Levées (${reservesLevees.length})</div>
             ${renderReserves(reservesLevees, photosResolved, true)}
           </div>`
        : '';
      bodyHtml = pendingBlock + leveesBlock;
    }

    return `
      <div class="piece">
        <div class="piece-head">
          <span class="piece-nom">${escapeHtml(piece.nom)}</span>
          ${statusHtml}
        </div>
        ${bodyHtml}
      </div>
    `;
  }).join('');

  return `
<section class="section">
  <div class="section-intro">
    ${renderSectionHeader('01', 'Pièces &amp; réserves')}
    ${synthese}
  </div>
  ${piecesHtml}
</section>
`;
}

/* ────────────────────────────────────────────────────────────────────
 * Section 03 — Paiement
 * ──────────────────────────────────────────────────────────────────── */

function renderPaiement(
  pv: PVReception,
  chantier: Chantier,
  marchesChantier: MarcheChantier[],
  supplementsMarche: SupplementMarche[],
): string {
  const modalite = pv.paiementRetenueGarantie?.modalite
    || 'chèque ou virement instantané, avant de quitter le chantier';

  const afficherRecap = pv.afficherRecapPaiement !== false;

  const recap = calculPaiementChantier(
    chantier.id,
    marchesChantier,
    supplementsMarche,
  );

  let recapHtml = '';
  if (afficherRecap) {
    if (recap.totalTTC > 0) {
      const lignesMarches = recap.marches.map(l =>
        `<tr><td>${escapeHtml(l.libelle)}</td><td class="num">${formatEUR(l.montantTTC)}</td></tr>`
      ).join('');
      const lignesSupp = recap.supplementsFactures.map(l =>
        `<tr><td>${escapeHtml(l.libelle)}</td><td class="num">${formatEUR(l.montantTTC)}</td></tr>`
      ).join('');

      recapHtml = `
        <div class="recap">
          <table class="recap-table">
            <tbody>
              ${lignesMarches}
              ${lignesSupp}
              <tr class="total">
                <td>Total TTC</td>
                <td class="num">${formatEUR(recap.totalTTC)}</td>
              </tr>
              <tr>
                <td>– Acomptes versés</td>
                <td class="num">–${formatEUR(recap.acomptesVerses)}</td>
              </tr>
              <tr>
                <td>– Retenue garantie ${recap.retenueGarantiePct}%</td>
                <td class="num">–${formatEUR(recap.retenueGarantieMontant)}</td>
              </tr>
              <tr class="reste">
                <td>Reste à payer aujourd'hui</td>
                <td class="num">${formatEUR(recap.resteAPayer)}</td>
              </tr>
            </tbody>
          </table>
          <div class="recap-note">
            Retenue garantie : ${formatEUR(recap.retenueGarantieMontant)} à verser après la levée des réserves.
          </div>
        </div>
      `;
    } else {
      recapHtml = `
        <div class="recap-empty">
          Aucun marché ou facture supplément enregistré sur ce chantier.
        </div>
      `;
    }
  }

  return `
<section class="section paiement-section">
  <div class="section-intro">
    ${renderSectionHeader('02', 'Paiement de la retenue garantie')}
    <div class="modalite">
      <div class="modalite-label">Modalité de règlement</div>
      <div class="modalite-text">${escapeHtml(modalite)}</div>
    </div>
  </div>
  ${recapHtml}
</section>
`;
}

/* ────────────────────────────────────────────────────────────────────
 * Section 04 — Signatures
 * ──────────────────────────────────────────────────────────────────── */

function renderSignatures(pv: PVReception): string {
  const sigEnt = pv.signatureEntrepriseUri;
  const sigClient = pv.signatureClientUri;
  const dateEnt = pv.signatureEntrepriseDate;
  const dateClient = pv.signatureClientDate;
  const nomSign = pv.nomSignataire;

  const blockEntreprise = `
    <div class="signature">
      <div class="signature-label">Entreprise</div>
      <div class="signature-box">
        ${sigEnt
          ? `<img src="${sigEnt}" alt="signature entreprise"/>`
          : `<div class="signature-empty">Non signée</div>`
        }
      </div>
      <div class="signature-meta">
        <strong>SK DECO</strong>
        ${sigEnt ? `Signé le ${formatDateTimeFR(dateEnt)}` : ''}
      </div>
    </div>
  `;

  const blockClient = `
    <div class="signature">
      <div class="signature-label">Client / Maître d'ouvrage</div>
      <div class="signature-box">
        ${sigClient
          ? `<img src="${sigClient}" alt="signature client"/>`
          : `<div class="signature-empty">Non signée</div>`
        }
      </div>
      <div class="signature-meta">
        ${nomSign ? `<strong>${escapeHtml(nomSign)}</strong>` : ''}
        ${sigClient ? `Signé le ${formatDateTimeFR(dateClient)}` : ''}
      </div>
    </div>
  `;

  return `
<section class="section signatures-section">
  <div class="section-intro">
    ${renderSectionHeader('03', 'Signatures')}
    <div class="signatures-grid">
      ${blockEntreprise}
      ${blockClient}
    </div>
  </div>
</section>
`;
}

/* ────────────────────────────────────────────────────────────────────
 * CSS
 * ──────────────────────────────────────────────────────────────────── */

function buildCss(numeroPV: string, nomChantier: string): string {
  // Header de page (échappé pour CSS content)
  const pageHeader = `${numeroPV} — ${nomChantier}`
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  return `
* { box-sizing: border-box; }

@page {
  size: A4;
  margin: 0;
}

body {
  font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 11pt;
  color: #1A1A1A;
  line-height: 1.55;
  margin: 0;
  padding: 0;
  orphans: 2;
  widows: 2;
}

h2, h3 {
  page-break-after: avoid;
  break-after: avoid;
}

/* ════════════════════════════════════════════════════════════════
 * PAGE DE GARDE (full bleed 210×297mm)
 * ════════════════════════════════════════════════════════════════ */

.cover {
  width: 210mm;
  height: 297mm;
  page-break-after: always;
  background: #FBF7F2;
  display: flex;
  flex-direction: column;
}
.cover-band {
  height: 12mm;
  background: #5C1F2E;
  flex: 0 0 auto;
}
.cover-content {
  flex: 1;
  padding: 18mm 22mm;
  display: flex;
  flex-direction: column;
}
.cover-top {
  display: flex;
  flex-direction: column;
}
.cover-logo {
  text-align: center;
  margin-bottom: 12mm;
}
.cover-logo img {
  height: 20mm;
  width: auto;
}
.cover-logo-fallback {
  font-family: Georgia, serif;
  font-size: 24pt;
  font-weight: 700;
  color: #5C1F2E;
  letter-spacing: 4pt;
}
.cover-eyebrow {
  text-align: center;
  font-size: 9pt;
  letter-spacing: 4pt;
  color: #5C1F2E;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 6mm;
}
.cover-title {
  text-align: center;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 32pt;
  color: #1A1A1A;
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: -0.5pt;
  margin: 0;
}
.cover-divider {
  width: 18mm;
  height: 1.5pt;
  background: #5C1F2E;
  margin: 10mm auto;
}
.cover-chantier {
  text-align: center;
  margin-top: 2mm;
}
.cover-label {
  font-size: 9pt;
  letter-spacing: 3pt;
  color: #6B7280;
  text-transform: uppercase;
  margin-bottom: 4mm;
}
.cover-chantier-nom {
  font-size: 22pt;
  font-weight: 700;
  color: #1A1A1A;
  letter-spacing: 1pt;
  margin: 0;
}
.cover-chantier-adresse {
  font-size: 11pt;
  color: #6B7280;
  margin-top: 3mm;
  font-weight: 400;
  line-height: 1.5;
}

/* Parties dans le tiers inférieur de la page de garde */
.cover-parties-wrapper {
  margin-top: auto;
  padding-top: 8mm;
  padding-bottom: 8mm;
  border-top: 0.5pt solid #D8CFC4;
  border-bottom: 0.5pt solid #D8CFC4;
  margin-bottom: 6mm;
}
.cover-parties {
  display: grid;
  gap: 4mm;
}
.cover-parties-two {
  grid-template-columns: 1fr 1fr;
}
.cover-parties-three {
  grid-template-columns: 1fr 1fr 1fr;
}
.cover-parties .partie {
  padding: 4mm 5mm;
  border-left: 2pt solid #5C1F2E;
  background: #FBF7F2;
}
.cover-parties .partie-role {
  font-size: 7pt;
  letter-spacing: 1.5pt;
  text-transform: uppercase;
  color: #5C1F2E;
  font-weight: 600;
  margin-bottom: 2mm;
}
.cover-parties .partie-nom {
  font-size: 11pt;
  font-weight: 700;
  color: #1A1A1A;
  letter-spacing: 0.3pt;
  line-height: 1.25;
}
.cover-parties .partie-info {
  font-size: 8.5pt;
  color: #6B7280;
  margin-top: 1.5mm;
  line-height: 1.4;
}
.cover-parties .partie-info-strong {
  color: #1A1A1A;
  font-style: italic;
  font-weight: 500;
}
.cover-parties .partie-info-meta {
  font-size: 7.5pt;
  letter-spacing: 0.2pt;
}

.cover-bottom {
  /* Pas de border-top : déjà géré par cover-parties-wrapper */
}
.cover-meta {
  display: flex;
  justify-content: space-between;
  gap: 8mm;
}
.cover-meta-block {
  flex: 1;
  text-align: center;
}
.cover-meta-label {
  font-size: 9pt;
  letter-spacing: 2pt;
  color: #6B7280;
  text-transform: uppercase;
  margin-bottom: 3mm;
  font-weight: 600;
}
.cover-meta-value {
  font-size: 13pt;
  color: #1A1A1A;
  font-weight: 600;
}
.cover-meta-divider {
  width: 0.5pt;
  background: #D8CFC4;
  margin: 0 4mm;
}
.cover-footer {
  text-align: center;
  font-size: 9pt;
  color: #6B7280;
  margin-top: 8mm;
  letter-spacing: 1pt;
}

/* ════════════════════════════════════════════════════════════════
 * WRAPPER PAGES DE CONTENU
 * (padding pour simuler les marges car expo-print/WebKit n'applique
 *  pas les @page { margin } en interne)
 * ════════════════════════════════════════════════════════════════ */

.content {
  padding: 22mm 18mm 24mm 18mm;
}

/* Bandeau du haut sur les pages de contenu (réf chantier) */
.content-band {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 9pt;
  color: #6B7280;
  letter-spacing: 1pt;
  padding-bottom: 6mm;
  margin-bottom: 10mm;
  border-bottom: 0.5pt solid #D8CFC4;
}
.content-band-left {
  font-weight: 700;
  color: #5C1F2E;
  letter-spacing: 2pt;
}

/* Titre central serif (rappel du document sur chaque page de contenu) */
.content-title {
  text-align: center;
  margin-bottom: 12mm;
  page-break-after: avoid;
  break-after: avoid;
}
.content-title-line {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 22pt;
  font-style: italic;
  font-weight: 400;
  color: #1A1A1A;
  letter-spacing: -0.3pt;
  line-height: 1.2;
}
.content-title-sub {
  font-size: 10pt;
  color: #6B7280;
  margin-top: 3mm;
  letter-spacing: 1.5pt;
  text-transform: uppercase;
  font-weight: 600;
}

.section {
  margin-bottom: 14mm;
}

/* Wrapper qui force header + premier contenu à rester sur la même page */
.section-intro {
  page-break-inside: avoid;
  break-inside: avoid;
}

.section-header {
  display: flex;
  align-items: baseline;
  gap: 5mm;
  margin-bottom: 8mm;
  page-break-after: avoid;
  break-after: avoid;
}
.section-num {
  font-family: Georgia, serif;
  font-size: 14pt;
  color: #5C1F2E;
  font-weight: 400;
  font-style: italic;
  letter-spacing: 0.5pt;
  flex: 0 0 auto;
}
.section-title {
  font-size: 13pt;
  letter-spacing: 2.5pt;
  text-transform: uppercase;
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
  flex: 0 0 auto;
}
.section-rule {
  flex: 1;
  height: 0.5pt;
  background: #D8CFC4;
  align-self: center;
  margin-left: 4mm;
  min-width: 20mm;
}

/* Parties */
.parties {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6mm;
}
.parties-three {
  grid-template-columns: 1fr 1fr 1fr;
}
.partie {
  padding: 5mm 6mm;
  border-left: 2pt solid #5C1F2E;
  background: #FBF7F2;
}
.partie-role {
  font-size: 9pt;
  letter-spacing: 2pt;
  text-transform: uppercase;
  color: #5C1F2E;
  font-weight: 600;
  margin-bottom: 3mm;
}
.partie-nom {
  font-size: 14pt;
  font-weight: 700;
  color: #1A1A1A;
  letter-spacing: 0.3pt;
}
.partie-info {
  font-size: 10pt;
  color: #6B7280;
  margin-top: 1.5mm;
}
.partie-info-strong {
  color: #1A1A1A;
  font-weight: 500;
  font-style: italic;
  margin-top: 2mm;
}
.partie-info-meta {
  font-size: 9pt;
  letter-spacing: 0.2pt;
}

/* Synthèse — tags */
.synthese {
  display: flex;
  gap: 4mm;
  flex-wrap: wrap;
  margin-bottom: 8mm;
}
.synthese-tag {
  font-size: 10pt;
  padding: 2.5mm 5mm;
  border: 0.5pt solid #5C1F2E;
  color: #5C1F2E;
  letter-spacing: 0.5pt;
  font-weight: 600;
}
.synthese-tag.tag-success {
  background: #5C1F2E;
  color: #FBF7F2;
  border-color: #5C1F2E;
}
.synthese-tag.tag-pending {
  border-color: #B91C1C;
  color: #B91C1C;
}

/* Pièces */
.piece {
  margin-bottom: 8mm;
}
.piece-head {
  display: flex;
  align-items: baseline;
  gap: 4mm;
  padding-bottom: 3mm;
  margin-bottom: 4mm;
  border-bottom: 0.5pt solid #D8CFC4;
  page-break-after: avoid;
  break-after: avoid;
}
.piece-nom {
  font-size: 14pt;
  font-weight: 700;
  color: #1A1A1A;
  letter-spacing: 0.3pt;
  flex: 1;
}
.piece-status {
  font-size: 10pt;
  color: #6B7280;
  font-style: italic;
  letter-spacing: 0.3pt;
}
.piece-status.status-clean {
  color: #5C1F2E;
}

/* Réserves */
.reserves-group {
  margin: 4mm 0;
}
.reserves-group-title {
  font-size: 9pt;
  letter-spacing: 2pt;
  text-transform: uppercase;
  font-weight: 600;
  color: #6B7280;
  margin-bottom: 3mm;
  page-break-after: avoid;
  break-after: avoid;
}
.reserve {
  padding: 4mm 5mm;
  margin-bottom: 3mm;
  border-left: 2pt solid #B91C1C;
  background: #FFFAF8;
  page-break-inside: avoid;
  break-inside: avoid;
}
.reserve-levee {
  border-left-color: #5C1F2E;
  background: #FBF7F2;
}
.reserve-desc {
  font-size: 11pt;
  font-weight: 600;
  color: #1A1A1A;
}
.reserve-desc-levee {
  text-decoration: line-through;
  color: #6B7280;
}
.reserve-cat {
  font-size: 9pt;
  color: #6B7280;
  margin-top: 1mm;
  letter-spacing: 0.3pt;
}
.reserve-levee-meta {
  font-size: 9pt;
  color: #5C1F2E;
  margin-top: 2mm;
  letter-spacing: 0.3pt;
  font-weight: 600;
}

/* Photos */
.photos-block {
  margin-top: 3mm;
  page-break-inside: avoid;
  break-inside: avoid;
}
.photos-label {
  font-size: 9pt;
  color: #6B7280;
  letter-spacing: 1pt;
  text-transform: uppercase;
  margin-bottom: 2mm;
  font-weight: 600;
  page-break-after: avoid;
}
.photos-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5mm;
}
.photo-thumb {
  width: 24mm;
  height: 24mm;
  background: #FBF7F2;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 24mm;
  border: 0.3pt solid #E5DDD3;
}
.photo-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.photo-thumb-broken {
  background: #FBF7F2;
}
.photo-broken-icon {
  font-size: 14pt;
  color: #B91C1C;
}

/* Paiement */
.modalite {
  padding: 6mm;
  background: #FBF7F2;
  border-left: 2pt solid #5C1F2E;
  margin-bottom: 6mm;
  page-break-inside: avoid;
}
.modalite-label {
  font-size: 9pt;
  letter-spacing: 2pt;
  text-transform: uppercase;
  color: #5C1F2E;
  font-weight: 600;
  margin-bottom: 2mm;
}
.modalite-text {
  font-size: 11pt;
  color: #1A1A1A;
}

.recap {
  margin-top: 4mm;
  page-break-inside: avoid;
}
.recap-table {
  width: 100%;
  border-collapse: collapse;
}
.recap-table td {
  padding: 3mm 0;
  font-size: 11pt;
  border-bottom: 0.3pt solid #E5DDD3;
}
.recap-table td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.recap-table tr.total td {
  border-top: 1pt solid #5C1F2E;
  border-bottom: 0.3pt solid #5C1F2E;
  padding-top: 4mm;
  font-weight: 700;
  font-size: 12pt;
}
.recap-table tr.reste td {
  border-top: 1pt solid #5C1F2E;
  border-bottom: 1pt solid #5C1F2E;
  padding: 4mm;
  background: #5C1F2E;
  color: #FBF7F2;
  font-weight: 700;
  font-size: 13pt;
}

.recap-note {
  margin-top: 4mm;
  font-size: 9pt;
  color: #6B7280;
  font-style: italic;
  letter-spacing: 0.3pt;
}

.recap-empty {
  font-size: 10pt;
  color: #6B7280;
  font-style: italic;
  text-align: center;
  padding: 8mm;
  background: #FBF7F2;
  margin-top: 4mm;
  border-radius: 1mm;
}

/* Signatures */
/* V6 Règle 3 : Paiement (02) + Signatures (03) DOIVENT être sur la même
   dernière page. On force un saut de page avant + on empêche tout split
   à l'intérieur. Compromis : la page précédente (Pièces) peut avoir du
   vide en bas. */
.final-page {
  page-break-before: always;
  break-before: page;
  page-break-inside: avoid;
  break-inside: avoid;
}

.signatures-section {
  page-break-inside: avoid;
  break-inside: avoid;
}
.signatures-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10mm;
  margin-top: 4mm;
}
.signature {
  padding-top: 4mm;
}
.signature-label {
  font-size: 9pt;
  letter-spacing: 2pt;
  text-transform: uppercase;
  color: #5C1F2E;
  font-weight: 600;
  margin-bottom: 4mm;
}
.signature-box {
  height: 30mm;
  border-bottom: 0.5pt solid #1A1A1A;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2mm;
}
.signature-box img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.signature-empty {
  font-size: 10pt;
  color: #9DA6B0;
  font-style: italic;
}
.signature-meta {
  font-size: 9.5pt;
  color: #6B7280;
  margin-top: 3mm;
  letter-spacing: 0.3pt;
}
.signature-meta strong {
  color: #1A1A1A;
  font-size: 10.5pt;
  display: block;
  margin-bottom: 1mm;
  font-weight: 700;
}

.mentions {
  margin-top: 14mm;
  padding-top: 5mm;
  border-top: 0.5pt solid #D8CFC4;
  font-size: 8.5pt;
  color: #6B7280;
  letter-spacing: 0.3pt;
  text-align: center;
  line-height: 1.6;
  page-break-inside: avoid;
}

.empty {
  padding: 12mm;
  text-align: center;
  color: #6B7280;
  font-style: italic;
  font-size: 10pt;
}
`;
}

/* ────────────────────────────────────────────────────────────────────
 * Export
 * ──────────────────────────────────────────────────────────────────── */

export function genererPVHtml(params: GenererPVHtmlParams): string {
  const {
    pv,
    chantier,
    apporteurs,
    marchesChantier,
    supplementsMarche,
    logoDataUri,
    photosResolved,
  } = params;

  const css = buildCss(
    pv.numeroPV || '—',
    chantier.nom || '—',
  );

  const refChantierLabel = `${escapeHtml(pv.numeroPV || '—')} — ${escapeHtml(chantier.nom || '—')}`;
  const nomChantierTitle = escapeHtml(chantier.nom || '');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>PV de réception — ${escapeHtml(pv.numeroPV || chantier.nom)}</title>
  <style>${css}</style>
</head>
<body>
  ${renderCover(pv, chantier, apporteurs, logoDataUri)}
  <div class="content">
    <div class="content-band">
      <span class="content-band-left">SK DECO</span>
      <span class="content-band-right">${refChantierLabel}</span>
    </div>
    <div class="content-title">
      <div class="content-title-line">Procès-Verbal de Réception</div>
      ${nomChantierTitle ? `<div class="content-title-sub">— ${nomChantierTitle} —</div>` : ''}
    </div>
    ${renderPieces(pv, photosResolved)}
    <div class="final-page">
      ${renderPaiement(pv, chantier, marchesChantier, supplementsMarche)}
      ${renderSignatures(pv)}
    </div>
  </div>
</body>
</html>
`;

  return html;
}
