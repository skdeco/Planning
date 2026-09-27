/**
 * Invitations du Planning direction : réponses (accepter / proposer d'autres créneaux)
 * et choix, par le créateur, d'un créneau contre-proposé.
 */
import { useMemo } from 'react';
import { useApp } from '@/app/context/AppContext';
import type { AgendaEvent, ContrePropositionRdv, CreneauPropose } from '@/app/types';
import { cleUtilisateur, nomParticipant } from '@/lib/espaces';

function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function genId() { return `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

export function useInvitationsRdv() {
  const { data, currentUser, updateAgendaEvent } = useApp();
  const moi = cleUtilisateur(currentUser);
  const monNom = currentUser?.nom || nomParticipant(moi, data);

  const { aRepondre, aChoisir } = useMemo(() => {
    const today = aujourdhui();
    const events = (data.agendaEvents || []).filter(e => e.date >= today);
    const cps = (e: AgendaEvent) => e.contrePropositions || [];
    return {
      // Invité, pas encore répondu, pas de contre-proposition en attente
      aRepondre: events.filter(e =>
        (e.invites || []).includes(moi)
        && !(e.acceptes || []).includes(moi)
        && !(e.refuses || []).includes(moi)
        && !cps(e).some(c => c.par === moi && c.statut === 'en_attente'),
      ),
      // Mes RDV sur lesquels un invité propose d'autres créneaux
      aChoisir: events.filter(e => e.createdBy === moi && cps(e).some(c => c.statut === 'en_attente')),
    };
  }, [data.agendaEvents, moi]);

  const accepter = (evt: AgendaEvent) => {
    updateAgendaEvent({
      ...evt,
      acceptes: Array.from(new Set([...(evt.acceptes || []), moi])),
      refuses: (evt.refuses || []).filter(r => r !== moi),
    });
  };

  const proposer = (evt: AgendaEvent, creneaux: CreneauPropose[], message?: string) => {
    const cp: ContrePropositionRdv = {
      id: genId(), par: moi, parNom: monNom, creneaux,
      message: message?.trim() || undefined, statut: 'en_attente', createdAt: new Date().toISOString(),
    };
    updateAgendaEvent({ ...evt, contrePropositions: [...(evt.contrePropositions || []), cp] });
  };

  /** Le créateur retient un créneau : le RDV est déplacé, les autres invités doivent reconfirmer */
  const choisir = (evt: AgendaEvent, cpId: string, creneau: CreneauPropose) => {
    const cp = (evt.contrePropositions || []).find(c => c.id === cpId);
    if (!cp) return;
    updateAgendaEvent({
      ...evt,
      date: creneau.date,
      heureDebut: creneau.heureDebut,
      heureFin: creneau.heureFin || evt.heureFin,
      acceptes: Array.from(new Set([evt.createdBy, cp.par])),
      refuses: [],
      contrePropositions: (evt.contrePropositions || []).map(c =>
        c.id === cpId ? { ...c, statut: 'choisie' as const } : c.statut === 'en_attente' ? { ...c, statut: 'refusee' as const } : c,
      ),
    });
  };

  /** Le créateur garde son créneau : l'invité est de nouveau sollicité */
  const garderCreneau = (evt: AgendaEvent, cpId: string) => {
    updateAgendaEvent({
      ...evt,
      contrePropositions: (evt.contrePropositions || []).map(c => c.id === cpId ? { ...c, statut: 'refusee' as const } : c),
    });
  };

  return { moi, aRepondre, aChoisir, accepter, proposer, choisir, garderCreneau, total: aRepondre.length + aChoisir.length };
}
