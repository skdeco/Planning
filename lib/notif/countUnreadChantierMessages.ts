/**
 * Compte les messages de chantier non lus pour un utilisateur donné.
 * Utilisé pour poser le badge numérique sur l'icône de l'app.
 *
 * Un message est "non lu" si l'utilisateur n'en est pas l'auteur
 * et que son id n'est pas dans `luPar`.
 */
interface MsgLike { auteurId: string; luPar?: string[] }
interface ChantierLike { messagesChantier?: MsgLike[] }

export function countUnreadChantierMessages(
  chantiers: ChantierLike[],
  viewerId: string,
): number {
  if (!viewerId) return 0;
  let n = 0;
  for (const c of chantiers) {
    for (const m of c.messagesChantier || []) {
      if (m.auteurId !== viewerId && !(m.luPar || []).includes(viewerId)) n++;
    }
  }
  return n;
}
