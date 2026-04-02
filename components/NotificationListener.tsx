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

  // Alerte absences : employés qui n'ont pas pointé 30min après leur horaire (admin seulement)
  const absenceCheckRef = useRef(false);
  useEffect(() => {
    if (!isAdmin || absenceCheckRef.current) return;
    absenceCheckRef.current = true;
    const todayStr = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const retardataires = data.employes.filter(emp => {
      if (emp.doitPointer === false) return false;
      // Vérifier s'il est affecté aujourd'hui
      const isAffected = data.affectations.some(a =>
        a.employeId === emp.id && a.dateDebut <= todayStr && a.dateFin >= todayStr
      );
      if (!isAffected) return false;
      // Vérifier s'il a déjà pointé
      const hasPointed = data.pointages.some(p =>
        p.employeId === emp.id && p.date === todayStr && p.type === 'debut'
      );
      if (hasPointed) return false;
      // Vérifier son horaire prévu
      const dow = now.getDay(); // 0=dim
      const horaire = emp.horaires?.[dow];
      if (!horaire?.actif || !horaire.debut) return false;
      const [h, m] = horaire.debut.split(':').map(Number);
      const heureDebut = h * 60 + m;
      // En retard de plus de 30min
      return nowMinutes > heureDebut + 30;
    });

    if (retardataires.length > 0) {
      const noms = retardataires.map(e => e.prenom).join(', ');
      sendNotification(
        'SK DECO — Absences',
        `${retardataires.length} employé(s) non pointé(s) : ${noms}`
      );
    }
  }, [data.pointages, data.employes, data.affectations, isAdmin]);

  return null;
}
