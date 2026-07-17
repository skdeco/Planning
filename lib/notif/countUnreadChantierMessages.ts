/**
 * Compte les messages de chantier non lus pour un utilisateur donné.
 * Utilisé pour poser le badge numérique sur l'icône de l'app.
 *
 * Un message est "non lu" si l'utilisateur n'en est pas l'auteur, que son id
 * n'est pas dans `luPar`, ET qu'il est participant de la conversation.
 * L'admin est participant de tous les fils ; un intervenant externe ne compte
 * que les messages des fils où il figure (via destinatairesIds / destinataireId),
 * sinon le badge est gonflé par des conversations qu'il ne verra jamais.
 */
interface MsgLike {
  auteurId: string;
  auteurType?: string;
  destinataireId?: string;
  destinatairesIds?: string[];
  luPar?: string[];
}
interface ChantierLike { messagesChantier?: MsgLike[] }

// Participants externes d'un message (normalise l'ancien modèle mono-destinataire).
function msgParticipants(m: MsgLike): string[] {
  if (m.destinatairesIds && m.destinatairesIds.length) return m.destinatairesIds;
  if (m.destinataireId) return [m.destinataireId];
  if (m.auteurType && m.auteurType !== 'admin') return [m.auteurId];
  return [];
}

export function countUnreadChantierMessages(
  chantiers: ChantierLike[],
  viewerId: string,
): number {
  if (!viewerId) return 0;
  const isAdminViewer = viewerId === 'admin';
  let n = 0;
  for (const c of chantiers) {
    for (const m of c.messagesChantier || []) {
      if (m.auteurId === viewerId) continue;
      if ((m.luPar || []).includes(viewerId)) continue;
      // Un externe ne compte que les fils dont il est participant.
      if (!isAdminViewer && !msgParticipants(m).includes(viewerId)) continue;
      n++;
    }
  }
  return n;
}
