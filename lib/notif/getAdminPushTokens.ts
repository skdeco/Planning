/**
 * Helper centralisé : récupère les push tokens de l'admin.
 *
 * Inclut :
 *  1. L'employé lié au compte admin via `data.adminEmployeId` (s'il a un push token)
 *  2. Tous les employés avec `role === 'admin'` (déduplication par token)
 *
 * Utilisé pour notifier l'admin lors d'événements externes :
 *  - retards / absences employés
 *  - notes chantier
 *  - création SAV par client / apporteur / architecte
 */

interface EmployeWithPushToken {
  id: string;
  role?: string;
  pushToken?: string;
}

export function getAdminPushTokens(
  employes: EmployeWithPushToken[],
  adminEmployeId?: string,
): string[] {
  const tokens: string[] = [];
  if (adminEmployeId) {
    const emp = employes.find(e => e.id === adminEmployeId);
    if (emp?.pushToken) tokens.push(emp.pushToken);
  }
  employes.forEach(e => {
    if (e.role === 'admin' && e.pushToken && !tokens.includes(e.pushToken)) {
      tokens.push(e.pushToken);
    }
  });
  return tokens;
}
