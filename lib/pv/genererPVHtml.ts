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
 * Génère le HTML complet du PV de réception pour conversion en PDF
 * via expo-print.
 *
 * ⚠️ Toutes les images doivent être passées en data URI (base64) :
 * - logoDataUri : logo SK DECO (chargé via expo-asset)
 * - signatures : déjà en data URI dans pv (Plan D — DETTE-PV-DATAURI-001)
 * - photosResolved : map URL Supabase → data URI (pré-fetché par genererPVPdf)
 *   Une URL absente = photo cassée → placeholder ⚠️ affiché
 *
 * Pas de réseau dans cette fonction : 100% pur.
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
  // Accepte YYYY-MM-DD ou ISO datetime
  const ymd = iso.includes('T') ? iso.split('T')[0] : iso;
  const parts = ymd.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
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

function formatAdresse(chantier: Chantier): string {
  const ligne1 = chantier.rue || '';
  const ligne2Parts = [chantier.codePostal, chantier.ville].filter(Boolean);
  const ligne2 = ligne2Parts.join(' ');
  const ligne3 = chantier.pays && chantier.pays !== 'France' ? chantier.pays : '';

  if (ligne1 || ligne2) {
    return [ligne1, ligne2, ligne3].filter(Boolean).map(escapeHtml).join('<br/>');
  }
  // Fallback legacy
  return escapeHtml(chantier.adresse || '—');
}

/* ────────────────────────────────────────────────────────────────────
 * Sections HTML
 * ──────────────────────────────────────────────────────────────────── */

function renderEntete(
  pv: PVReception,
  chantier: Chantier,
  logoDataUri: string,
): string {
  const numero = escapeHtml(pv.numeroPV || '—');
  const dateReception = formatDateFR(pv.dateReception);
  const nomChantier = escapeHtml(chantier.nom);

  return `
<div class="entete">
  <div class="entete-logo">
    ${logoDataUri ? `<img src="${logoDataUri}" alt="SK DECO" class="logo"/>` : '<div class="logo-fallback">SK DECO</div>'}
  </div>
  <div class="entete-titre">
    <h1>Procès-verbal de réception</h1>
    <div class="entete-meta">
      <div><strong>N° :</strong> ${numero}</div>
      <div><strong>Date de réception :</strong> ${dateReception}</div>
    </div>
  </div>
</div>
<div class="entete-chantier">
  <strong>Chantier :</strong> ${nomChantier}<br/>
  ${formatAdresse(chantier)}
</div>
`;
}

function renderParties(
  chantier: Chantier,
  apporteurs: Apporteur[],
): string {
  // Entreprise (figée — c'est nous)
  const entrepriseHtml = `
    <div class="partie">
      <div class="partie-role">Entreprise</div>
      <div class="partie-nom">SK DECO</div>
    </div>
  `;

  // Client : Apporteur si lié, sinon fallback texte legacy
  const clientApp = chantier.clientApporteurId
    ? apporteurs.find(a => a.id === chantier.clientApporteurId)
    : undefined;
  let clientHtml = '';
  if (clientApp) {
    const nom = escapeHtml(`${clientApp.prenom} ${clientApp.nom}`.trim());
    const societe = clientApp.societe ? `<div class="partie-societe">${escapeHtml(clientApp.societe)}</div>` : '';
    const adresse = clientApp.adresse ? `<div class="partie-adresse">${escapeHtml(clientApp.adresse)}</div>` : '';
    clientHtml = `
      <div class="partie">
        <div class="partie-role">Maître d'ouvrage / Client</div>
        <div class="partie-nom">${nom}</div>
        ${societe}
        ${adresse}
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
      </div>
    `;
  }

  // Architecte (si lié)
  const architecte = chantier.architecteId
    ? apporteurs.find(a => a.id === chantier.architecteId)
    : undefined;
  let architecteHtml = '';
  if (architecte) {
    const nom = escapeHtml(`${architecte.prenom} ${architecte.nom}`.trim());
    const societe = architecte.societe ? `<div class="partie-societe">${escapeHtml(architecte.societe)}</div>` : '';
    architecteHtml = `
      <div class="partie">
        <div class="partie-role">Architecte / Maître d'œuvre</div>
        <div class="partie-nom">${nom}</div>
        ${societe}
      </div>
    `;
  }

  return `
<section class="section parties">
  <h2>Parties</h2>
  <div class="parties-grid">
    ${entrepriseHtml}
    ${clientHtml}
    ${architecteHtml}
  </div>
</section>
`;
}

