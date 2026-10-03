/**
 * Ajoute au Planning direction (données de l'app) les RDV Menuiserie confirmés
 * par tous (admins + client). Appelé depuis l'accueil Menuiserie administrateur.
 */
import { useCallback, useRef } from 'react';
import { useApp } from '@/app/context/AppContext';
import { listerRdvMn } from '@/lib/menuiserie/api2';
import type { ChantierMn } from '@/lib/menuiserie/types';
import { cleUtilisateur } from '@/lib/espaces';

export function useSyncRdvMenuiserie() {
  const { data, currentUser, addAgendaEvent } = useApp();
  // Références stables : la fonction ne change pas à chaque ajout dans l'agenda
  const evenements = useRef(data.agendaEvents); evenements.current = data.agendaEvents;
  const utilisateur = useRef(currentUser); utilisateur.current = currentUser;
  const ajouter = useRef(addAgendaEvent); ajouter.current = addAgendaEvent;
  return useCallback(async (chantiers: ChantierMn[]) => {
    try {
      const rdvs = await listerRdvMn();
      const existants = new Set((evenements.current || []).map(e => e.id));
      rdvs.filter(r => r.statut === 'confirme' && !existants.has(`mnrdv_${r.id}`)).forEach(r => {
        const ch = chantiers.find(c => c.id === r.chantier_id);
        ajouter.current({
          id: `mnrdv_${r.id}`, titre: `${r.titre}${ch ? ` · ${ch.nom}` : ''}`, description: 'RDV Menuiserie confirmé par le client',
          date: r.date_rdv, heureDebut: r.heure_debut, heureFin: r.heure_fin || undefined, lieu: r.lieu || undefined,
          couleur: '#141414', createdBy: cleUtilisateur(utilisateur.current), createdByNom: r.propose_par_nom || 'Menuiserie',
          invites: [], visiblePar: [], acceptes: [], refuses: [], createdAt: new Date().toISOString(),
        });
      });
    } catch { /* hors ligne : on réessaiera au prochain passage */ }
  }, []);
}
