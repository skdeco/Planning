import { useEffect, useRef } from 'react';
import { useApp } from '@/app/context/AppContext';
import { useNotifications } from '@/hooks/useNotifications';

/**
 * Composant invisible qui écoute les changements de données
 * et envoie des notifications push quand c'est pertinent.
 */
export function NotificationListener() {
  const { data, currentUser } = useApp();
  const { sendNotification } = useNotifications();

  const isAdmin = currentUser?.role === 'admin';
  const myId = currentUser?.employeId || currentUser?.soustraitantId || '';
  const myRole = currentUser?.role;

  // Refs pour tracker les compteurs précédents
  const prevMsgsCount = useRef(-1);
  const prevDemandesCount = useRef(-1);
  const prevAffectationsCount = useRef(-1);

  // Notifications messages
  useEffect(() => {
    const msgs = data.messagesPrive || [];
    const nonLus = isAdmin
      ? msgs.filter(m => !m.lu && m.expediteurRole !== 'admin').length
      : msgs.filter(m => m.conversationId === myId && !m.lu && m.expediteurRole === 'admin').length;

    if (prevMsgsCount.current >= 0 && nonLus > prevMsgsCount.current) {
      const diff = nonLus - prevMsgsCount.current;
      sendNotification(
        'SK DECO Planning',
        `${diff} nouveau${diff > 1 ? 'x' : ''} message${diff > 1 ? 's' : ''}`
      );
    }
    prevMsgsCount.current = nonLus;
  }, [data.messagesPrive]);

  // Notifications demandes RH (admin/RH seulement)
  useEffect(() => {
    if (!isAdmin) return;
    const nbEnAttente = (
      (data.demandesConge || []).filter(d => d.statut === 'en_attente').length +
      (data.arretsMaladie || []).filter(d => d.statut === 'en_attente').length +
      (data.demandesAvance || []).filter(d => d.statut === 'en_attente').length
    );
    if (prevDemandesCount.current >= 0 && nbEnAttente > prevDemandesCount.current) {
      sendNotification(
        'SK DECO Planning — RH',
        'Nouvelle demande en attente de validation'
      );
    }
    prevDemandesCount.current = nbEnAttente;
  }, [data.demandesConge, data.arretsMaladie, data.demandesAvance]);

  // Notifications nouvelles affectations (employé seulement)
  useEffect(() => {
    if (!myId || isAdmin) return;
    const mesAffectations = data.affectations.filter(a => a.employeId === myId).length;
    if (prevAffectationsCount.current >= 0 && mesAffectations > prevAffectationsCount.current) {
      sendNotification(
        'SK DECO Planning',
        'Nouvelle affectation sur votre planning'
      );
    }
    prevAffectationsCount.current = mesAffectations;
  }, [data.affectations]);

  return null;
}