function renderPhotoThumb(
  url: string,
  photosResolved: Record<string, string>,
): string {
  const dataUri = photosResolved[url];
  if (dataUri) {
    return `<div class="photo-thumb"><img src="${dataUri}" alt="photo"/></div>`;
  }
  // Photo cassée → placeholder ⚠️ (décision UX validée)
  return `<div class="photo-thumb photo-thumb-broken"><span class="photo-broken-icon">⚠️</span></div>`;
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

  const itemsHtml = reserves.map(r => {
    const cat = r.lotDevisNomSnapshot || r.categorieLibre;
    const catHtml = cat ? `<div class="reserve-categorie">📂 ${escapeHtml(cat)}</div>` : '';

    // Total photos (constat + levée) — au-delà de 3, on autorise la coupure
    const nbPhotosConstat = r.photos?.length || 0;
    const nbPhotosLevee = (isLevee && r.levee?.photos?.length) || 0;
    const nbPhotosTotal = nbPhotosConstat + nbPhotosLevee;

    const photosConstat = (r.photos && r.photos.length > 0)
      ? `<div class="photos-block">
          <div class="photos-label">📷 Constat (${r.photos.length})</div>
          <div class="photos-grid">
            ${r.photos.map(url => renderPhotoThumb(url, photosResolved)).join('')}
          </div>
        </div>`
      : '';

    const photosLevee = (isLevee && r.levee && r.levee.photos && r.levee.photos.length > 0)
      ? `<div class="photos-block">
          <div class="photos-label">✅ Levée le ${formatDateFR(r.levee.le)} (${r.levee.photos.length} photo${r.levee.photos.length > 1 ? 's' : ''})</div>
          <div class="photos-grid">
            ${r.levee.photos.map(url => renderPhotoThumb(url, photosResolved)).join('')}
          </div>
        </div>`
      : '';

    const leveeNote = (isLevee && r.levee && !r.levee.photos?.length)
      ? `<div class="levee-note">✅ Levée le ${formatDateFR(r.levee.le)}</div>`
      : '';

    return `
      <div class="reserve ${isLevee ? 'reserve-levee' : 'reserve-pending'}${nbPhotosTotal > 3 ? ' reserve-large' : ''}">
        <div class="reserve-head">
          <span class="reserve-check">${isLevee ? '✅' : '⬜'}</span>
          <div class="reserve-body">
            <div class="reserve-desc ${isLevee ? 'reserve-desc-levee' : ''}">${escapeHtml(r.description)}</div>
            ${catHtml}
          </div>
        </div>
        ${photosConstat}
        ${photosLevee}
        ${leveeNote}
      </div>
    `;
  }).join('');

  return itemsHtml;
}

