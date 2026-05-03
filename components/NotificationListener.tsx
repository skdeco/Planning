import { useEffect, useRef, useMemo } from 'react';
import { useApp } from '@/app/context/AppContext';
import { useNotifications, sendPushNotification } from '@/hooks/useNotifications';
import { todayYMD } from '@/lib/date/today';

/**
 * Récupère les push tokens de l'admin (employés avec role 'admin' ou lié via adminEmployeId).
 */
function getAdminPushTokens(employes: any[], adminEmployeId?: string): string[] {
  const tokens: string[] = [];
  // Admin lié à un employé
  if (adminEmployeId) {
    const emp = employes.find(e => e.id === adminEmployeId);
    if (emp?.pushToken) tokens.push(emp.pushToken);
  }
  // Tous les employés avec role 'admin'
  employes.forEach(e => {
    if (e.role === 'admin' && e.pushToken && !tokens.includes(e.pushToken)) {
      tokens.push(e.pushToken);
    }
  });
  return tokens;
}

/**
 * Récupère les push tokens des employés affectés à un chantier (sauf l'expéditeur).
 */
function getChantierEmployeeTokens(chantierId: string, excludeId: string, affectations: any[], employes: any[]): string[] {
  const todayStr = todayYMD();
  const employeIds = new Set(
    affectations
      .filter(a => a.chantierId === chantierId && a.employeId !== excludeId && a.dateDebut <= todayStr && a.dateFin >= todayStr)
      .map(a => a.employeId)
  );
  return employes
    .filter(e => employeIds.has(e.id) && e.pushToken)
    .map(e => e.pushToken!);
}

/**
 * Récupère le push token d'un sous-traitant par son ID.
 */
function getSTToken(sousTraitants: any[], stId: string): string[] {
  const st = sousTraitants.find(s => s.id === stId);
  return st?.pushToken ? [st.pushToken] : [];
}

/**
 * Composant invisible qui écoute les changements de données
 * et envoie des notifications push quand c'est pertinent.
 */
