/** Droits et compteurs des « travaux et prix à facturer » des dépannages. */
import type { AppData, Chantier, CurrentUser } from '@/app/types';

export function peutVoirFacturation(c: Chantier, user: CurrentUser | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return !!user.employeId && (c.accesFacturationIds || []).includes(user.employeId);
}

/** Lignes non encore facturées, par chantier visible par l'utilisateur. */
export function depannagesAFacturer(data: AppData, user: CurrentUser | null | undefined) {
  return data.chantiers
    .filter(c => (c.facturationDepannage || []).some(l => !l.facture) && peutVoirFacturation(c, user))
    .map(c => {
      const lignes = (c.facturationDepannage || []).filter(l => !l.facture);
      return { chantier: c, nb: lignes.length, total: lignes.reduce((s, l) => s + (l.prix || 0), 0) };
    });
}

export const formatEuro = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