function renderPieces(
  pv: PVReception,
  photosResolved: Record<string, string>,
): string {
  const pieces = pv.pieces || [];

  if (pieces.length === 0) {
    return `
<section class="section">
  <h2>Pièces & réserves</h2>
  <div class="empty">Aucune pièce dans ce PV.</div>
</section>
`;
  }

  // Comptes globaux (pour synthèse)
  let totalATraiter = 0;
  let totalLevees = 0;
  pieces.forEach(p => {
    (p.reserves || []).forEach(r => {
      if (r.levee) totalLevees++;
      else totalATraiter++;
    });
  });

  const synthese = `
    <div class="synthese">
      <div class="synthese-pill">🏠 ${pieces.length} pièce${pieces.length > 1 ? 's' : ''}</div>
      ${totalATraiter > 0 ? `<div class="synthese-pill synthese-pending">🔴 ${totalATraiter} réserve${totalATraiter > 1 ? 's' : ''} à traiter</div>` : ''}
      ${totalLevees > 0 ? `<div class="synthese-pill synthese-levee">✅ ${totalLevees} levée${totalLevees > 1 ? 's' : ''}</div>` : ''}
      ${totalATraiter === 0 && totalLevees === 0 ? `<div class="synthese-pill synthese-levee">✅ Aucune réserve</div>` : ''}
    </div>
  `;

  const piecesHtml = pieces.map(piece => {
    const reserves = piece.reserves || [];
    const reservesPending = reserves.filter(r => !r.levee);
    const reservesLevees = reserves.filter(r => !!r.levee);

    let bodyHtml = '';
    if (reserves.length === 0) {
      bodyHtml = `<div class="piece-empty">✓ Aucune réserve</div>`;
    } else {
      const pendingBlock = reservesPending.length > 0
        ? `<div class="reserves-group">
             <div class="reserves-group-title">🔴 À traiter (${reservesPending.length})</div>
             ${renderReserves(reservesPending, photosResolved, false)}
           </div>`
        : '';
      const leveesBlock = reservesLevees.length > 0
        ? `<div class="reserves-group">
             <div class="reserves-group-title">✅ Levées (${reservesLevees.length})</div>
             ${renderReserves(reservesLevees, photosResolved, true)}
           </div>`
        : '';
      bodyHtml = pendingBlock + leveesBlock;
    }

    return `
      <div class="piece">
        <div class="piece-head">
          <h3>${escapeHtml(piece.nom)}</h3>
          <div class="piece-stats">
            ${reservesPending.length > 0 ? `<span class="stat-pending">🔴 ${reservesPending.length} à traiter</span>` : ''}
            ${reservesLevees.length > 0 ? `<span class="stat-levee">✅ ${reservesLevees.length} levée${reservesLevees.length > 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>
        ${bodyHtml}
      </div>
    `;
  }).join('');

  return `
<section class="section">
  <h2>Pièces &amp; réserves</h2>
  ${synthese}
  ${piecesHtml}
</section>
`;
}

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
    const lignesMarches = recap.marches.map(l =>
      `<tr><td>${escapeHtml(l.libelle)}</td><td class="num">${formatEUR(l.montantTTC)}</td></tr>`
    ).join('');
    const lignesSupp = recap.supplementsFactures.map(l =>
      `<tr><td>${escapeHtml(l.libelle)}</td><td class="num">${formatEUR(l.montantTTC)}</td></tr>`
    ).join('');

    if (recap.totalTTC > 0) {
      recapHtml = `
        <div class="recap">
          <h3>Détail des montants</h3>
          <table class="recap-table">
            <tbody>
              ${lignesMarches}
              ${lignesSupp}
              <tr class="recap-sep"><td colspan="2"></td></tr>
              <tr class="recap-total">
                <td><strong>Total TTC</strong></td>
                <td class="num"><strong>${formatEUR(recap.totalTTC)}</strong></td>
              </tr>
              <tr>
                <td>– Acomptes versés</td>
                <td class="num green">–${formatEUR(recap.acomptesVerses)}</td>
              </tr>
              <tr>
                <td>– Retenue garantie ${recap.retenueGarantiePct}%</td>
                <td class="num red">–${formatEUR(recap.retenueGarantieMontant)}</td>
              </tr>
              <tr class="recap-sep"><td colspan="2"></td></tr>
              <tr class="recap-reste">
                <td><strong>🟢 Reste à payer aujourd'hui</strong></td>
                <td class="num green-bold">${formatEUR(recap.resteAPayer)}</td>
              </tr>
            </tbody>
          </table>
          <div class="recap-note">
            🔒 Retenue garantie : ${formatEUR(recap.retenueGarantieMontant)} à verser après la levée des réserves.
          </div>
        </div>
      `;
    } else {
      recapHtml = `
        <div class="recap">
          <div class="empty">Aucun marché ou facture supplément enregistré sur ce chantier.</div>
        </div>
      `;
    }
  }

  return `
<section class="section paiement-section">
  <h2>Paiement de la retenue garantie</h2>
  <div class="modalite">
    <div class="modalite-label">Modalité de règlement</div>
    <div class="modalite-text">${escapeHtml(modalite)}</div>
  </div>
  ${recapHtml}
</section>
`;
}

function renderSignatures(pv: PVReception): string {
  const sigEnt = pv.signatureEntrepriseUri;
  const sigClient = pv.signatureClientUri;
  const dateEnt = pv.signatureEntrepriseDate;
  const dateClient = pv.signatureClientDate;
  const nomSign = pv.nomSignataire;

  const blockEntreprise = `
    <div class="signature-card">
      <div class="signature-label">Entreprise (SK DECO)</div>
      <div class="signature-box">
        ${sigEnt
          ? `<img src="${sigEnt}" alt="signature entreprise" class="signature-img"/>`
          : `<div class="signature-empty">Non signée</div>`
        }
      </div>
      <div class="signature-meta">
        ${sigEnt ? `Signé le ${formatDateTimeFR(dateEnt)}` : ''}
      </div>
    </div>
  `;

  const blockClient = `
    <div class="signature-card">
      <div class="signature-label">Client / Maître d'ouvrage</div>
      <div class="signature-box">
        ${sigClient
          ? `<img src="${sigClient}" alt="signature client" class="signature-img"/>`
          : `<div class="signature-empty">Non signée</div>`
        }
      </div>
      <div class="signature-meta">
        ${nomSign ? `<div><strong>${escapeHtml(nomSign)}</strong></div>` : ''}
        ${sigClient ? `Signé le ${formatDateTimeFR(dateClient)}` : ''}
      </div>
    </div>
  `;

  return `
<section class="section signatures-section">
  <h2>Signatures</h2>
  <div class="signatures-grid">
    ${blockEntreprise}
    ${blockClient}
  </div>
</section>
`;
}

function renderPiedDePage(): string {
  const dateEdition = new Date().toLocaleDateString('fr-FR') + ' à ' +
    new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `
<div class="footer-mention">
  <div>SK DECO — Procès-verbal de réception de chantier</div>
  <div>Document généré le ${dateEdition}</div>
</div>
`;
}

/* ────────────────────────────────────────────────────────────────────
 * CSS
 * ──────────────────────────────────────────────────────────────────── */

const CSS = `
* { box-sizing: border-box; }

@page {
  size: A4;
  margin: 18mm 14mm 22mm 14mm;
  @bottom-center {
    content: "Page " counter(page) " / " counter(pages);
    font-family: -apple-system, sans-serif;
    font-size: 9pt;
    color: #687076;
  }
}

body {
  font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 10pt;
  color: #11181C;
  line-height: 1.45;
  margin: 0;
  padding: 0;
  /* Règles globales : minimum 2 lignes en haut/bas de page */
  orphans: 2;
  widows: 2;
}

/* Titres de section : doivent rester avec leur premier contenu */
h2 {
  page-break-after: avoid;
  break-after: avoid;
}
h3 {
  page-break-after: avoid;
  break-after: avoid;
}

h1 {
  font-size: 18pt;
  font-weight: 700;
  margin: 0 0 4px 0;
  color: #11181C;
}
h2 {
  font-size: 13pt;
  font-weight: 700;
  color: #11181C;
  margin: 0 0 10px 0;
  padding-bottom: 6px;
  border-bottom: 2px solid #2C2C2C;
}
h3 {
  font-size: 11pt;
  font-weight: 700;
  color: #11181C;
  margin: 0;
}

.section {
  margin: 16px 0;
}

/* Entête */
.entete {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid #2C2C2C;
  margin-bottom: 12px;
}
.entete-logo { flex: 0 0 auto; }
.logo {
  height: 50px;
  width: auto;
  display: block;
}
.logo-fallback {
  font-size: 16pt;
  font-weight: 800;
  letter-spacing: 2px;
  color: #2C2C2C;
}
.entete-titre { flex: 1; }
.entete-meta {
  font-size: 9pt;
  color: #687076;
  margin-top: 4px;
}
.entete-meta div { display: inline-block; margin-right: 16px; }
.entete-chantier {
  font-size: 10pt;
  margin-bottom: 6px;
  padding: 8px 10px;
  background: #F8F9FA;
  border-radius: 4px;
}

/* Parties */
.parties-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.partie {
  flex: 1 1 30%;
  min-width: 30%;
  padding: 10px;
  background: #F8F9FA;
  border-radius: 6px;
  border-left: 3px solid #2C2C2C;
}
.partie-role {
  font-size: 8pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #687076;
  margin-bottom: 4px;
}
.partie-nom {
  font-size: 10pt;
  font-weight: 700;
  color: #11181C;
}
.partie-societe, .partie-adresse {
  font-size: 9pt;
  color: #687076;
  margin-top: 2px;
}

/* Synthèse */
.synthese {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.synthese-pill {
  font-size: 9pt;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 12px;
  background: #F8F9FA;
  color: #11181C;
}
.synthese-pending { background: #FEE2E2; color: #B91C1C; }
.synthese-levee { background: #D1FAE5; color: #065F46; }

/* Pièces */
.piece {
  margin-bottom: 12px;
  padding: 10px;
  background: #F8F9FA;
  border-radius: 6px;
}
.piece-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #E2E6EA;
  /* Le header de pièce doit rester avec au moins sa première réserve */
  page-break-after: avoid;
  break-after: avoid;
}
.piece-stats { font-size: 9pt; }
.piece-stats span { margin-left: 8px; font-weight: 600; }
.stat-pending { color: #B91C1C; }
.stat-levee { color: #065F46; }
.piece-empty {
  font-size: 9pt;
  color: #687076;
  font-style: italic;
  padding: 6px 0;
}

.reserves-group { margin-top: 8px; }
.reserves-group-title {
  font-size: 9pt;
  font-weight: 700;
  color: #687076;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  /* Le titre "À TRAITER (n)" doit rester avec sa première réserve */
  page-break-after: avoid;
  break-after: avoid;
}

/* Réserves */
.reserve {
  background: #fff;
  border-radius: 4px;
  padding: 8px 10px;
  margin-bottom: 6px;
  border: 1px solid #FCA5A5;
  /* On évite de couper une réserve, sauf si vraiment trop grosse (4+ photos) */
  page-break-inside: avoid;
  break-inside: avoid;
  /* Le header de réserve doit rester avec ses photos quand c'est possible */
  orphans: 2;
  widows: 2;
}
/* Quand une réserve a beaucoup de photos, on autorise la coupure plutôt que créer un grand vide */
.reserve-large {
  page-break-inside: auto;
  break-inside: auto;
}
.reserve-levee {
  border-color: #A7F3D0;
  background: #F0FDF4;
}
.reserve-head {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.reserve-check { font-size: 11pt; flex: 0 0 auto; }
.reserve-body { flex: 1; }
.reserve-desc {
  font-size: 10pt;
  font-weight: 600;
  color: #11181C;
}
.reserve-desc-levee {
  text-decoration: line-through;
  color: #687076;
}
.reserve-categorie {
  font-size: 8.5pt;
  color: #687076;
  margin-top: 2px;
}
.levee-note {
  font-size: 8.5pt;
  color: #065F46;
  margin-top: 4px;
  padding-left: 18px;
}

/* Photos */
.photos-block {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid #E2E6EA;
  /* Le label "📷 Constat (n)" doit rester avec ses photos */
  page-break-inside: avoid;
  break-inside: avoid;
}
.photos-label {
  font-size: 8.5pt;
  font-weight: 600;
  color: #687076;
  margin-bottom: 4px;
  page-break-after: avoid;
  break-after: avoid;
}
.photos-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.photo-thumb {
  width: 90px;
  height: 90px;
  background: #F8F9FA;
  border-radius: 3px;
  overflow: hidden;
  border: 1px solid #E2E6EA;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 90px;
}
.photo-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.photo-thumb-broken {
  background: #F1F5F9;
}
.photo-broken-icon {
  font-size: 16pt;
  color: #94A3B8;
}

/* Paiement */
.paiement-section h2 {
  page-break-after: avoid;
  break-after: avoid;
}
/* Paiement */
.modalite {
  padding: 10px;
  background: #F8F9FA;
  border-radius: 6px;
  margin-bottom: 10px;
  page-break-inside: avoid;
  break-inside: avoid;
}
.modalite-label {
  font-size: 8pt;
  font-weight: 700;
  text-transform: uppercase;
  color: #687076;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.modalite-text {
  font-size: 10pt;
  color: #11181C;
}
.recap {
  padding: 10px;
  background: #fff;
  border: 1px solid #E2E6EA;
  border-radius: 6px;
  /* Le récap chiffré doit rester indivisible (juridique) */
  page-break-inside: avoid;
  break-inside: avoid;
}
.recap h3 {
  font-size: 10pt;
  margin: 0 0 8px 0;
}
.recap-table {
  width: 100%;
  border-collapse: collapse;
}
.recap-table td {
  padding: 4px 0;
  font-size: 9.5pt;
}
.recap-table td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.recap-table td.num.green { color: #065F46; }
.recap-table td.num.red { color: #B91C1C; }
.recap-table td.num.green-bold { color: #065F46; font-weight: 800; font-size: 11pt; }
.recap-sep td {
  border-top: 1px solid #E2E6EA;
  height: 0;
  padding: 0;
}
.recap-reste td { padding-top: 6px; font-size: 10.5pt; }
.recap-note {
  margin-top: 8px;
  padding: 6px 8px;
  background: #FEF3C7;
  border-left: 3px solid #F0AD4E;
  font-size: 9pt;
  color: #856404;
  border-radius: 3px;
}

/* Signatures */
.signatures-section {
  page-break-inside: avoid;
  break-inside: avoid;
}
.signatures-section h2 {
  page-break-after: avoid;
  break-after: avoid;
}
.signatures-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.signature-card {
  padding: 10px;
  background: #F8F9FA;
  border-radius: 6px;
  border: 1px solid #E2E6EA;
}
.signature-label {
  font-size: 8pt;
  font-weight: 700;
  text-transform: uppercase;
  color: #687076;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}
.signature-box {
  background: #fff;
  border-radius: 4px;
  padding: 6px;
  border: 1px solid #E2E6EA;
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.signature-img {
  max-width: 100%;
  max-height: 80px;
  object-fit: contain;
}
.signature-empty {
  font-size: 9pt;
  color: #9DA6B0;
  font-style: italic;
}
.signature-meta {
  font-size: 8.5pt;
  color: #687076;
  margin-top: 6px;
}
.signature-meta strong {
  color: #11181C;
  font-size: 9.5pt;
}

/* Pied de page */
.footer-mention {
  margin-top: 16px;
  padding-top: 8px;
  border-top: 1px solid #E2E6EA;
  font-size: 8pt;
  color: #687076;
  text-align: center;
  page-break-before: avoid;
  page-break-inside: avoid;
}
.footer-mention div { margin: 2px 0; }

.empty {
  padding: 12px;
  text-align: center;
  color: #687076;
  font-style: italic;
  font-size: 9pt;
}
`;

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

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>PV de réception — ${escapeHtml(pv.numeroPV || chantier.nom)}</title>
  <style>${CSS}</style>
</head>
<body>
  ${renderEntete(pv, chantier, logoDataUri)}
  ${renderParties(chantier, apporteurs)}
  ${renderPieces(pv, photosResolved)}
  ${renderPaiement(pv, chantier, marchesChantier, supplementsMarche)}
  ${renderSignatures(pv)}
  ${renderPiedDePage()}
</body>
</html>
`;

  return html;
}