export function NotificationListener() {
  const { data, currentUser } = useApp();
  const { sendNotification } = useNotifications();

  const isAdmin = currentUser?.role === 'admin';
  const isST = currentUser?.role === 'soustraitant';
  const myId = currentUser?.employeId || currentUser?.soustraitantId || '';
  const myRole = currentUser?.role;

  // Chantiers de l'employé (pour les notifications notes/photos)
  const mesChantiersIds = useMemo(() => {
    if (!myId || isAdmin) return new Set<string>();
    return new Set(data.affectations.filter(a => a.employeId === myId).map(a => a.chantierId));
  }, [data.affectations, myId, isAdmin]);

  // Refs pour tracker les compteurs précédents
  const prevMsgsCount = useRef(-1);
  const prevDemandesCount = useRef(-1);
  const prevAffectationsCount = useRef(-1);
  const prevNotesCount = useRef(-1);
  const prevPhotosCount = useRef(-1);
  const prevCongesCount = useRef(-1);
  // Admin : tracker tout
  const prevPointagesCount = useRef(-1);
  const prevNotesChantierCount = useRef(-1);
  const prevPhotosChantierCount = useRef(-1);
  const prevMaterielCount = useRef(-1);
  const prevArretsMaladieCount = useRef(-1);
  const prevNotesPlanningCount = useRef(-1);

  // ── Messages privés — DÉSACTIVÉ (messagerie cachée côté UI, plus de notif) ──
  useEffect(() => {
    if (true) return; // Messagerie désactivée — réversible : retirer cette ligne
    const msgs = data.messagesPrive || [];
    const nonLus = isAdmin
      ? msgs.filter(m => !m.lu && m.expediteurRole !== 'admin').length
      : msgs.filter(m => m.conversationId === myId && !m.lu && m.expediteurRole === 'admin').length;

    if (prevMsgsCount.current >= 0 && nonLus > prevMsgsCount.current) {
      const diff = nonLus - prevMsgsCount.current;
      const msg = `${diff} nouveau${diff > 1 ? 'x' : ''} message${diff > 1 ? 's' : ''}`;
      sendNotification('SK DECO Planning', msg);
      if (isAdmin) {
        // Admin envoie → push vers tous les employés et ST avec pushToken
        const empTokens = data.employes.filter(e => e.pushToken && e.id !== myId).map(e => e.pushToken!);
        const stTokens = data.sousTraitants.filter(s => s.pushToken).map(s => s.pushToken!);
        sendPushNotification([...empTokens, ...stTokens], 'SK DECO Planning', msg);
      } else {
        // Employé ou ST envoie → push vers l'admin
        const adminTokens = getAdminPushTokens(data.employes, data.adminEmployeId);
        sendPushNotification(adminTokens, 'SK DECO Planning', msg);
      }
    }
    prevMsgsCount.current = nonLus;
  }, [data.messagesPrive]);

  // ── Demandes RH (admin/RH seulement) ──────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    const nbEnAttente = (
      (data.demandesConge || []).filter(d => d.statut === 'en_attente').length +
      (data.arretsMaladie || []).filter(d => d.statut === 'en_attente').length +
      (data.demandesAvance || []).filter(d => d.statut === 'en_attente').length
    );
    if (prevDemandesCount.current >= 0 && nbEnAttente > prevDemandesCount.current) {
      sendNotification('SK DECO Planning — RH', 'Nouvelle demande en attente de validation');
    }
    prevDemandesCount.current = nbEnAttente;
  }, [data.demandesConge, data.arretsMaladie, data.demandesAvance]);

  // ── Admin : pointage employé → push vers admin ────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    const nbPointages = data.pointages.length;
    if (prevPointagesCount.current >= 0 && nbPointages > prevPointagesCount.current) {
      const derniers = data.pointages.slice(-1)[0];
      if (derniers) {
        const emp = data.employes.find(e => e.id === derniers.employeId);
        const label = derniers.type === 'debut' ? 'Arrivée' : 'Départ';
        const msg = `${label} de ${emp?.prenom || 'Employé'} à ${derniers.heure}`;
        sendNotification('Pointage', msg);
      }
    }
    prevPointagesCount.current = nbPointages;
  }, [data.pointages]);

  // ── Employé pointe → push vers admin (depuis le côté employé) ─────────────
  useEffect(() => {
    if (isAdmin || !myId) return;
    const mesPointages = data.pointages.filter(p => p.employeId === myId).length;
    // On ne track pas ici, juste envoyer le push quand l'employé lui-même pointe
    // Le push est géré côté employé pour éviter les doublons
  }, []);

  // ── Note chantier → push vers admin + employés du chantier ────────────────
  useEffect(() => {
    if (!isAdmin) return;
    const nb = (data.notesChantier || []).length;
    if (prevNotesChantierCount.current >= 0 && nb > prevNotesChantierCount.current) {
      const derniere = (data.notesChantier || []).slice(-1)[0];
      if (derniere && derniere.auteurId !== 'admin') {
        const ch = data.chantiers.find(c => c.id === derniere.chantierId);
        const msg = `${derniere.auteurNom} sur ${ch?.nom || 'chantier'}`;
        sendNotification('Note chantier', msg);
      }
    }
    prevNotesChantierCount.current = nb;
  }, [data.notesChantier]);

  // ── Photo chantier → push vers admin + employés du chantier ───────────────
  useEffect(() => {
    if (!isAdmin) return;
    const nb = (data.photosChantier || []).length;
    if (prevPhotosChantierCount.current >= 0 && nb > prevPhotosChantierCount.current) {
      const derniere = (data.photosChantier || []).slice(-1)[0];
      if (derniere) {
        const emp = data.employes.find(e => e.id === derniere.employeId);
        const ch = data.chantiers.find(c => c.id === derniere.chantierId);
        const msg = `${emp?.prenom || 'Employé'} sur ${ch?.nom || 'chantier'}`;
        sendNotification('Photo ajoutée', msg);
      }
    }
    prevPhotosChantierCount.current = nb;
  }, [data.photosChantier]);

  // ── Matériel → push vers admin ────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    const nbItems = (data.listesMateriaux || []).reduce((acc, l) => acc + l.items.length, 0);
    if (prevMaterielCount.current >= 0 && nbItems > prevMaterielCount.current) {
      sendNotification('Matériel', 'Nouvel article ajouté à une liste');
    }
    prevMaterielCount.current = nbItems;
  }, [data.listesMateriaux]);

  // ── Arrêt maladie → push vers admin ───────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    const nb = (data.arretsMaladie || []).length;
    if (prevArretsMaladieCount.current >= 0 && nb > prevArretsMaladieCount.current) {
      const dernier = (data.arretsMaladie || []).slice(-1)[0];
      if (dernier) {
        const emp = data.employes.find(e => e.id === dernier.employeId);
        sendNotification('Arrêt maladie', `Déclaration de ${emp?.prenom || 'Employé'}`);
      }
    }
    prevArretsMaladieCount.current = nb;
  }, [data.arretsMaladie]);

  // ── Notes planning → push vers admin ──────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    const nbNotes = data.affectations.reduce((acc, a) => acc + (a.notes || []).length, 0);
    if (prevNotesPlanningCount.current >= 0 && nbNotes > prevNotesPlanningCount.current) {
      sendNotification('Note planning', 'Nouvelle note ajoutée par un employé');
    }
    prevNotesPlanningCount.current = nbNotes;
  }, [data.affectations]);

  // ══════════════════════════════════════════════════════════════════════════
  // CÔTÉ EMPLOYÉ / SOUS-TRAITANT : notifications reçues
  // ══════════════════════════════════════════════════════════════════════════

  // Nouvelle affectation → notification locale employé ou ST
  useEffect(() => {
    if (!myId || isAdmin) return;
    const mesAffectations = isST
      ? data.affectations.filter(a => a.soustraitantId === myId).length
      : data.affectations.filter(a => a.employeId === myId).length;
    if (prevAffectationsCount.current >= 0 && mesAffectations > prevAffectationsCount.current) {
      sendNotification('SK DECO Planning', 'Nouvelle affectation sur votre planning');
    }
    prevAffectationsCount.current = mesAffectations;
  }, [data.affectations]);

  // Note sur un chantier de l'employé → notification locale
  useEffect(() => {
    if (!myId || isAdmin) return;
    const mesNotes = (data.notesChantier || []).filter(n => mesChantiersIds.has(n.chantierId) && n.auteurId !== myId).length;
    if (prevNotesCount.current >= 0 && mesNotes > prevNotesCount.current) {
      sendNotification('SK DECO Planning', 'Nouvelle note sur votre chantier');
    }
    prevNotesCount.current = mesNotes;
  }, [data.notesChantier]);

  // Photo sur un chantier de l'employé → notification locale
  useEffect(() => {
    if (!myId || isAdmin) return;
    const mesPhotos = (data.photosChantier || []).filter(p => mesChantiersIds.has(p.chantierId) && p.employeId !== myId).length;
    if (prevPhotosCount.current >= 0 && mesPhotos > prevPhotosCount.current) {
      sendNotification('SK DECO Planning', 'Nouvelle photo sur votre chantier');
    }
    prevPhotosCount.current = mesPhotos;
  }, [data.photosChantier]);

  // Demande RH traitée → notification locale employé
  useEffect(() => {
    if (!myId || isAdmin) return;
    const mesCongesTraites = [
      ...(data.demandesConge || []).filter(d => d.employeId === myId && d.statut !== 'en_attente'),
      ...(data.demandesAvance || []).filter(d => d.employeId === myId && d.statut !== 'en_attente'),
    ].length;
    if (prevCongesCount.current >= 0 && mesCongesTraites > prevCongesCount.current) {
      sendNotification('SK DECO — RH', 'Votre demande a été traitée');
    }
    prevCongesCount.current = mesCongesTraites;
  }, [data.demandesConge, data.demandesAvance]);

  // ══════════════════════════════════════════════════════════════════════════
  // PUSH NOTIFICATIONS : envoi vers les AUTRES appareils
  // ══════════════════════════════════════════════════════════════════════════

  // Employé fait une action → push vers admin
  // (pointage, note chantier, photo, matériel, arrêt maladie, note planning)
  const prevPushPointages = useRef(-1);
  useEffect(() => {
    if (isAdmin || !myId) return;
    const mesPointages = data.pointages.filter(p => p.employeId === myId).length;
    if (prevPushPointages.current >= 0 && mesPointages > prevPushPointages.current) {
      const dernier = data.pointages.filter(p => p.employeId === myId).slice(-1)[0];
      if (dernier) {
        const emp = data.employes.find(e => e.id === myId);
        const label = dernier.type === 'debut' ? 'Arrivée' : 'Départ';
        const msg = `${label} de ${emp?.prenom || 'Employé'} à ${dernier.heure}`;
        const adminTokens = getAdminPushTokens(data.employes, data.adminEmployeId);
        sendPushNotification(adminTokens, 'Pointage', msg);
      }
    }
    prevPushPointages.current = mesPointages;
  }, [data.pointages]);

  const prevPushNotesChantier = useRef(-1);
  useEffect(() => {
    if (isAdmin || !myId) return;
    const nb = (data.notesChantier || []).filter(n => n.auteurId === myId).length;
    if (prevPushNotesChantier.current >= 0 && nb > prevPushNotesChantier.current) {
      const derniere = (data.notesChantier || []).filter(n => n.auteurId === myId).slice(-1)[0];
      if (derniere) {
        const ch = data.chantiers.find(c => c.id === derniere.chantierId);
        const msg = `${derniere.auteurNom} sur ${ch?.nom || 'chantier'}`;
        // Push vers admin
        const adminTokens = getAdminPushTokens(data.employes, data.adminEmployeId);
        sendPushNotification(adminTokens, 'Note chantier', msg);
        // Push vers les collègues du chantier
        const colleagueTokens = getChantierEmployeeTokens(derniere.chantierId, myId, data.affectations, data.employes);
        if (colleagueTokens.length > 0) {
          sendPushNotification(colleagueTokens, 'Note chantier', msg);
        }
      }
    }
    prevPushNotesChantier.current = nb;
  }, [data.notesChantier]);

  const prevPushPhotosChantier = useRef(-1);
  useEffect(() => {
    if (isAdmin || !myId) return;
    const nb = (data.photosChantier || []).filter(p => p.employeId === myId).length;
    if (prevPushPhotosChantier.current >= 0 && nb > prevPushPhotosChantier.current) {
      const derniere = (data.photosChantier || []).filter(p => p.employeId === myId).slice(-1)[0];
      if (derniere) {
        const emp = data.employes.find(e => e.id === myId);
        const ch = data.chantiers.find(c => c.id === derniere.chantierId);
        const msg = `${emp?.prenom || 'Employé'} sur ${ch?.nom || 'chantier'}`;
        // Push vers admin
        const adminTokens = getAdminPushTokens(data.employes, data.adminEmployeId);
        sendPushNotification(adminTokens, 'Photo ajoutée', msg);
        // Push vers les collègues du chantier
        const colleagueTokens = getChantierEmployeeTokens(derniere.chantierId, myId, data.affectations, data.employes);
        if (colleagueTokens.length > 0) {
          sendPushNotification(colleagueTokens, 'Photo chantier', msg);
        }
      }
    }
    prevPushPhotosChantier.current = nb;
  }, [data.photosChantier]);

  const prevPushMateriel = useRef(-1);
  useEffect(() => {
    if (isAdmin || !myId) return;
    const nbItems = (data.listesMateriaux || []).reduce((acc, l) => acc + l.items.length, 0);
    if (prevPushMateriel.current >= 0 && nbItems > prevPushMateriel.current) {
      const adminTokens = getAdminPushTokens(data.employes, data.adminEmployeId);
      const emp = data.employes.find(e => e.id === myId);
      sendPushNotification(adminTokens, 'Matériel', `${emp?.prenom || 'Employé'} a ajouté un article`);
    }
    prevPushMateriel.current = nbItems;
  }, [data.listesMateriaux]);

  const prevPushMaladie = useRef(-1);
  useEffect(() => {
    if (isAdmin || !myId) return;
    const nb = (data.arretsMaladie || []).filter(a => a.employeId === myId).length;
    if (prevPushMaladie.current >= 0 && nb > prevPushMaladie.current) {
      const emp = data.employes.find(e => e.id === myId);
      const adminTokens = getAdminPushTokens(data.employes, data.adminEmployeId);
      sendPushNotification(adminTokens, 'Arrêt maladie', `Déclaration de ${emp?.prenom || 'Employé'}`);
    }
    prevPushMaladie.current = nb;
  }, [data.arretsMaladie]);

  // Admin fait une action → push vers les employés concernés
  const prevPushAdminAffectations = useRef(-1);
  useEffect(() => {
    if (!isAdmin) return;
    const nb = data.affectations.length;
    if (prevPushAdminAffectations.current >= 0 && nb > prevPushAdminAffectations.current) {
      // Nouvelle affectation : push vers l'employé concerné
      const derniere = data.affectations.slice(-1)[0];
      if (derniere) {
        const emp = data.employes.find(e => e.id === derniere.employeId);
        if (emp?.pushToken) {
          const ch = data.chantiers.find(c => c.id === derniere.chantierId);
          sendPushNotification([emp.pushToken], 'Nouvelle affectation', `${ch?.nom || 'Chantier'} — consultez votre planning`);
        }
      }
    }
    prevPushAdminAffectations.current = nb;
  }, [data.affectations]);

  // Admin traite une demande RH → push vers l'employé
  const prevPushAdminRH = useRef(-1);
  useEffect(() => {
    if (!isAdmin) return;
    const traitees = [
      ...(data.demandesConge || []).filter(d => d.statut !== 'en_attente'),
      ...(data.demandesAvance || []).filter(d => d.statut !== 'en_attente'),
    ].length;
    if (prevPushAdminRH.current >= 0 && traitees > prevPushAdminRH.current) {
      // Trouver la dernière traitée
      const toutesTraitees = [
        ...(data.demandesConge || []).filter(d => d.statut !== 'en_attente'),
        ...(data.demandesAvance || []).filter(d => d.statut !== 'en_attente'),
      ];
      const derniere = toutesTraitees.slice(-1)[0];
      if (derniere) {
        const emp = data.employes.find(e => e.id === derniere.employeId);
        if (emp?.pushToken) {
          const statut = derniere.statut === 'approuve' ? 'approuvée' : 'refusée';
          sendPushNotification([emp.pushToken], 'SK DECO — RH', `Votre demande a été ${statut}`);
        }
      }
    }
    prevPushAdminRH.current = traitees;
  }, [data.demandesConge, data.demandesAvance]);

  // Admin ajoute note chantier → push vers employés et ST du chantier
  const prevPushAdminNotes = useRef(-1);
  useEffect(() => {
    if (!isAdmin) return;
    const nb = (data.notesChantier || []).length;
    if (prevPushAdminNotes.current >= 0 && nb > prevPushAdminNotes.current) {
      const derniere = (data.notesChantier || []).slice(-1)[0];
      if (derniere && derniere.auteurId === 'admin') {
        const ch = data.chantiers.find(c => c.id === derniere.chantierId);
        const msg = `Nouvelle note sur ${ch?.nom || 'chantier'}`;
        // Push employés
        const empTokens = getChantierEmployeeTokens(derniere.chantierId, '', data.affectations, data.employes);
        // Push ST affectés au chantier
        const stIds = new Set(data.affectations.filter(a => a.chantierId === derniere.chantierId && a.soustraitantId).map(a => a.soustraitantId!));
        const stTokens = data.sousTraitants.filter(s => stIds.has(s.id) && s.pushToken).map(s => s.pushToken!);
        const allTokens = [...empTokens, ...stTokens];
        if (allTokens.length > 0) {
          sendPushNotification(allTokens, 'Note chantier', msg);
        }
      }
    }
    prevPushAdminNotes.current = nb;
  }, [data.notesChantier]);

  // Admin affecte un ST → push vers le ST
  const prevPushAdminSTAffectations = useRef(-1);
  useEffect(() => {
    if (!isAdmin) return;
    const stAffectations = data.affectations.filter(a => a.soustraitantId).length;
    if (prevPushAdminSTAffectations.current >= 0 && stAffectations > prevPushAdminSTAffectations.current) {
      const derniere = data.affectations.filter(a => a.soustraitantId).slice(-1)[0];
      if (derniere?.soustraitantId) {
        const ch = data.chantiers.find(c => c.id === derniere.chantierId);
        const stTokens = getSTToken(data.sousTraitants, derniere.soustraitantId);
        if (stTokens.length > 0) {
          sendPushNotification(stTokens, 'Nouvelle affectation', `${ch?.nom || 'Chantier'} — consultez votre planning`);
        }
      }
    }
    prevPushAdminSTAffectations.current = stAffectations;
  }, [data.affectations]);

  // ── Alerte absences au lancement (admin seulement) ────────────────────────
  const absenceCheckRef = useRef(false);
  useEffect(() => {
    if (!isAdmin || absenceCheckRef.current) return;
    absenceCheckRef.current = true;
    const todayStr = todayYMD();
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const retardataires = data.employes.filter(emp => {
      if (emp.doitPointer === false) return false;
      const isAffected = data.affectations.some(a =>
        a.employeId === emp.id && a.dateDebut <= todayStr && a.dateFin >= todayStr
      );
      if (!isAffected) return false;
      const hasPointed = data.pointages.some(p =>
        p.employeId === emp.id && p.date === todayStr && p.type === 'debut'
      );
      if (hasPointed) return false;
      const dow = now.getDay();
      const horaire = emp.horaires?.[dow];
      if (!horaire?.actif || !horaire.debut) return false;
      const [h, m] = horaire.debut.split(':').map(Number);
      const heureDebut = h * 60 + m;
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
