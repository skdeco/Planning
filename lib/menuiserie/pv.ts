/**
 * PV de réception Menuiserie (PDF) :
 *  - « client » : nom du chantier + client, réserves, zone de signatures ;
 *  - « usine »  : nom du chantier SEULEMENT, réserves, aucun prix ni nom de client.
 * Sur iPhone/Android le PDF est enregistré dans l'étape PV ; sur le web, la fenêtre
 * d'impression du navigateur permet de l'enregistrer en PDF.
 */
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import { formatDateFR } from '@/lib/date/format';
import { deposerDocumentMn } from './api';
import type { ChantierMn, CompteMn, ReserveMn } from './types';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

function html(ch: ChantierMn, reserves: ReserveMn[], version: 'client' | 'usine'): string {
  const aujourdhui = formatDateFR(new Date().toISOString().slice(0, 10));
  const lignes = reserves.length
    ? reserves.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.meuble || '—')}</td><td>${esc(r.description)}</td><td></td></tr>`).join('')
    : '<tr><td colspan="4">Aucune réserve : réception sans réserve.</td></tr>';
  const client = version === 'client' && ch.client_nom
    ? `<p><b>Client :</b> ${esc(ch.client_nom)}${ch.client_societe ? ` — ${esc(ch.client_societe)}` : ''}</p>` : '';
  const adresse = version === 'client' ? [ch.rue, ch.code_postal, ch.ville].filter(Boolean).join(' ') : '';
  return `<html><head><meta charset="utf-8"><style>
    body{font-family:Helvetica,Arial,sans-serif;color:#141414;padding:36px}
    h1{color:#141414;font-size:22px;margin:0 0 4px}
    table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
    th,td{border:1px solid #D9CEC1;padding:8px;text-align:left;vertical-align:top}
    th{background:#EBEBE8}
    .sig{display:flex;gap:24px;margin-top:40px}.sig div{flex:1;border-top:1px solid #141414;padding-top:6px;font-size:12px;height:80px}
  </style></head><body>
    <h1>${version === 'client' ? 'Procès-verbal de réception' : 'Éléments à reprendre ou terminer'}</h1>
    <p><b>Chantier :</b> ${esc(ch.nom.toUpperCase())}${adresse ? ` — ${esc(adresse)}` : ''}</p>
    ${client}
    <p><b>Date :</b> ${aujourdhui}</p>
    <table><tr><th>#</th><th>Meuble</th><th>${version === 'client' ? 'Réserve' : 'Élément à reprendre'}</th><th>${version === 'client' ? 'Levée le' : 'Envoyé le'}</th></tr>${lignes}</table>
    ${version === 'client' ? '<div class="sig"><div>SK DECO</div><div>Le client</div></div>' : ''}
  </body></html>`;
}

export async function genererPvMn(moi: CompteMn, ch: ChantierMn, reserves: ReserveMn[], version: 'client' | 'usine'): Promise<'enregistre' | 'imprime'> {
  const contenu = html(ch, version === 'usine' ? reserves.filter(r => r.transmise_usine) : reserves, version);
  if (Platform.OS === 'web') { await Print.printAsync({ html: contenu }); return 'imprime'; }
  const { uri } = await Print.printToFileAsync({ html: contenu, base64: false });
  const date = new Date().toISOString().slice(0, 10);
  await deposerDocumentMn(moi, {
    chantierId: ch.id, etape: 'pv', uri, mime: 'application/pdf',
    nom: version === 'client' ? `PV_${ch.nom}_${date}.pdf` : `Reprises_usine_${ch.nom}_${date}.pdf`,
    // La version usine est visible par l'usine ; la version client reste admin (à partager au client)
    visibilite: version === 'usine' ? ['admin', 'usine'] : ['admin'],
  });
  return 'enregistre';
}
