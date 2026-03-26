import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  TextInput, Platform, Alert,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { useRouter } from 'expo-router';
import type {
  DemandeConge, ArretMaladie, DemandeAvance, FichePaie,
} from '@/app/types';
import {
  STATUT_DEMANDE_LABELS, STATUT_DEMANDE_COLORS,
} from '@/app/types';
import { DateField } from '@/components/DatePickerModal';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function genId() { return `rh_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
function now() { return new Date().toISOString(); }
function formatDate(ymd: string) {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}
function formatMois(ym: string) {
  if (!ym) return '—';
  const MOIS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const [y, m] = ym.split('-');
  return `${MOIS[parseInt(m, 10) - 1]} ${y}`;
}

type Tab = 'conges' | 'maladie' | 'avances' | 'paies';

export default function RHScreen() {
  const {
    data, currentUser, isHydrated,
    addDemandeConge, updateDemandeConge, deleteDemandeConge,
    addArretMaladie, updateArretMaladie, deleteArretMaladie,
    addDemandeAvance, updateDemandeAvance, deleteDemandeAvance,
    addFichePaie, deleteFichePaie,
    addAcompte,
  } = useApp();
  const { t } = useLanguage();

  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !currentUser) router.replace('/login' as any);
  }, [isHydrated, currentUser, router]);

  const isAdmin = currentUser?.role === 'admin';
  const currentEmploye = data.employes.find(e => e.id === currentUser?.employeId);
  const isRH = isAdmin || currentEmploye?.isRH === true;

  const [activeTab, setActiveTab] = useState<Tab>('conges');

  // ─── Filtrage selon le rôle ───────────────────────────────────────────────
  const myId = currentUser?.employeId;

  const conges = useMemo(() => {
    const all = data.demandesConge || [];
    if (isRH) return all;
    return all.filter(d => d.employeId === myId);
  }, [data.demandesConge, isRH, myId]);

  const arrets = useMemo(() => {
    const all = data.arretsMaladie || [];
    if (isRH) return all;
    return all.filter(d => d.employeId === myId);
  }, [data.arretsMaladie, isRH, myId]);

  const avances = useMemo(() => {
    const all = data.demandesAvance || [];
    if (isRH) return all;
    return all.filter(d => d.employeId === myId);
  }, [data.demandesAvance, isRH, myId]);

  const paies = useMemo(() => {
    const all = data.fichesPaie || [];
    // Admin/RH voit tout, employé voit seulement les siennes
    const filtered = isRH ? all : all.filter(d => d.employeId === myId);
    // Trier par mois décroissant (plus récent en premier)
    return [...filtered].sort((a, b) => b.mois.localeCompare(a.mois));
  }, [data.fichesPaie, isRH, myId]);

  // Fiches de paie groupées par année
  const paiesParAnnee = useMemo(() => {
    const groups: Record<string, typeof paies> = {};
    paies.forEach(f => {
      const annee = f.mois.substring(0, 4);
      if (!groups[annee]) groups[annee] = [];
      groups[annee].push(f);
    });
    // Trier les années décroissant
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [paies]);

  // ─── Badges de notification ─────────────────────────────────────────────
  const nbEnAttente = useMemo(() => {
    if (!isRH) return 0;
    return (
      conges.filter(d => d.statut === 'en_attente').length +
      arrets.filter(d => d.statut === 'en_attente').length +
      avances.filter(d => d.statut === 'en_attente').length
    );
  }, [isRH, conges, arrets, avances]);

  // Détection des demandes "nouvelles" (créées dans les dernières 24h)
  const cutoff24h = useMemo(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), []);
  const isNouveau = (createdAt: string) => createdAt > cutoff24h;

  // Tri : en_attente en premier, puis par date décroissante
  const congesTries = useMemo(() =>
    [...conges].sort((a, b) => {
      if (a.statut === 'en_attente' && b.statut !== 'en_attente') return -1;
      if (b.statut === 'en_attente' && a.statut !== 'en_attente') return 1;
      return b.createdAt.localeCompare(a.createdAt);
    }), [conges]);
  const arretsTries = useMemo(() =>
    [...arrets].sort((a, b) => {
      if (a.statut === 'en_attente' && b.statut !== 'en_attente') return -1;
      if (b.statut === 'en_attente' && a.statut !== 'en_attente') return 1;
      return b.createdAt.localeCompare(a.createdAt);
    }), [arrets]);
  const avancesTries = useMemo(() =>
    [...avances].sort((a, b) => {
      if (a.statut === 'en_attente' && b.statut !== 'en_attente') return -1;
      if (b.statut === 'en_attente' && a.statut !== 'en_attente') return 1;
      return b.createdAt.localeCompare(a.createdAt);
    }), [avances]);

  // ─── Modals ───────────────────────────────────────────────────────────────
  // Congés
  const [showCongeModal, setShowCongeModal] = useState(false);
  const [congeForm, setCongeForm] = useState({ dateDebut: '', dateFin: '', motif: '', employeId: '' });
  const [editConge, setEditConge] = useState<DemandeConge | null>(null);

  // Arrêt maladie
  const [showArretModal, setShowArretModal] = useState(false);
  const [arretForm, setArretForm] = useState({ dateDebut: '', dateFin: '', commentaire: '', justificatif: '', justificatifNom: '', employeId: '' });
  const [editArret, setEditArret] = useState<ArretMaladie | null>(null);

  // Avance
  const [showAvanceModal, setShowAvanceModal] = useState(false);
  const [avanceForm, setAvanceForm] = useState({ montant: '', motif: '', employeId: '' });

  // Fiche de paie - sélecteur mois/année
  const [showPaieModal, setShowPaieModal] = useState(false);
  const [paieEmployeId, setPaieEmployeId] = useState<string>('');
  const [paieMois, setPaieMois] = useState<string>('');
  const [paieAnnee, setPaieAnnee] = useState<string>(new Date().getFullYear().toString());
  const MOIS_LABELS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const ANNEES_LABELS = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());
  const [editAvance, setEditAvance] = useState<DemandeAvance | null>(null);

  // Réponse RH (admin/RH uniquement)
  const [showReponseModal, setShowReponseModal] = useState(false);
  const [reponseTarget, setReponseTarget] = useState<{ type: 'conge' | 'arret' | 'avance'; id: string } | null>(null);
  const [reponseForm, setReponseForm] = useState({ statut: 'approuve' as 'approuve' | 'refuse', commentaire: '' });

  // ─── Helpers employé ─────────────────────────────────────────────────────
  const getEmployeNom = (id: string) => {
    const e = data.employes.find(x => x.id === id);
    return e ? `${e.prenom} ${e.nom}` : '—';
  };

  // ─── Actions congés ──────────────────────────────────────────────────────
  const handleSaveConge = () => {
    if (!congeForm.dateDebut || !congeForm.dateFin) return;
    // Admin/RH peut créer pour un employé spécifique, sinon pour soi-même
    const employeId = editConge
      ? editConge.employeId
      : (isRH && congeForm.employeId ? congeForm.employeId : (myId || 'admin'));
    if (editConge) {
      updateDemandeConge({ ...editConge, dateDebut: congeForm.dateDebut, dateFin: congeForm.dateFin, motif: congeForm.motif, updatedAt: now() });
    } else {
      addDemandeConge({ id: genId(), employeId, dateDebut: congeForm.dateDebut, dateFin: congeForm.dateFin, motif: congeForm.motif, statut: 'en_attente', createdAt: now(), updatedAt: now() });
    }
    setShowCongeModal(false);
    setEditConge(null);
    setCongeForm({ dateDebut: '', dateFin: '', motif: '', employeId: '' });
  };

  const handleDeleteConge = (id: string) => {
    const doDelete = () => deleteDemandeConge(id);
    if (Platform.OS === 'web') { if ((typeof window !== 'undefined' && window.confirm ? window.confirm('Supprimer cette demande ?') : true)) doDelete(); }
    else Alert.alert('Supprimer ?', '', [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: doDelete }]);
  };

  // ─── Actions arrêt maladie ───────────────────────────────────────────────
  const handleSaveArret = () => {
    if (!arretForm.dateDebut) return;
    const employeId = editArret
      ? editArret.employeId
      : (isRH && arretForm.employeId ? arretForm.employeId : (myId || 'admin'));
    if (editArret) {
      updateArretMaladie({ ...editArret, dateDebut: arretForm.dateDebut, dateFin: arretForm.dateFin || undefined, justificatif: arretForm.justificatif || undefined, updatedAt: now() });
    } else {
      addArretMaladie({ id: genId(), employeId, dateDebut: arretForm.dateDebut, dateFin: arretForm.dateFin || undefined, justificatif: arretForm.justificatif || undefined, statut: 'en_attente', createdAt: now(), updatedAt: now() });
    }
    setShowArretModal(false);
    setEditArret(null);
    setArretForm({ dateDebut: '', dateFin: '', commentaire: '', justificatif: '', justificatifNom: '', employeId: '' });
  };

  // ─── Actions avance ──────────────────────────────────────────────────────
  const handleSaveAvance = () => {
    const montant = parseFloat(avanceForm.montant);
    if (!montant || montant <= 0) return;
    const employeId = isRH && avanceForm.employeId ? avanceForm.employeId : (myId || 'admin');
    if (editAvance) {
      updateDemandeAvance({ ...editAvance, montant, motif: avanceForm.motif, updatedAt: now() });
    } else {
      addDemandeAvance({ id: genId(), employeId, montant, motif: avanceForm.motif, statut: 'en_attente', createdAt: now(), updatedAt: now() });
    }
    setShowAvanceModal(false);
    setEditAvance(null);
    setAvanceForm({ montant: '', motif: '', employeId: '' });
  };

  // ─── Réponse RH ──────────────────────────────────────────────────────────
  const handleSaveReponse = () => {
    if (!reponseTarget) return;
    const { type, id } = reponseTarget;
    if (type === 'conge') {
      const d = conges.find(x => x.id === id);
      if (d) updateDemandeConge({ ...d, statut: reponseForm.statut, commentaireRH: reponseForm.commentaire, updatedAt: now() });
    } else if (type === 'arret') {
      const d = arrets.find(x => x.id === id);
      if (d) updateArretMaladie({ ...d, statut: reponseForm.statut, commentaireRH: reponseForm.commentaire, updatedAt: now() });
    } else if (type === 'avance') {
      const d = avances.find(x => x.id === id);
      if (d) {
        updateDemandeAvance({ ...d, statut: reponseForm.statut, commentaireRH: reponseForm.commentaire, updatedAt: now() });
        // Si approuvée, enregistrer comme acompte payé dans la table des acomptes
        if (reponseForm.statut === 'approuve') {
          addAcompte({
            id: genId(),
            employeId: d.employeId,
            montant: d.montant,
            date: now().slice(0, 10),
            commentaire: d.motif || 'Acompte approuvé (demande RH)',
            createdAt: now(),
          });
        }
      }
    }
    setShowReponseModal(false);
    setReponseTarget(null);
  };

  // ─── Upload fiche de paie avec sélecteur mois/année ──────────────────────────────────────────────────────────
  const handleUploadPaie = (employeId: string) => {
    // Ouvrir le modal de sélection mois/année
    setPaieEmployeId(employeId);
    setPaieMois('');
    setPaieAnnee(new Date().getFullYear().toString());
    setShowPaieModal(true);
  };

  const handleConfirmPaieUpload = () => {
    if (!paieMois || !paieAnnee || !paieEmployeId) return;
    if (Platform.OS !== 'web') { setShowPaieModal(false); return; }
    const moisNum = (MOIS_LABELS.indexOf(paieMois) + 1).toString().padStart(2, '0');
    const moisKey = `${paieAnnee}-${moisNum}`;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) { document.body.removeChild(input); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const uri = ev.target?.result as string;
        addFichePaie({ id: genId(), employeId: paieEmployeId, mois: moisKey, fichier: uri, uploadedAt: now() });
        setShowPaieModal(false);
      };
      reader.readAsDataURL(file);
      document.body.removeChild(input);
    };
    input.click();
  };

  // ─── Statut badge ────────────────────────────────────────────────────────────────────
  const StatutBadge = ({ statut }: { statut: string }) => {
    const colors = STATUT_DEMANDE_COLORS[statut as keyof typeof STATUT_DEMANDE_COLORS] || { bg: '#eee', text: '#333' };
    const label = STATUT_DEMANDE_LABELS[statut as keyof typeof STATUT_DEMANDE_LABELS] || statut;
    return (
      <View style={[styles.statutBadge, { backgroundColor: colors.bg }]}>
        <Text style={[styles.statutBadgeText, { color: colors.text }]}>{label}</Text>
      </View>
    );
  };

  // ─── Rendu ────────────────────────────────────────────────────────────────
  return (
    <ScreenContainer containerClassName="bg-[#F2F4F7]" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>👥 {t.rh.title}</Text>
        {nbEnAttente > 0 && (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{nbEnAttente} {t.rh.pending}</Text>
          </View>
        )}
      </View>

      {/* Onglets */}
      <View style={styles.tabs}>
        {([
          { key: 'conges', label: `🏖 ${t.rh.leaves}`, count: isRH ? conges.filter(d => d.statut === 'en_attente').length : 0 },
          { key: 'maladie', label: `🤒 ${t.rh.sick}`, count: isRH ? arrets.filter(d => d.statut === 'en_attente').length : 0 },
          { key: 'avances', label: `💶 ${t.rh.advances}`, count: isRH ? avances.filter(d => d.statut === 'en_attente').length : 0 },
          { key: 'paies', label: `📄 ${t.rh.payslips}`, count: 0 },
        ] as const).map(tab => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
            {tab.count > 0 && (
              <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{tab.count}</Text></View>
            )}
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── Congés ── */}
        {activeTab === 'conges' && (
          <>
            {/* Tout employé (y compris RH) peut faire une demande pour lui-même */}
            {/* L'employé RH voit aussi les demandes des autres, mais peut en créer pour lui */}
            <Pressable style={styles.addBtn} onPress={() => { setEditConge(null); setCongeForm({ dateDebut: '', dateFin: '', motif: '', employeId: '' }); setShowCongeModal(true); }}>
              <Text style={styles.addBtnText}>+ {t.rh.newLeaveRequest}</Text>
            </Pressable>
            {congesTries.length === 0 && <Text style={styles.emptyText}>{t.rh.noLeaves}</Text>}
            {congesTries.map(d => (
              <View key={d.id} style={[styles.card, d.statut === 'en_attente' && styles.cardEnAttente]}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    {isRH && <Text style={styles.cardEmploye}>{getEmployeNom(d.employeId)}</Text>}
                    <Text style={styles.cardTitle}>{t.rh.from} {formatDate(d.dateDebut)} {t.rh.to} {formatDate(d.dateFin)}</Text>
                    {d.motif ? <Text style={styles.cardSub}>{t.rh.reason}: {d.motif}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <StatutBadge statut={d.statut} />
                    {isRH && isNouveau(d.createdAt) && d.statut === 'en_attente' && (
                      <View style={styles.nouveauBadge}><Text style={styles.nouveauBadgeText}>{t.rh.new}</Text></View>
                    )}
                  </View>
                </View>
                {d.commentaireRH ? <Text style={styles.cardComment}>💬 {d.commentaireRH}</Text> : null}
                <View style={styles.cardActions}>
                  {isRH && d.statut === 'en_attente' && (
                    <Pressable style={styles.repondreBtn} onPress={() => { setReponseTarget({ type: 'conge', id: d.id }); setReponseForm({ statut: 'approuve', commentaire: '' }); setShowReponseModal(true); }}>
                      <Text style={styles.repondreBtnText}>{t.rh.reply}</Text>
                    </Pressable>
                  )}
                  {(!isRH || d.statut === 'en_attente') && (
                    <Pressable style={styles.deleteBtn} onPress={() => handleDeleteConge(d.id)}>
                      <Text style={styles.deleteBtnText}>{t.common.delete}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Arrêt maladie ── */}
        {activeTab === 'maladie' && (
          <>
            {/* Tout employé (y compris RH) peut déclarer un arrêt pour lui-même */}
            <Pressable style={styles.addBtn} onPress={() => { setEditArret(null); setArretForm({ dateDebut: '', dateFin: '', commentaire: '', justificatif: '', justificatifNom: '', employeId: '' }); setShowArretModal(true); }}>
              <Text style={styles.addBtnText}>+ {t.rh.declareSick}</Text>
            </Pressable>
            {arretsTries.length === 0 && <Text style={styles.emptyText}>{t.rh.noSick}</Text>}
            {arretsTries.map(d => (
              <View key={d.id} style={[styles.card, d.statut === 'en_attente' && styles.cardEnAttente]}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    {isRH && <Text style={styles.cardEmploye}>{getEmployeNom(d.employeId)}</Text>}
                    <Text style={styles.cardTitle}>{t.rh.start}: {formatDate(d.dateDebut)}{d.dateFin ? ` → ${formatDate(d.dateFin)}` : ` (${t.rh.ongoing})`}</Text>
                  {(d as any).justificatif && (
                    <Pressable onPress={() => {
                      if (Platform.OS === 'web') {
                        const win = window.open();
                        if (win) win.document.write(`<iframe src="${(d as any).justificatif}" style="width:100%;height:100%;border:none;"/>`);
                      }
                    }}>
                      <Text style={styles.justificatifLink}>{t.rh.viewProof}</Text>
                    </Pressable>
                  )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <StatutBadge statut={d.statut} />
                    {isRH && isNouveau(d.createdAt) && d.statut === 'en_attente' && (
                      <View style={styles.nouveauBadge}><Text style={styles.nouveauBadgeText}>{t.rh.new}</Text></View>
                    )}
                  </View>
                </View>
                {d.commentaireRH ? <Text style={styles.cardComment}>💬 {d.commentaireRH}</Text> : null}
                <View style={styles.cardActions}>
                  {isRH && d.statut === 'en_attente' && (
                    <Pressable style={styles.repondreBtn} onPress={() => { setReponseTarget({ type: 'arret', id: d.id }); setReponseForm({ statut: 'approuve', commentaire: '' }); setShowReponseModal(true); }}>
                      <Text style={styles.repondreBtnText}>{t.rh.reply}</Text>
                    </Pressable>
                  )}
                  {(!isRH || d.statut === 'en_attente') && (
                    <Pressable style={styles.deleteBtn} onPress={() => deleteArretMaladie(d.id)}>
                      <Text style={styles.deleteBtnText}>{t.common.delete}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Avances ── */}
        {activeTab === 'avances' && (
          <>
            {/* Tout employé (y compris RH) peut demander une avance pour lui-même */}
            <Pressable style={styles.addBtn} onPress={() => { setEditAvance(null); setAvanceForm({ montant: '', motif: '', employeId: '' }); setShowAvanceModal(true); }}>
              <Text style={styles.addBtnText}>+ {t.rh.requestAdvance}</Text>
            </Pressable>
            {avancesTries.length === 0 && <Text style={styles.emptyText}>{t.rh.noAdvances}</Text>}
            {avancesTries.map(d => (
              <View key={d.id} style={[styles.card, d.statut === 'en_attente' && styles.cardEnAttente]}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    {isRH && <Text style={styles.cardEmploye}>{getEmployeNom(d.employeId)}</Text>}
                    <Text style={styles.cardTitle}>{d.montant.toFixed(2)} €</Text>
                    {d.motif ? <Text style={styles.cardSub}>{t.rh.reason}: {d.motif}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <StatutBadge statut={d.statut} />
                    {isRH && isNouveau(d.createdAt) && d.statut === 'en_attente' && (
                      <View style={styles.nouveauBadge}><Text style={styles.nouveauBadgeText}>{t.rh.new}</Text></View>
                    )}
                  </View>
                </View>
                {d.commentaireRH ? <Text style={styles.cardComment}>💬 {d.commentaireRH}</Text> : null}
                <View style={styles.cardActions}>
                  {isRH && d.statut === 'en_attente' && (
                    <Pressable style={styles.repondreBtn} onPress={() => { setReponseTarget({ type: 'avance', id: d.id }); setReponseForm({ statut: 'approuve', commentaire: '' }); setShowReponseModal(true); }}>
                      <Text style={styles.repondreBtnText}>{t.rh.reply}</Text>
                    </Pressable>
                  )}
                  {isRH && (
                    <Pressable
                      style={[styles.deleteBtn, { backgroundColor: '#FDECEA' }]}
                      onPress={() => {
                        const doDelete = () => deleteDemandeAvance(d.id);
                        if (Platform.OS === 'web') {
                          if ((typeof window !== 'undefined' && window.confirm ? window.confirm(`Supprimer la demande d'avance de ${getEmployeNom(d.employeId)} (${d.montant.toFixed(2)} €) ?\nCette action est irréversible.`) : true)) doDelete();
                        } else {
                          Alert.alert(
                            'Supprimer la demande ?',
                            `Avance de ${d.montant.toFixed(2)} € pour ${getEmployeNom(d.employeId)}\nCette action est irréversible.`,
                            [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: doDelete }]
                          );
                        }
                      }}
                    >
                      <Text style={[styles.deleteBtnText, { color: '#E74C3C' }]}>🗑 Supprimer</Text>
                    </Pressable>
                  )}
                  {!isRH && d.statut === 'en_attente' && (
                    <Pressable
                      style={styles.deleteBtn}
                      onPress={() => {
                        const doDelete = () => deleteDemandeAvance(d.id);
                        if (Platform.OS === 'web') {
                          if ((typeof window !== 'undefined' && window.confirm ? window.confirm('Annuler cette demande d\'avance ?') : true)) doDelete();
                        } else {
                          Alert.alert('Annuler la demande ?', '', [{ text: 'Non', style: 'cancel' }, { text: 'Oui, annuler', style: 'destructive', onPress: doDelete }]);
                        }
                      }}
                    >
                      <Text style={styles.deleteBtnText}>Annuler</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Fiches de paie ── */}
        {activeTab === 'paies' && (
          <>
            {isRH && (
              <View style={styles.paieUploadSection}>
                <Text style={styles.paieUploadTitle}>{t.rh.uploadPayslip}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.paieEmployeScroll}>
                  {data.employes.map(emp => (
                    <Pressable key={emp.id} style={[styles.paieEmployeBtn, { borderColor: emp.couleur || '#1A3A6B' }]} onPress={() => handleUploadPaie(emp.id)}>
                      <View style={[styles.paieEmployeAvatar, { backgroundColor: emp.couleur || '#1A3A6B' }]}>
                        <Text style={styles.paieEmployeAvatarText}>{emp.prenom[0]}{emp.nom[0]}</Text>
                      </View>
                      <Text style={styles.paieEmployeNom} numberOfLines={1}>{emp.prenom}</Text>
                      <Text style={styles.paieEmployeAction}>+ {t.rh.upload}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            {paies.length === 0 && <Text style={styles.emptyText}>{t.rh.noPayslips}</Text>}
            {paiesParAnnee.map(([annee, fichesAnnee]) => (
              <View key={annee}>
                <View style={styles.anneeHeader}>
                  <Text style={styles.anneeTitle}>📅 {annee}</Text>
                  <Text style={styles.anneeSub}>{fichesAnnee.length} fiche{fichesAnnee.length > 1 ? 's' : ''}</Text>
                </View>
                {fichesAnnee.map(f => (
                  <View key={f.id} style={styles.card}>
                    {isRH && <Text style={styles.cardEmploye}>{getEmployeNom(f.employeId)}</Text>}
                    <Text style={styles.cardTitle}>📄 {formatMois(f.mois)}</Text>
                    <Text style={styles.cardSub}>Déposée le {new Date(f.uploadedAt).toLocaleDateString('fr-FR')}</Text>
                    <View style={styles.cardActions}>
                      {/* Voir le document */}
                      <Pressable style={styles.voirBtn} onPress={() => {
                        if (Platform.OS === 'web') {
                          const win = window.open();
                          if (win) { win.document.write(`<iframe src="${f.fichier}" style="width:100%;height:100%;border:none;"/>`); }
                        }
                      }}>
                        <Text style={styles.voirBtnText}>{t.common.view}</Text>
                      </Pressable>
                      {/* Télécharger */}
                      <Pressable style={[styles.voirBtn, { backgroundColor: '#EFF6FF' }]} onPress={() => {
                        if (Platform.OS === 'web') {
                          const a = document.createElement('a');
                          a.href = f.fichier;
                          a.download = `fiche-paie-${f.mois}.pdf`;
                          a.click();
                        }
                      }}>
                        <Text style={[styles.voirBtnText, { color: '#1A3A6B' }]}>{t.common.download}</Text>
                      </Pressable>
                      {/* Suppression : admin uniquement (pas RH employé) */}
                      {isAdmin && (
                        <Pressable style={styles.deleteBtn} onPress={() => {
                          const doDelete = () => deleteFichePaie(f.id);
                          if (Platform.OS === 'web') {
                            if ((typeof window !== 'undefined' && window.confirm ? window.confirm(`Supprimer la fiche de paie de ${getEmployeNom(f.employeId)} pour ${formatMois(f.mois)} ?\nCette action est irréversible.`) : true)) doDelete();
                          } else {
                            Alert.alert('Supprimer ?', `Fiche de ${getEmployeNom(f.employeId)} — ${formatMois(f.mois)}`, [
                              { text: 'Annuler', style: 'cancel' },
                              { text: 'Supprimer', style: 'destructive', onPress: doDelete },
                            ]);
                          }
                        }}>
                          <Text style={styles.deleteBtnText}>{t.common.delete}</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* ── Modal demande de congés ── */}
      <Modal visible={showCongeModal} transparent animationType="slide" onRequestClose={() => setShowCongeModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowCongeModal(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{editConge ? t.rh.editRequest : t.rh.leaveRequest}</Text>
            {isRH && !editConge && (
              <>
                <Text style={styles.fieldLabel}>{t.rh.concernedEmployee}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <Pressable
                    style={[styles.empChip, !congeForm.employeId && styles.empChipActive]}
                    onPress={() => setCongeForm(f => ({ ...f, employeId: '' }))}
                  >
                    <Text style={[styles.empChipText, !congeForm.employeId && styles.empChipTextActive]}>{t.rh.myself}</Text>
                  </Pressable>
                  {data.employes.filter(e => e.id !== myId).map(emp => (
                    <Pressable
                      key={emp.id}
                      style={[styles.empChip, congeForm.employeId === emp.id && styles.empChipActive]}
                      onPress={() => setCongeForm(f => ({ ...f, employeId: emp.id }))}
                    >
                      <Text style={[styles.empChipText, congeForm.employeId === emp.id && styles.empChipTextActive]}>{emp.prenom} {emp.nom}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            <DateField
              label={`${t.common.startDate} *`}
              value={congeForm.dateDebut}
              onChange={v => setCongeForm(f => ({ ...f, dateDebut: v }))}
              maxDate={congeForm.dateFin || undefined}
            />
            <DateField
              label={`${t.common.endDate} *`}
              value={congeForm.dateFin}
              onChange={v => setCongeForm(f => ({ ...f, dateFin: v }))}
              minDate={congeForm.dateDebut || undefined}
            />
            <Text style={styles.fieldLabel}>{t.rh.reason} ({t.common.optional})</Text>
            <TextInput style={[styles.input, styles.inputMulti]} placeholder={t.rh.reasonPlaceholder} value={congeForm.motif} onChangeText={v => setCongeForm(f => ({ ...f, motif: v }))} multiline />
            <Pressable style={styles.saveBtn} onPress={handleSaveConge}>
              <Text style={styles.saveBtnText}>{t.rh.sendRequest}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal arrêt maladie ── */}
      <Modal visible={showArretModal} transparent animationType="slide" onRequestClose={() => setShowArretModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowArretModal(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t.rh.declareSick}</Text>
            {isRH && !editArret && (
              <>
                <Text style={styles.fieldLabel}>{t.rh.concernedEmployee}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <Pressable
                    style={[styles.empChip, !arretForm.employeId && styles.empChipActive]}
                    onPress={() => setArretForm(f => ({ ...f, employeId: '' }))}
                  >
                    <Text style={[styles.empChipText, !arretForm.employeId && styles.empChipTextActive]}>{t.rh.myself}</Text>
                  </Pressable>
                  {data.employes.filter(e => e.id !== myId).map(emp => (
                    <Pressable
                      key={emp.id}
                      style={[styles.empChip, arretForm.employeId === emp.id && styles.empChipActive]}
                      onPress={() => setArretForm(f => ({ ...f, employeId: emp.id }))}
                    >
                      <Text style={[styles.empChipText, arretForm.employeId === emp.id && styles.empChipTextActive]}>{emp.prenom} {emp.nom}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            <DateField
              label={`${t.common.startDate} *`}
              value={arretForm.dateDebut}
              onChange={v => setArretForm(f => ({ ...f, dateDebut: v }))}
              maxDate={arretForm.dateFin || undefined}
            />
            <DateField
              label={t.rh.endDateIfKnown}
              value={arretForm.dateFin}
              onChange={v => setArretForm(f => ({ ...f, dateFin: v }))}
              minDate={arretForm.dateDebut || undefined}
            />
            <Text style={styles.fieldLabel}>{t.rh.proof}</Text>
            <Pressable
              style={styles.uploadArretBtn}
              onPress={() => {
                if (Platform.OS === 'web') {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'application/pdf,image/*';
                  input.style.display = 'none';
                  document.body.appendChild(input);
                  input.onchange = (e: Event) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) { document.body.removeChild(input); return; }
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const uri = ev.target?.result as string;
                      setArretForm(f => ({ ...f, justificatif: uri, justificatifNom: file.name }));
                    };
                    reader.readAsDataURL(file);
                    document.body.removeChild(input);
                  };
                  input.click();
                }
              }}
            >
              <Text style={styles.uploadArretBtnText}>
                {arretForm.justificatif ? `✅ ${arretForm.justificatifNom || t.rh.fileLoaded}` : `📎 ${t.rh.attachProof}`}
              </Text>
            </Pressable>
            {arretForm.justificatif ? (
              <Pressable onPress={() => setArretForm(f => ({ ...f, justificatif: '', justificatifNom: '' }))}>
                <Text style={styles.removeFileText}>{t.rh.removeFile}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.saveBtn} onPress={handleSaveArret}>
              <Text style={styles.saveBtnText}>{t.rh.declareSickBtn}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal demande d'avance ── */}
      <Modal visible={showAvanceModal} transparent animationType="slide" onRequestClose={() => setShowAvanceModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowAvanceModal(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t.rh.advanceRequest}</Text>
            {isRH && !editAvance && (
              <>
                <Text style={styles.fieldLabel}>{t.rh.concernedEmployee}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <Pressable
                    style={[styles.empChip, !avanceForm.employeId && styles.empChipActive]}
                    onPress={() => setAvanceForm(f => ({ ...f, employeId: '' }))}
                  >
                    <Text style={[styles.empChipText, !avanceForm.employeId && styles.empChipTextActive]}>{t.rh.myself}</Text>
                  </Pressable>
                  {data.employes.filter(e => e.id !== myId).map(emp => (
                    <Pressable
                      key={emp.id}
                      style={[styles.empChip, avanceForm.employeId === emp.id && styles.empChipActive]}
                      onPress={() => setAvanceForm(f => ({ ...f, employeId: emp.id }))}
                    >
                      <Text style={[styles.empChipText, avanceForm.employeId === emp.id && styles.empChipTextActive]}>{emp.prenom} {emp.nom}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            <Text style={styles.fieldLabel}>{t.rh.amount} *</Text>
            <TextInput style={styles.input} placeholder="Ex: 500" keyboardType="numeric" value={avanceForm.montant} onChangeText={v => setAvanceForm(f => ({ ...f, montant: v }))} />
            <Text style={styles.fieldLabel}>{t.rh.reason} ({t.common.optional})</Text>
            <TextInput style={[styles.input, styles.inputMulti]} placeholder={t.rh.explainNeed} value={avanceForm.motif} onChangeText={v => setAvanceForm(f => ({ ...f, motif: v }))} multiline />
            <Pressable style={styles.saveBtn} onPress={handleSaveAvance}>
              <Text style={styles.saveBtnText}>{t.rh.sendRequest}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal sélection mois/année fiche de paie ── */}
      <Modal visible={showPaieModal} transparent animationType="slide" onRequestClose={() => setShowPaieModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowPaieModal(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t.rh.uploadPayslip}</Text>
            {paieEmployeId && (
              <Text style={[styles.fieldLabel, { marginBottom: 12, color: '#1A3A6B', fontSize: 14 }]}>
                {t.rh.employee}: {getEmployeNom(paieEmployeId)}
              </Text>
            )}
            <Text style={styles.fieldLabel}>{t.rh.year}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {ANNEES_LABELS.map(a => (
                <Pressable
                  key={a}
                  style={[styles.empChip, paieAnnee === a && styles.empChipActive]}
                  onPress={() => setPaieAnnee(a)}
                >
                  <Text style={[styles.empChipText, paieAnnee === a && styles.empChipTextActive]}>{a}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.fieldLabel}>{t.rh.month}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {MOIS_LABELS.map(m => (
                <Pressable
                  key={m}
                  style={[styles.empChip, paieMois === m && styles.empChipActive]}
                  onPress={() => setPaieMois(m)}
                >
                  <Text style={[styles.empChipText, paieMois === m && styles.empChipTextActive]}>{m.slice(0, 3)}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.saveBtn, (!paieMois || !paieAnnee) && { opacity: 0.5 }]}
              onPress={handleConfirmPaieUpload}
              disabled={!paieMois || !paieAnnee}
            >
              <Text style={styles.saveBtnText}>Choisir le fichier</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal réponse RH ── */}
      <Modal visible={showReponseModal} transparent animationType="slide" onRequestClose={() => setShowReponseModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowReponseModal(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Répondre à la demande</Text>
            <View style={styles.statutRow}>
              {(['approuve', 'refuse'] as const).map(s => (
                <Pressable key={s} style={[styles.statutBtn, reponseForm.statut === s && styles.statutBtnActive, { borderColor: s === 'approuve' ? '#27AE60' : '#E74C3C' }]} onPress={() => setReponseForm(f => ({ ...f, statut: s }))}>
                  <Text style={[styles.statutBtnText, reponseForm.statut === s && { color: s === 'approuve' ? '#27AE60' : '#E74C3C' }]}>{s === 'approuve' ? '✅ Approuver' : '❌ Refuser'}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Commentaire (optionnel)</Text>
            <TextInput style={[styles.input, styles.inputMulti]} placeholder="Message pour l'employé..." value={reponseForm.commentaire} onChangeText={v => setReponseForm(f => ({ ...f, commentaire: v }))} multiline />
            <Pressable style={styles.saveBtn} onPress={handleSaveReponse}>
              <Text style={styles.saveBtnText}>Enregistrer la réponse</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E6EA' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A3A6B' },
  headerBadge: { backgroundColor: '#E74C3C', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  headerBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E6EA', paddingHorizontal: 8 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#1A3A6B' },
  tabText: { fontSize: 11, color: '#687076', fontWeight: '500', textAlign: 'center' },
  tabTextActive: { color: '#1A3A6B', fontWeight: '700' },
  tabBadge: { backgroundColor: '#E74C3C', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  addBtn: { backgroundColor: '#1A3A6B', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyText: { textAlign: 'center', color: '#687076', fontSize: 14, marginTop: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardEmploye: { fontSize: 13, fontWeight: '700', color: '#1A3A6B' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#11181C', marginBottom: 4 },
  cardSub: { fontSize: 13, color: '#687076', marginBottom: 4 },
  cardComment: { fontSize: 13, color: '#27AE60', fontStyle: 'italic', marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  repondreBtn: { backgroundColor: '#EEF2F8', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  repondreBtnText: { color: '#1A3A6B', fontWeight: '600', fontSize: 13 },
  deleteBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  deleteBtnText: { color: '#E74C3C', fontWeight: '600', fontSize: 13 },
  voirBtn: { backgroundColor: '#EEF2F8', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  voirBtnText: { color: '#1A3A6B', fontWeight: '600', fontSize: 13 },
  statutBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  statutBadgeText: { fontSize: 12, fontWeight: '700' },
  // Fiches de paie
  paieUploadSection: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16 },
  paieUploadTitle: { fontSize: 14, fontWeight: '700', color: '#1A3A6B', marginBottom: 12 },
  paieEmployeScroll: { flexDirection: 'row' },
  paieEmployeBtn: { alignItems: 'center', marginRight: 12, padding: 10, borderRadius: 12, borderWidth: 1.5, minWidth: 80 },
  paieEmployeAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  paieEmployeAvatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  paieEmployeNom: { fontSize: 12, fontWeight: '600', color: '#11181C', maxWidth: 70 },
  paieEmployeAction: { fontSize: 10, color: '#687076', marginTop: 2 },
  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#11181C', marginBottom: 16, textAlign: 'center' },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { backgroundColor: '#F2F4F7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 12 },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: '#1A3A6B', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  infoText: { fontSize: 13, color: '#687076', fontStyle: 'italic', marginBottom: 12, lineHeight: 18 },
  statutRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statutBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 2, alignItems: 'center' },
  statutBtnActive: { backgroundColor: '#F0FFF4' },
  statutBtnText: { fontWeight: '700', fontSize: 14, color: '#687076' },
  // Badges notification
  cardEnAttente: { borderLeftWidth: 3, borderLeftColor: '#E67E22' },
  uploadArretBtn: { backgroundColor: '#F0F4FF', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: '#1A3A6B', borderStyle: 'dashed', alignItems: 'center', marginBottom: 8 },
  uploadArretBtnText: { fontSize: 14, color: '#1A3A6B', fontWeight: '600' },
  removeFileText: { fontSize: 12, color: '#E74C3C', textAlign: 'center', marginBottom: 8 },
  justificatifLink: { fontSize: 13, color: '#1A3A6B', fontWeight: '600', marginTop: 4 },
  nouveauBadge: { backgroundColor: '#E74C3C', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  nouveauBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  // Fiches de paie par année
  anneeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 4, marginTop: 8, marginBottom: 4, borderBottomWidth: 2, borderBottomColor: '#1A3A6B' },
  anneeTitle: { fontSize: 16, fontWeight: '800', color: '#1A3A6B' },
  anneeSub: { fontSize: 12, color: '#888', fontStyle: 'italic' },
  // Sélecteur employé / mois / année
  empChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB', marginRight: 8 },
  empChipActive: { backgroundColor: '#1A3A6B', borderColor: '#1A3A6B' },
  empChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  empChipTextActive: { color: '#fff' },
});
