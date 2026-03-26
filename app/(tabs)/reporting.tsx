import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Image,
  TextInput, Modal, Platform, Alert,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { METIER_COLORS, type Acompte } from '@/app/types';
import { DatePicker } from '@/components/DatePicker';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('@/assets/images/sk_deco_logo.png') as number;

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const MOIS_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const JOURS_COURT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function genId(): string {
  return `ac_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function formatDateFr(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${JOURS_COURT[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

function calcDureeMin(debut: string, fin: string): number {
  const [dh, dm] = debut.split(':').map(Number);
  const [fh, fm] = fin.split(':').map(Number);
  return (fh * 60 + fm) - (dh * 60 + dm);
}

function formatDuree(minutes: number): string {
  if (minutes <= 0) return '—';
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Calcule l'écart en minutes entre l'heure réelle et l'heure théorique.
 *  Positif = retard/départ anticipé (mauvais), négatif = avance (bon). */
function ecartMinutes(heureReelle: string, heureTheorique: string, type: 'debut' | 'fin'): number {
  const [rh, rm] = heureReelle.split(':').map(Number);
  const [th, tm] = heureTheorique.split(':').map(Number);
  const reel = rh * 60 + rm;
  const theo = th * 60 + tm;
  if (type === 'debut') return reel - theo;   // positif = en retard
  return theo - reel;                          // positif = parti trop tôt
}

/** Retourne la couleur de ponctualité */
function getPonctualiteColor(ecart: number): string {
  if (ecart > 15) return '#E74C3C';   // rouge : > 15 min
  if (ecart > 5)  return '#FF8C00';   // orange : 5-15 min
  return '#27AE60';                    // vert : ok
}

/** Retourne le label d'écart */
function formatEcart(ecart: number, type: 'debut' | 'fin'): string {
  if (ecart <= 0) return type === 'debut' ? 'A l\'heure' : 'A l\'heure';
  return `+${ecart} min`;
}

/** Calcule les jours fériés français pour une année donnée */
function getJoursFeriesFrance(year: number): Set<string> {
  const feries = new Set<string>();
  const fmt = (m: number, d: number) => `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  // Jours fériés fixes
  feries.add(fmt(1,1));   // 1er janvier
  feries.add(fmt(5,1));   // Fête du Travail
  feries.add(fmt(5,8));   // Victoire 1945
  feries.add(fmt(7,14));  // Fête Nationale
  feries.add(fmt(8,15));  // Assomption
  feries.add(fmt(11,1));  // Toussaint
  feries.add(fmt(11,11)); // Armistice
  feries.add(fmt(12,25)); // Noël
  // Pâques (algorithme de Meeus/Jones/Butcher)
  const a = year % 19, b = Math.floor(year/100), c = year % 100;
  const d2 = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
  const g = Math.floor((b-f+1)/3), h = (19*a+b-d2-g+15) % 30;
  const i = Math.floor(c/4), k = c % 4;
  const l = (32+2*e+2*i-h-k) % 7;
  const m2 = Math.floor((a+11*h+22*l)/451);
  const month = Math.floor((h+l-7*m2+114)/31);
  const day = ((h+l-7*m2+114) % 31) + 1;
  const paques = new Date(year, month-1, day);
  // Lundi de Pâques
  const lundiPaques = new Date(paques); lundiPaques.setDate(paques.getDate()+1);
  feries.add(toYMD(lundiPaques));
  // Ascension (39 jours après Pâques)
  const ascension = new Date(paques); ascension.setDate(paques.getDate()+39);
  feries.add(toYMD(ascension));
  // Lundi de Pentecôte (50 jours après Pâques)
  const pentecote = new Date(paques); pentecote.setDate(paques.getDate()+50);
  feries.add(toYMD(pentecote));
  return feries;
}

/** Calcule le nombre de jours ouvrables dans un mois (hors sam, dim, fériés) */
function calcJoursOuvrablesMois(year: number, month: number): number {
  const feries = getJoursFeriesFrance(year);
  let count = 0;
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    const dow = d.getDay();
    const dateStr = toYMD(d);
    if (dow !== 0 && dow !== 6 && !feries.has(dateStr)) count++;
    d.setDate(d.getDate()+1);
  }
  return count;
}

export default function ReportingScreen() {
  const { data, currentUser, isHydrated, addAcompte, deleteAcompte, addPointage, updatePointage, deletePointage } = useApp();
  const { t } = useLanguage();
  const isAdmin = currentUser?.role === 'admin';
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !currentUser) router.replace('/login' as any);
  }, [isHydrated, currentUser, router]);

  const today = new Date();
  const [vue, setVue] = useState<'journalier' | 'employe' | 'saisie'>('journalier');
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(toYMD(today));
  const [selectedEmployeId, setSelectedEmployeId] = useState<string | null>(null);

  // Modal saisie manuelle pointage
  const [editPointageModal, setEditPointageModal] = useState(false);
  const [editEmpId, setEditEmpId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState(toYMD(today));
  const [editArrivee, setEditArrivee] = useState('');
  const [editDepart, setEditDepart] = useState('');
  const [editIsAbsent, setEditIsAbsent] = useState(false);

  const openEditPointage = useCallback((empId: string, date: string) => {
    const pts = data.pointages.filter(p => p.employeId === empId && p.date === date);
    const debut = pts.find(p => p.type === 'debut');
    const fin = pts.find(p => p.type === 'fin');
    setEditEmpId(empId);
    setEditDate(date);
    setEditArrivee(debut?.heure || '');
    setEditDepart(fin?.heure || '');
    setEditIsAbsent(!debut && !fin);
    setEditPointageModal(true);
  }, [data.pointages]);

  const handleSaveEditPointage = useCallback(() => {
    if (!editEmpId) return;
    const existingPts = data.pointages.filter(p => p.employeId === editEmpId && p.date === editDate);
    const existingDebut = existingPts.find(p => p.type === 'debut');
    const existingFin = existingPts.find(p => p.type === 'fin');

    if (editIsAbsent) {
      if (existingDebut) deletePointage(existingDebut.id);
      if (existingFin) deletePointage(existingFin.id);
    } else {
      if (editArrivee.trim()) {
        const heureDebut = editArrivee.trim();
        if (existingDebut) {
          updatePointage({ ...existingDebut, heure: heureDebut, saisieManuelle: true, saisieParId: currentUser?.employeId || 'admin' });
        } else {
          addPointage({ id: `pt_${Date.now()}_d`, employeId: editEmpId, date: editDate, heure: heureDebut, type: 'debut', timestamp: new Date().toISOString(), latitude: null, longitude: null, adresse: null, saisieManuelle: true, saisieParId: currentUser?.employeId || 'admin' });
        }
      } else if (existingDebut) {
        deletePointage(existingDebut.id);
      }
      if (editDepart.trim()) {
        const heureFin = editDepart.trim();
        if (existingFin) {
          updatePointage({ ...existingFin, heure: heureFin, saisieManuelle: true, saisieParId: currentUser?.employeId || 'admin' });
        } else {
          addPointage({ id: `pt_${Date.now()}_f`, employeId: editEmpId, date: editDate, heure: heureFin, type: 'fin', timestamp: new Date().toISOString(), latitude: null, longitude: null, adresse: null, saisieManuelle: true, saisieParId: currentUser?.employeId || 'admin' });
        }
      } else if (existingFin) {
        deletePointage(existingFin.id);
      }
    }
    setEditPointageModal(false);
  }, [editEmpId, editDate, editArrivee, editDepart, editIsAbsent, data.pointages, addPointage, updatePointage, deletePointage, currentUser]);

  // Modal acompte
  const [showAcompteModal, setShowAcompteModal] = useState(false);
  const [acompteEmployeId, setAcompteEmployeId] = useState<string | null>(null);
  const [acompteMontant, setAcompteMontant] = useState('');
  const [acompteCommentaire, setAcompteCommentaire] = useState('');
  const [acompteDate, setAcompteDate] = useState(toYMD(today));

  const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Retourne les pointages groupés par employé et par date */
  const pointagesParEmpDate = useMemo(() => {
    const byEmp: Record<string, Record<string, { debut?: typeof data.pointages[0]; fin?: typeof data.pointages[0] }>> = {};
    data.pointages.forEach(p => {
      if (!byEmp[p.employeId]) byEmp[p.employeId] = {};
      if (!byEmp[p.employeId][p.date]) byEmp[p.employeId][p.date] = {};
      byEmp[p.employeId][p.date][p.type] = p;
    });
    return byEmp;
  }, [data.pointages]);

  /** Jours du mois sélectionné */
  const joursDuMois = useMemo(() => {
    const days: string[] = [];
    const d = new Date(selectedYear, selectedMonth, 1);
    while (d.getMonth() === selectedMonth) {
      days.push(toYMD(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [selectedMonth, selectedYear]);

  /** Acomptes du mois */
  const acomptesDuMois = useMemo(() =>
    data.acomptes.filter(a => a.date.startsWith(monthStr)),
    [data.acomptes, monthStr]
  );

  // ── Vue Journalière ────────────────────────────────────────────────────────

  /** Tous les employés avec leurs pointages du jour (présents ou non) */
  const pointagesJour = useMemo(() => {
    return data.employes
      .map(emp => {
        const pts = pointagesParEmpDate[emp.id]?.[selectedDate];
        return { emp, debut: pts?.debut, fin: pts?.fin };
      });
  }, [data.employes, pointagesParEmpDate, selectedDate]);

  /** Notes journalières (acomptes du jour) */
  const acomptesJour = useMemo(() =>
    data.acomptes.filter(a => a.date === selectedDate),
    [data.acomptes, selectedDate]
  );

  // ── Vue Par Employé ────────────────────────────────────────────────────────

  const empSelectionne = useMemo(() =>
    data.employes.find(e => e.id === selectedEmployeId) ?? null,
    [data.employes, selectedEmployeId]
  );

  const rapportEmploye = useMemo(() => {
    if (!empSelectionne) return null;
    const pts = pointagesParEmpDate[empSelectionne.id] || {};
    const acomptesMois = acomptesDuMois.filter(a => a.employeId === empSelectionne.id);
    const totalAcomptes = acomptesMois.reduce((s, a) => s + a.montant, 0);

    // Jours fériés du mois
    const feriesMois = getJoursFeriesFrance(selectedYear);

    let totalMinutes = 0;
    let totalRetardMinutes = 0;
    let joursAbsents = 0;      // jours théoriques sans pointage
    let joursFeriesComptes = 0; // fériés tombant un jour ouvrable théorique
    let joursFeriesTravailles = 0; // fériés effectivement travaillés (ne doivent PAS être déduits)
    let joursOuvrablesTravailles = 0; // jours effectivement travaillés

    const lignes = joursDuMois.map(dateStr => {
      const p = pts[dateStr];
      const debut = p?.debut;
      const fin = p?.fin;
      const dureeMin = debut && fin ? calcDureeMin(debut.heure, fin.heure) : null;
      if (dureeMin && dureeMin > 0) totalMinutes += dureeMin;

      // Horaires théoriques
      const jourSemaine = new Date(dateStr + 'T12:00:00').getDay();
      const horairesJour = empSelectionne.horaires?.[jourSemaine];
      const travailleTheo = horairesJour?.actif ?? false;
      const isFerie = feriesMois.has(dateStr);
      const isWeekendDay = jourSemaine === 0 || jourSemaine === 6;

      // Comptage fériés ouvrables
      if (travailleTheo && isFerie && !isWeekendDay) joursFeriesComptes++;

      // Comptage fériés travaillés (employé a pointé un jour férié)
      if (isFerie && (debut || fin)) joursFeriesTravailles++;

      // Comptage absences (jour théorique, non férié, non week-end, sans pointage)
      // Les jours fériés ne sont PAS comptés comme absences, même si l'employé n'a pas pointé
      if (travailleTheo && !isFerie && !isWeekendDay && !debut && !fin) joursAbsents++;

      // Comptage jours travaillés
      if (debut || fin) joursOuvrablesTravailles++;

      let ecartDebut: number | null = null;
      let ecartFin: number | null = null;
      if (debut && horairesJour?.actif) {
        ecartDebut = ecartMinutes(debut.heure, horairesJour.debut, 'debut');
        if (ecartDebut > 0) totalRetardMinutes += ecartDebut;
      }
      if (fin && horairesJour?.actif) {
        ecartFin = ecartMinutes(fin.heure, horairesJour.fin, 'fin');
      }

      return { dateStr, debut, fin, dureeMin, travailleTheo, horairesJour, ecartDebut, ecartFin, isFerie, joursFeriesTravaille: isFerie && (!!debut || !!fin) };
    });

    // Calcul du salaire selon le mode
    const joursOuvrablesMois = calcJoursOuvrablesMois(selectedYear, selectedMonth);
    let salaireBase: number | null = null;
    let salaireAvantAcompte: number | null = null;

    if (empSelectionne.modeSalaire === 'journalier' && empSelectionne.tarifJournalier != null) {
      // Mode journalier : tarif × jours ouvrables du mois
      // Les jours fériés sont déjà exclus du calcul de base (calcJoursOuvrablesMois)
      // Si l'employé a travaillé un jour férié, on lui ajoute ce jour (bonus férié travaillé)
      salaireBase = empSelectionne.tarifJournalier * joursOuvrablesMois;
      // Bonus jours fériés travaillés (ne sont pas dans la base, donc on les ajoute)
      const bonusFeries = empSelectionne.tarifJournalier * joursFeriesTravailles;
      // Déduction absences
      const deductionAbsences = empSelectionne.tarifJournalier * joursAbsents;
      salaireAvantAcompte = salaireBase + bonusFeries - deductionAbsences;
    } else if (empSelectionne.salaireNet != null) {
      // Mode mensuel fixe
      salaireBase = empSelectionne.salaireNet;
      salaireAvantAcompte = salaireBase;
    }

    const resteAPayer = salaireAvantAcompte != null ? salaireAvantAcompte - totalAcomptes : null;

    return {
      lignes, totalMinutes, totalAcomptes, salaireBase, salaireAvantAcompte, resteAPayer,
      acomptesMois, joursOuvrablesMois, joursFeriesComptes, joursAbsents,
      totalRetardMinutes, joursOuvrablesTravailles, joursFeriesTravailles,
      modeSalaire: empSelectionne.modeSalaire ?? 'mensuel',
      tarifJournalier: empSelectionne.tarifJournalier ?? null,
    };
  }, [empSelectionne, pointagesParEmpDate, joursDuMois, acomptesDuMois, selectedYear, selectedMonth]);

  // ── Actions acompte ────────────────────────────────────────────────────────

  const openAcompteModal = (empId: string) => {
    setAcompteEmployeId(empId);
    setAcompteMontant('');
    setAcompteCommentaire('');
    setAcompteDate(vue === 'journalier' ? selectedDate : toYMD(today));
    setShowAcompteModal(true);
  };

  const handleSaveAcompte = () => {
    const montant = parseFloat(acompteMontant.replace(',', '.'));
    if (!acompteEmployeId || isNaN(montant) || montant <= 0) return;
    addAcompte({
      id: genId(),
      employeId: acompteEmployeId,
      date: acompteDate,
      montant,
      commentaire: acompteCommentaire.trim(),
      createdAt: new Date().toISOString(),
    });
    setShowAcompteModal(false);
  };

  const handleDeleteAcompte = (ac: Acompte) => {
    if (Platform.OS === 'web') {
   if ((typeof window !== 'undefined' && window.confirm ? window.confirm(`${t.reporting.deleteDeposit} ${ac.montant} € ?`) : true)) deleteAcompte(ac.id);  } else {
      Alert.alert(t.common.delete, `${t.reporting.deleteDeposit} ${ac.montant} € ?`, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.common.delete, style: 'destructive', onPress: () => deleteAcompte(ac.id) },
      ]);
    }
  };

  // ── Export CSV/PDF ─────────────────────────────────────────────────────────────────────────────

  const handleExportCSV = () => {
    if (Platform.OS !== 'web') return;
    const rows: string[][] = [];
    const sep = ';';
    const moisLabel = `${MOIS_LONG[selectedMonth]} ${selectedYear}`;
    rows.push([`Rapport mensuel SK DECO — ${moisLabel}`]);
    rows.push([]);
    rows.push(['Employé', 'Date', 'Arrivée', 'Départ', 'Durée', 'Chantier(s)']);
    data.employes.forEach(emp => {
      const pts = (pointagesParEmpDate[emp.id] || {});
      joursDuMois.forEach(dateStr => {
        const p = pts[dateStr];
        if (!p?.debut && !p?.fin) return;
        const debut = p?.debut?.heure || '';
        const fin = p?.fin?.heure || '';
        const dureeMin = debut && fin ? calcDureeMin(debut, fin) : 0;
        const chantiersJour = data.affectations
          .filter(a => a.employeId === emp.id && a.dateDebut <= dateStr && a.dateFin >= dateStr)
          .map(a => data.chantiers.find(c => c.id === a.chantierId)?.nom || '').filter(Boolean).join(' / ');
        rows.push([`${emp.prenom} ${emp.nom}`, dateStr, debut, fin, formatDuree(dureeMin), chantiersJour]);
      });
    });
    rows.push([]);
    rows.push([`Matériaux achetés — ${moisLabel}`]);
    rows.push(['Chantier', 'Employé', 'Article', 'Quantité', 'Acheté par', 'Date achat']);
    (data.listesMateriaux || []).forEach(liste => {
      const chantier = data.chantiers.find(c => c.id === liste.chantierId);
      const emp = data.employes.find(e => e.id === liste.employeId);
      liste.items.filter(i => i.achete).forEach(item => {
        rows.push([chantier?.nom || '', emp ? `${emp.prenom} ${emp.nom}` : '', item.texte, item.quantite || '', item.achetePar || '', item.acheteAt ? item.acheteAt.slice(0, 10) : '']);
      });
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(sep)).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SK_DECO_${moisLabel.replace(' ', '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    if (Platform.OS !== 'web') return;
    const moisLabel = `${MOIS_LONG[selectedMonth]} ${selectedYear}`;
    let html = `<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:11px;color:#222;margin:20px}h1{color:#1A3A6B;font-size:16px}h2{color:#1A3A6B;font-size:13px;margin-top:24px;border-bottom:2px solid #1A3A6B;padding-bottom:4px}h3{color:#444;font-size:11px;margin-top:12px}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#1A3A6B;color:#fff;padding:5px 8px;text-align:left;font-size:10px}td{padding:4px 8px;border-bottom:1px solid #eee}tr:nth-child(even){background:#F8F9FA}.footer{margin-top:32px;font-size:9px;color:#999;text-align:center}</style></head><body>`;
    html += `<h1>SK DECO — Rapport ${moisLabel}</h1><p style="color:#687076;font-size:10px;">Généré le ${new Date().toLocaleDateString('fr-FR')}</p>`;
    html += `<h2>Horaires par employé</h2>`;
    data.employes.forEach(emp => {
      const pts = pointagesParEmpDate[emp.id] || {};
      const lignesEmp = joursDuMois.filter(d => pts[d]?.debut || pts[d]?.fin);
      if (lignesEmp.length === 0) return;
      let totalMin = 0;
      html += `<h3>${emp.prenom} ${emp.nom}</h3><table><tr><th>Date</th><th>Arrivée</th><th>Départ</th><th>Durée</th><th>Chantier(s)</th></tr>`;
      lignesEmp.forEach(dateStr => {
        const p = pts[dateStr];
        const debut = p?.debut?.heure || '—';
        const fin = p?.fin?.heure || '—';
        const dureeMin = p?.debut && p?.fin ? calcDureeMin(p.debut.heure, p.fin.heure) : 0;
        if (dureeMin > 0) totalMin += dureeMin;
        const chantiersJour = data.affectations.filter(a => a.employeId === emp.id && a.dateDebut <= dateStr && a.dateFin >= dateStr).map(a => data.chantiers.find(c => c.id === a.chantierId)?.nom || '').filter(Boolean).join(', ');
        html += `<tr><td>${formatDateFr(dateStr)}</td><td>${debut}</td><td>${fin}</td><td>${formatDuree(dureeMin)}</td><td>${chantiersJour}</td></tr>`;
      });
      html += `</table><p><strong>Total : ${formatDuree(totalMin)}</strong></p>`;
    });
    html += `<h2>Planning par chantier</h2>`;
    data.chantiers.forEach(chantier => {
      const affs = data.affectations.filter(a => a.chantierId === chantier.id && !a.soustraitantId);
      const stAffs = data.affectations.filter(a => a.chantierId === chantier.id && a.soustraitantId);
      const lignes: string[] = [];
      affs.forEach(aff => {
        const emp = data.employes.find(e => e.id === aff.employeId);
        if (!emp) return;
        const pts = pointagesParEmpDate[emp.id] || {};
        joursDuMois.forEach(dateStr => {
          if (aff.dateDebut > dateStr || aff.dateFin < dateStr) return;
          const p = pts[dateStr];
          if (!p?.debut && !p?.fin) return;
          const debut = p?.debut?.heure || '—';
          const fin = p?.fin?.heure || '—';
          const dureeMin = p?.debut && p?.fin ? calcDureeMin(p.debut.heure, p.fin.heure) : 0;
          lignes.push(`<tr><td>${emp.prenom} ${emp.nom}</td><td>${formatDateFr(dateStr)}</td><td>${debut}</td><td>${fin}</td><td>${formatDuree(dureeMin)}</td></tr>`);
        });
      });
      if (lignes.length === 0 && stAffs.length === 0) return;
      html += `<p style="font-weight:bold;margin-top:12px;">${chantier.nom}</p>`;
      if (lignes.length > 0) html += `<table><tr><th>Employé</th><th>Date</th><th>Arrivée</th><th>Départ</th><th>Durée</th></tr>${lignes.join('')}</table>`;
      if (stAffs.length > 0) html += `<p style="font-size:10px;color:#687076;">Sous-traitants : ${stAffs.map(a => { const st = data.sousTraitants.find(s => s.id === a.soustraitantId); return st?.nom || ''; }).filter(Boolean).join(', ')}</p>`;
      const itemsAchetes = (data.listesMateriaux || []).filter(l => l.chantierId === chantier.id).flatMap(l => l.items.filter(i => i.achete));
      if (itemsAchetes.length > 0) {
        html += `<p style="font-size:10px;font-weight:bold;margin-top:8px;">Matériaux achetés :</p><table><tr><th>Article</th><th>Quantité</th><th>Acheté par</th></tr>`;
        itemsAchetes.forEach(item => { html += `<tr><td>${item.texte}</td><td>${item.quantite || '—'}</td><td>${item.achetePar || '—'}</td></tr>`; });
        html += `</table>`;
      }
    });
    html += `<div class="footer">SK DECO Planning — Rapport généré automatiquement</div></body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 500); }
  };

  // ── Navigation dates ─────────────────────────────────────────────────────────────────────────────

  const prevDay = () => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(toYMD(d));
  };

  const nextDay = () => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(toYMD(d));
  };

  const prevMonth = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };

  if (!isAdmin) {
    return (
      <ScreenContainer containerClassName="bg-[#F2F4F7]">
        <View style={styles.center}>
          <Text style={styles.noAccess}>{t.common.adminOnly}</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer containerClassName="bg-[#F2F4F7]" edges={['top', 'left', 'right']}>
      {/* En-tête */}
      <View style={styles.header}>
        <View style={styles.headerLogoWrap}>
          <Image source={LOGO} style={styles.headerLogo} resizeMode="contain" />
          <Text style={styles.headerSub}>{t.reporting.title}</Text>
        </View>
        {Platform.OS === 'web' && (
          <View style={styles.exportBtns}>
            <Pressable style={styles.exportBtn} onPress={handleExportCSV}>
              <Text style={styles.exportBtnText}>📊 Excel</Text>
            </Pressable>
            <Pressable style={[styles.exportBtn, styles.exportBtnPDF]} onPress={handleExportPDF}>
              <Text style={styles.exportBtnText}>📄 PDF</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Sélecteur de vue */}
      <View style={styles.vueSelector}>
        <Pressable
          style={[styles.vueBtn, vue === 'journalier' && styles.vueBtnActive]}
          onPress={() => setVue('journalier')}
        >
          <Text style={[styles.vueBtnText, vue === 'journalier' && styles.vueBtnTextActive]}>
            {t.reporting.daily}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.vueBtn, vue === 'employe' && styles.vueBtnActive]}
          onPress={() => setVue('employe')}
        >
          <Text style={[styles.vueBtnText, vue === 'employe' && styles.vueBtnTextActive]}>
            {t.reporting.byEmployee}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.vueBtn, vue === 'saisie' && styles.vueBtnActive]}
          onPress={() => setVue('saisie')}
        >
          <Text style={[styles.vueBtnText, vue === 'saisie' && styles.vueBtnTextActive]}>
            ✏️ {t.reporting.manualEntry}
          </Text>
        </Pressable>
      </View>

      {/* ── VUE JOURNALIÈRE ── */}
      {vue === 'journalier' && (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Navigation jour */}
          <View style={styles.navRow}>
            <Pressable style={styles.navBtn} onPress={prevDay}>
              <Text style={styles.navArrow}>‹</Text>
            </Pressable>
            <Text style={styles.navLabel}>{formatDateFr(selectedDate)}</Text>
            <Pressable style={styles.navBtn} onPress={nextDay}>
              <Text style={styles.navArrow}>›</Text>
            </Pressable>
          </View>

          {/* Pointages du jour */}
          {pointagesJour.map(({ emp, debut, fin }) => {
              const mc = METIER_COLORS[emp.metier];
              const dureeMin = debut && fin ? calcDureeMin(debut.heure, fin.heure) : null;
              const jourSemaine = new Date(selectedDate + 'T12:00:00').getDay();
              const horairesJour = emp.horaires?.[jourSemaine];
              const ecartD = debut && horairesJour?.actif ? ecartMinutes(debut.heure, horairesJour.debut, 'debut') : null;
              const ecartF = fin && horairesJour?.actif ? ecartMinutes(fin.heure, horairesJour.fin, 'fin') : null;
              const acomptesEmpJour = acomptesJour.filter(a => a.employeId === emp.id);
              const hasPointage = debut || fin;
              const isAbsent = !hasPointage && horairesJour?.actif;

              return (
                <View key={emp.id} style={[styles.empCard, isAbsent && styles.empCardAbsent]}>
                  <View style={styles.empCardHeader}>
                    <View style={[styles.empAvatar, { backgroundColor: mc.color, opacity: hasPointage ? 1 : 0.5 }]}>
                      <Text style={[styles.empAvatarText, { color: mc.textColor }]}>
                        {emp.prenom[0]}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.empName}>{emp.prenom} {emp.nom}</Text>
                      <Text style={[styles.empMetier, { color: mc.color }]}>{mc.label}</Text>
                      {horairesJour?.actif && (
                        <Text style={styles.horairesTheo}>⏰ {horairesJour.debut}–{horairesJour.fin}</Text>
                      )}
                    </View>
                    {dureeMin && dureeMin > 0 ? (
                      <View style={styles.dureeBadge}>
                        <Text style={styles.dureeBadgeText}>{formatDuree(dureeMin)}</Text>
                      </View>
                    ) : isAbsent ? (
                      <View style={[styles.dureeBadge, styles.dureeBadgeAbsent]}>
                        <Text style={[styles.dureeBadgeText, { color: '#E74C3C' }]}>{t.reporting.absent}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.pointageRow}>
                    {debut ? (
                      <View style={styles.pointageCell}>
                        <Text style={styles.pointageLabel}>{t.reporting.arrival}</Text>
                        <Text style={styles.pointageHeure}>{debut.heure}</Text>
                        {ecartD !== null && (
                          <Text style={[styles.ecartText, { color: getPonctualiteColor(ecartD) }]}>
                            {formatEcart(ecartD, 'debut')}
                          </Text>
                        )}
                      </View>
                    ) : (
                      <View style={styles.pointageCell}>
                        <Text style={styles.pointageLabel}>{t.reporting.arrival}</Text>
                        <Text style={styles.pointageAbsent}>—</Text>
                      </View>
                    )}
                    <View style={styles.pointageSep} />
                    {fin ? (
                      <View style={styles.pointageCell}>
                        <Text style={styles.pointageLabel}>{t.reporting.departure}</Text>
                        <Text style={styles.pointageHeure}>{fin.heure}</Text>
                        {ecartF !== null && (
                          <Text style={[styles.ecartText, { color: getPonctualiteColor(ecartF) }]}>
                            {formatEcart(ecartF, 'fin')}
                          </Text>
                        )}
                      </View>
                    ) : (
                      <View style={styles.pointageCell}>
                        <Text style={styles.pointageLabel}>{t.reporting.departure}</Text>
                        <Text style={styles.pointageAbsent}>—</Text>
                      </View>
                    )}
                  </View>

                  {/* Acomptes du jour pour cet employé */}
                  {acomptesEmpJour.length > 0 && (
                    <View style={styles.acomptesSection}>
                      {acomptesEmpJour.map(ac => (
                        <View key={ac.id} style={styles.acompteRow}>
                          <Text style={styles.acompteIcon}>💶</Text>
                          <Text style={styles.acompteMontant}>{ac.montant} €</Text>
                          {ac.commentaire ? <Text style={styles.acompteComment}>{ac.commentaire}</Text> : null}
                          <Pressable onPress={() => handleDeleteAcompte(ac)} style={styles.acompteDelete}>
                            <Text style={styles.acompteDeleteText}>✕</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Bouton ajouter acompte */}
                  <Pressable style={styles.addAcompteBtn} onPress={() => openAcompteModal(emp.id)}>
                    <Text style={styles.addAcompteBtnText}>+ {t.reporting.deposit}</Text>
                  </Pressable>
                </View>
              );
            })}

          {/* Résumé acomptes du jour */}
          {acomptesJour.length > 0 && (
            <View style={styles.resumeCard}>
              <Text style={styles.resumeTitle}>{t.reporting.totalDepositsDay}</Text>
              <Text style={styles.resumeAmount}>
                {acomptesJour.reduce((s, a) => s + a.montant, 0).toLocaleString('fr-FR')} €
              </Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── VUE PAR EMPLOYÉ ── */}
      {vue === 'employe' && (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Navigation mois */}
          <View style={styles.navRow}>
            <Pressable style={styles.navBtn} onPress={prevMonth}>
              <Text style={styles.navArrow}>‹</Text>
            </Pressable>
            <Text style={styles.navLabel}>{MOIS_LONG[selectedMonth]} {selectedYear}</Text>
            <Pressable style={styles.navBtn} onPress={nextMonth}>
              <Text style={styles.navArrow}>›</Text>
            </Pressable>
          </View>

          {/* Sélecteur employé */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.empSelector} contentContainerStyle={styles.empSelectorContent}>
            {data.employes.map(emp => {
              const mc = METIER_COLORS[emp.metier];
              const active = selectedEmployeId === emp.id;
              return (
                <Pressable
                  key={emp.id}
                  style={[styles.empChip, active && { backgroundColor: mc.color, borderColor: mc.color }]}
                  onPress={() => setSelectedEmployeId(emp.id)}
                >
                  <View style={[styles.empChipDot, { backgroundColor: active ? '#fff' : mc.color }]} />
                  <Text style={[styles.empChipText, active && { color: '#fff' }]}>
                    {emp.prenom}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {!empSelectionne ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t.reporting.selectEmployee}</Text>
            </View>
          ) : rapportEmploye ? (
            <>
              {/* Résumé mensuel */}
              <View style={styles.resumeMensuel}>
                {/* Ligne total heures */}
                <View style={styles.resumeMensuelRow}>
                  <Text style={styles.resumeMensuelLabel}>{t.reporting.totalHours}</Text>
                  <Text style={styles.resumeMensuelValue}>{formatDuree(rapportEmploye.totalMinutes)}</Text>
                </View>

                {/* Retards (admin/RH toujours, employé si retardAfficheEmploye) */}
                {rapportEmploye.totalRetardMinutes > 0 && (isAdmin || (currentUser as any)?.isRH || empSelectionne.retardAfficheEmploye) && (
                  <View style={styles.resumeMensuelRow}>
                    <Text style={[styles.resumeMensuelLabel, { color: '#E67E22' }]}>{t.reporting.totalLate}</Text>
                    <Text style={[styles.resumeMensuelValue, { color: '#E67E22' }]}>+{formatDuree(rapportEmploye.totalRetardMinutes)} (info)</Text>
                  </View>
                )}

                {/* Mode journalier */}
                {rapportEmploye.modeSalaire === 'journalier' && rapportEmploye.tarifJournalier != null && (
                  <>
                    <View style={[styles.resumeMensuelRow, { backgroundColor: '#F0F4FF', borderRadius: 6, paddingHorizontal: 8, marginTop: 4 }]}>
                      <Text style={styles.resumeMensuelLabel}>{t.reporting.workingDays}</Text>
                      <Text style={styles.resumeMensuelValue}>{rapportEmploye.joursOuvrablesMois} j</Text>
                    </View>
                    <View style={styles.resumeMensuelRow}>
                      <Text style={styles.resumeMensuelLabel}>{t.reporting.dailyRate}</Text>
                      <Text style={styles.resumeMensuelValue}>{rapportEmploye.tarifJournalier.toLocaleString('fr-FR')} €/j</Text>
                    </View>
                    <View style={styles.resumeMensuelRow}>
                      <Text style={styles.resumeMensuelLabel}>{t.reporting.baseSalary}</Text>
                      <Text style={styles.resumeMensuelValue}>{(rapportEmploye.salaireBase ?? 0).toLocaleString('fr-FR')} €</Text>
                    </View>
                    {rapportEmploye.joursFeriesComptes > 0 && (
                      <View style={styles.resumeMensuelRow}>
                        <Text style={[styles.resumeMensuelLabel, { color: '#8E44AD' }]}>{t.reporting.holidays}</Text>
                        <Text style={[styles.resumeMensuelValue, { color: '#8E44AD' }]}>{rapportEmploye.joursFeriesComptes} j</Text>
                      </View>
                    )}
                    {rapportEmploye.joursFeriesTravailles > 0 && (
                      <View style={[styles.resumeMensuelRow, { backgroundColor: '#E8F5E9', borderRadius: 6, paddingHorizontal: 8 }]}>
                        <Text style={[styles.resumeMensuelLabel, { color: '#27AE60' }]}>🎉 {t.reporting.holidaysWorked}</Text>
                        <Text style={[styles.resumeMensuelValue, { color: '#27AE60' }]}>+{rapportEmploye.joursFeriesTravailles} j (+{(rapportEmploye.joursFeriesTravailles * (rapportEmploye.tarifJournalier ?? 0)).toLocaleString('fr-FR')} €)</Text>
                      </View>
                    )}
                    {rapportEmploye.joursAbsents > 0 && (
                      <View style={styles.resumeMensuelRow}>
                        <Text style={[styles.resumeMensuelLabel, { color: '#E74C3C' }]}>{t.reporting.absencesDeducted}</Text>
                        <Text style={[styles.resumeMensuelValue, { color: '#E74C3C' }]}>- {rapportEmploye.joursAbsents} j (- {(rapportEmploye.joursAbsents * (rapportEmploye.tarifJournalier ?? 0)).toLocaleString('fr-FR')} €)</Text>
                      </View>
                    )}
                    <View style={[styles.resumeMensuelRow, { borderTopWidth: 1, borderTopColor: '#E0E0E0', marginTop: 4, paddingTop: 4 }]}>
                      <Text style={styles.resumeMensuelLabel}>{t.reporting.salaryBeforeDeposit}</Text>
                      <Text style={[styles.resumeMensuelValue, { fontWeight: '700' }]}>{(rapportEmploye.salaireAvantAcompte ?? 0).toLocaleString('fr-FR')} €</Text>
                    </View>
                  </>
                )}

                {/* Mode mensuel fixe */}
                {rapportEmploye.modeSalaire === 'mensuel' && rapportEmploye.salaireBase != null && (
                  <View style={styles.resumeMensuelRow}>
                    <Text style={styles.resumeMensuelLabel}>{t.reporting.monthlySalary}</Text>
                    <Text style={styles.resumeMensuelValue}>{rapportEmploye.salaireBase.toLocaleString('fr-FR')} €</Text>
                  </View>
                )}

                {/* Acomptes */}
                {(rapportEmploye.salaireBase != null) && (
                  <View style={styles.resumeMensuelRow}>
                    <Text style={styles.resumeMensuelLabel}>{t.reporting.depositsTotal}</Text>
                    <Text style={[styles.resumeMensuelValue, { color: '#E74C3C' }]}>
                      - {rapportEmploye.totalAcomptes.toLocaleString('fr-FR')} €
                    </Text>
                  </View>
                )}

                {/* Reste à payer */}
                {rapportEmploye.resteAPayer != null && (
                  <View style={[styles.resumeMensuelRow, styles.resumeMensuelTotal]}>
                    <Text style={styles.resumeMensuelTotalLabel}>{t.reporting.remaining}</Text>
                    <Text style={[styles.resumeMensuelTotalValue, { color: rapportEmploye.resteAPayer >= 0 ? '#1A3A6B' : '#E74C3C' }]}>
                      {rapportEmploye.resteAPayer.toLocaleString('fr-FR')} €
                    </Text>
                  </View>
                )}

                <Pressable style={styles.addAcompteBtnLarge} onPress={() => openAcompteModal(empSelectionne.id)}>
                  <Text style={styles.addAcompteBtnLargeText}>+ {t.reporting.addDeposit}</Text>
                </Pressable>
              </View>

              {/* Acomptes du mois */}
              {rapportEmploye.acomptesMois.length > 0 && (
                <View style={styles.acomptesMoisSection}>
                  <Text style={styles.sectionTitle}>{t.reporting.monthDeposits}</Text>
                  {rapportEmploye.acomptesMois.map(ac => (
                    <View key={ac.id} style={styles.acompteRow}>
                      <Text style={styles.acompteIcon}>💶</Text>
                      <Text style={styles.acompteDate}>{formatDateFr(ac.date)}</Text>
                      <Text style={styles.acompteMontant}>{ac.montant} €</Text>
                      {ac.commentaire ? <Text style={styles.acompteComment}>{ac.commentaire}</Text> : null}
                      <Pressable onPress={() => handleDeleteAcompte(ac)} style={styles.acompteDelete}>
                        <Text style={styles.acompteDeleteText}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {/* Tableau des jours */}
              <Text style={styles.sectionTitle}>{t.reporting.monthDetail}</Text>
              <View style={styles.tableau}>
                {/* En-tête */}
                <View style={[styles.tableauRow, styles.tableauHeader]}>
                  <Text style={[styles.tableauCell, styles.tableauCellDate, styles.tableauHeaderText]}>{t.common.date}</Text>
                  <Text style={[styles.tableauCell, styles.tableauCellHeure, styles.tableauHeaderText]}>{t.reporting.arrival}</Text>
                  <Text style={[styles.tableauCell, styles.tableauCellHeure, styles.tableauHeaderText]}>{t.reporting.departure}</Text>
                  <Text style={[styles.tableauCell, styles.tableauCellDuree, styles.tableauHeaderText]}>{t.reporting.duration}</Text>
                </View>
                {rapportEmploye.lignes.map(({ dateStr, debut, fin, dureeMin, travailleTheo, horairesJour, ecartDebut, ecartFin, isFerie, joursFeriesTravaille }) => {
                  const isWeekend = [0, 6].includes(new Date(dateStr + 'T12:00:00').getDay());
                  const hasAnomalie = (ecartDebut !== null && ecartDebut > 15) || (ecartFin !== null && ecartFin > 15);
                  const hasPointage = debut || fin;

                  return (
                    <View
                      key={dateStr}
                      style={[
                        styles.tableauRow,
                        isWeekend && styles.tableauRowWeekend,
                        hasAnomalie && styles.tableauRowAnomalie,
                        joursFeriesTravaille && { backgroundColor: '#E8F5E9' },
                      ]}
                    >
                      <View style={[styles.tableauCell, styles.tableauCellDate]}>
                        <Text style={[styles.tableauDateText, isWeekend && styles.tableauDateWeekend, isFerie && { color: '#27AE60', fontWeight: '700' }]}>
                          {formatDateFr(dateStr)}{isFerie ? ' 🎉' : ''}
                        </Text>
                        {travailleTheo && horairesJour && (
                          <Text style={styles.tableauTheoText}>
                            {horairesJour.debut}–{horairesJour.fin}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.tableauCell, styles.tableauCellHeure]}>
                        {debut ? (
                          <>
                            <Text style={styles.tableauHeureText}>{debut.heure}</Text>
                            {ecartDebut !== null && ecartDebut !== 0 && (
                              <Text style={[styles.tableauEcartText, { color: getPonctualiteColor(ecartDebut) }]}>
                                {ecartDebut > 0 ? `+${ecartDebut}min` : `${ecartDebut}min`}
                              </Text>
                            )}
                          </>
                        ) : (
                          <Text style={[styles.tableauAbsent, travailleTheo && !hasPointage && { color: '#E74C3C' }]}>
                            {travailleTheo && !hasPointage ? 'Abs.' : '—'}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.tableauCell, styles.tableauCellHeure]}>
                        {fin ? (
                          <>
                            <Text style={styles.tableauHeureText}>{fin.heure}</Text>
                            {ecartFin !== null && ecartFin !== 0 && (
                              <Text style={[styles.tableauEcartText, { color: getPonctualiteColor(ecartFin) }]}>
                                {ecartFin > 0 ? `+${ecartFin}min` : `${ecartFin}min`}
                              </Text>
                            )}
                          </>
                        ) : (
                          <Text style={styles.tableauAbsent}>—</Text>
                        )}
                      </View>
                      <Text style={[styles.tableauCell, styles.tableauCellDuree, styles.tableauDureeText]}>
                        {dureeMin && dureeMin > 0 ? formatDuree(dureeMin) : '—'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── VUE SAISIE MANUELLE ── */}
      {vue === 'saisie' && (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.navRow}>
            <Pressable style={styles.navBtn} onPress={prevMonth}>
              <Text style={styles.navArrow}>‹</Text>
            </Pressable>
            <Text style={styles.navLabel}>{MOIS_LONG[selectedMonth]} {selectedYear}</Text>
            <Pressable style={styles.navBtn} onPress={nextMonth}>
              <Text style={styles.navArrow}>›</Text>
            </Pressable>
          </View>
          <Text style={{ marginHorizontal: 16, marginBottom: 8, fontSize: 12, color: '#687076' }}>
            {t.reporting.tapToEdit}
          </Text>
          {data.employes.map(emp => {
            const mc = METIER_COLORS[emp.metier];
            const pts = pointagesParEmpDate[emp.id] || {};
            return (
              <View key={emp.id} style={styles.saisieEmpBlock}>
                <View style={[styles.saisieEmpHeader, { borderLeftColor: mc.color }]}>
                  <View style={[styles.saisieEmpAvatar, { backgroundColor: mc.color }]}>
                    <Text style={{ color: mc.textColor, fontWeight: '800', fontSize: 14 }}>{emp.prenom[0]}</Text>
                  </View>
                  <Text style={styles.saisieEmpName}>{emp.prenom} {emp.nom}</Text>
                  <Text style={[styles.saisieEmpMetier, { color: mc.color }]}>{mc.label}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View>
                    <View style={styles.saisieTableHeader}>
                      <Text style={[styles.saisieCellDate, styles.saisieHeaderText]}>{t.common.date}</Text>
                      <Text style={[styles.saisieCellHeure, styles.saisieHeaderText]}>{t.reporting.arrival}</Text>
                      <Text style={[styles.saisieCellHeure, styles.saisieHeaderText]}>{t.reporting.departure}</Text>
                      <Text style={[styles.saisieCellDuree, styles.saisieHeaderText]}>{t.reporting.duration}</Text>
                      <Text style={[styles.saisieCellAction, styles.saisieHeaderText]}>✏️</Text>
                    </View>
                    {joursDuMois.map(dateStr => {
                      const p = pts[dateStr];
                      const debut = p?.debut;
                      const fin = p?.fin;
                      const dureeMin = debut && fin ? calcDureeMin(debut.heure, fin.heure) : null;
                      const jourSemaine = new Date(dateStr + 'T12:00:00').getDay();
                      const isWeekend = jourSemaine === 0 || jourSemaine === 6;
                      const horairesJour = emp.horaires?.[jourSemaine];
                      const travailleTheo = horairesJour?.actif ?? false;
                      const hasPointage = debut || fin;
                      const isAbsent = !hasPointage && travailleTheo && !isWeekend;
                      return (
                        <Pressable
                          key={dateStr}
                          style={[
                            styles.saisieTableRow,
                            isWeekend && { backgroundColor: '#F8F9FA' },
                            isAbsent && { backgroundColor: '#FFF5F5' },
                          ]}
                          onPress={() => openEditPointage(emp.id, dateStr)}
                        >
                          <Text style={[styles.saisieCellDate, styles.saisieDateText, isWeekend && { color: '#B0BEC5' }]}>
                            {formatDateFr(dateStr)}
                          </Text>
                          <View style={[styles.saisieCellHeure, debut?.saisieManuelle && styles.saisieCellManuelle]}>
                            <Text style={[styles.saisieCellText, !debut && { color: isAbsent ? '#E74C3C' : '#B0BEC5' }]}>
                              {debut ? debut.heure : isAbsent ? t.reporting.absent : '—'}
                            </Text>
                            {debut?.saisieManuelle && <Text style={styles.saisieManuelleIcon}>✏️</Text>}
                          </View>
                          <View style={[styles.saisieCellHeure, fin?.saisieManuelle && styles.saisieCellManuelle]}>
                            <Text style={[styles.saisieCellText, !fin && { color: '#B0BEC5' }]}>
                              {fin ? fin.heure : '—'}
                            </Text>
                            {fin?.saisieManuelle && <Text style={styles.saisieManuelleIcon}>✏️</Text>}
                          </View>
                          <Text style={[styles.saisieCellDuree, styles.saisieCellText]}>
                            {dureeMin && dureeMin > 0 ? formatDuree(dureeMin) : '—'}
                          </Text>
                          <View style={styles.saisieCellAction}>
                            <Text style={{ fontSize: 14 }}>✏️</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── Modal Saisie Manuelle Pointage ── */}
      <Modal
        visible={editPointageModal}
        animationType="slide"
        transparent
        onRequestClose={() => setEditPointageModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setEditPointageModal(false)}>
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>✏️ {t.reporting.editTimesheet}</Text>
            {editEmpId && (
              <Text style={styles.modalSubtitle}>
                {data.employes.find(e => e.id === editEmpId)?.prenom}{' '}
                {data.employes.find(e => e.id === editEmpId)?.nom} — {formatDateFr(editDate)}
              </Text>
            )}
            <Pressable
              style={[styles.editAbsentBtn, editIsAbsent && styles.editAbsentBtnActive]}
              onPress={() => setEditIsAbsent(v => !v)}
            >
              <Text style={[styles.editAbsentBtnText, editIsAbsent && { color: '#fff' }]}>
                {editIsAbsent ? `✓ ${t.reporting.markedAbsent}` : t.reporting.markAbsent}
              </Text>
            </Pressable>
            {!editIsAbsent && (
              <>
                <Text style={styles.modalFieldLabel}>{t.reporting.arrivalTime}</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editArrivee}
                  onChangeText={setEditArrivee}
                  placeholder="Ex: 08:00"
                  placeholderTextColor="#B0BEC5"
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={styles.modalFieldLabel}>{t.reporting.departureTime}</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editDepart}
                  onChangeText={setEditDepart}
                  placeholder="Ex: 17:00"
                  placeholderTextColor="#B0BEC5"
                  keyboardType="numbers-and-punctuation"
                />
              </>
            )}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setEditPointageModal(false)}>
                <Text style={styles.modalCancelBtnText}>{t.common.cancel}</Text>
              </Pressable>
              <Pressable style={styles.modalSaveBtn} onPress={handleSaveEditPointage}>
                <Text style={styles.modalSaveBtnText}>{t.common.save}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal Acompte ── */}
      <Modal
        visible={showAcompteModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAcompteModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowAcompteModal(false)}>
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t.reporting.addDeposit}</Text>
            {acompteEmployeId && (
              <Text style={styles.modalSubtitle}>
                {data.employes.find(e => e.id === acompteEmployeId)?.prenom}{' '}
                {data.employes.find(e => e.id === acompteEmployeId)?.nom}
              </Text>
            )}

            <DatePicker
              label="Date"
              value={acompteDate}
              onChange={setAcompteDate}
            />

            <Text style={styles.modalFieldLabel}>{t.reporting.amount} *</Text>
            <TextInput
              style={styles.modalInput}
              value={acompteMontant}
              onChangeText={setAcompteMontant}
              placeholder="Ex: 300"
              placeholderTextColor="#B0BEC5"
              keyboardType="numeric"
              autoFocus
            />

            <Text style={styles.modalFieldLabel}>{t.common.comment}</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 72, textAlignVertical: 'top' }]}
              value={acompteCommentaire}
              onChangeText={setAcompteCommentaire}
              placeholder="Ex: Acompte semaine 12"
              placeholderTextColor="#B0BEC5"
              multiline
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setShowAcompteModal(false)}>
                <Text style={styles.modalCancelBtnText}>{t.common.cancel}</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveBtn, (!acompteMontant.trim()) && styles.modalSaveBtnDisabled]}
                onPress={handleSaveAcompte}
                disabled={!acompteMontant.trim()}
              >
                <Text style={styles.modalSaveBtnText}>{t.common.save}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerLogoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerLogo: {
    width: 36,
    height: 36,
  },
  headerSub: {
    fontSize: 18,
    fontWeight: '800',
    color: '#11181C',
  },
  exportBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  exportBtn: {
    backgroundColor: '#1A3A6B',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  exportBtnPDF: {
    backgroundColor: '#E74C3C',
  },
  exportBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noAccess: {
    fontSize: 15,
    color: '#687076',
  },
  vueSelector: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: '#E8ECF2',
    borderRadius: 12,
    padding: 3,
  },
  vueBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  vueBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  vueBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#687076',
  },
  vueBtnTextActive: {
    color: '#1A3A6B',
  },
  scroll: {
    flex: 1,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 16,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  navArrow: {
    fontSize: 22,
    color: '#1A3A6B',
    fontWeight: '700',
  },
  navLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#11181C',
    minWidth: 160,
    textAlign: 'center',
  },
  emptyCard: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#687076',
  },
  empCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  empCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  empAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empAvatarText: {
    fontWeight: '800',
    fontSize: 16,
  },
  empName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#11181C',
  },
  empMetier: {
    fontSize: 12,
    fontWeight: '600',
  },
  empCardAbsent: {
    opacity: 0.75,
    borderLeftWidth: 3,
    borderLeftColor: '#E74C3C',
  },
  horairesTheo: {
    fontSize: 11,
    color: '#687076',
    marginTop: 1,
  },
  dureeBadge: {
    backgroundColor: '#EEF2F8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  dureeBadgeAbsent: {
    backgroundColor: '#FDECEA',
  },
  dureeBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A3A6B',
  },
  pointageRow: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
  },
  pointageCell: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  pointageSep: {
    width: 1,
    backgroundColor: '#E2E6EA',
  },
  pointageLabel: {
    fontSize: 11,
    color: '#687076',
    fontWeight: '600',
    marginBottom: 4,
  },
  pointageHeure: {
    fontSize: 18,
    fontWeight: '800',
    color: '#11181C',
  },
  pointageAbsent: {
    fontSize: 18,
    color: '#B0BEC5',
  },
  ecartText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  acomptesSection: {
    marginBottom: 8,
    gap: 4,
  },
  acomptesMoisSection: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
  },
  acompteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  acompteIcon: {
    fontSize: 14,
  },
  acompteDate: {
    fontSize: 12,
    color: '#687076',
    minWidth: 60,
  },
  acompteMontant: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E65100',
  },
  acompteComment: {
    flex: 1,
    fontSize: 12,
    color: '#687076',
  },
  acompteDelete: {
    padding: 4,
  },
  acompteDeleteText: {
    fontSize: 12,
    color: '#E74C3C',
    fontWeight: '700',
  },
  addAcompteBtn: {
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFF8E1',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFD54F',
    borderStyle: 'dashed',
  },
  addAcompteBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E65100',
  },
  addAcompteBtnLarge: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#FFF8E1',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFD54F',
    borderStyle: 'dashed',
  },
  addAcompteBtnLargeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E65100',
  },
  resumeCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#EEF2F8',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resumeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#687076',
  },
  resumeAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E65100',
  },
  // Vue par employé
  empSelector: {
    maxHeight: 48,
    marginBottom: 8,
  },
  empSelectorContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  empChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E6EA',
    backgroundColor: '#fff',
    gap: 5,
  },
  empChipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  empChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#687076',
  },
  resumeMensuel: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  resumeMensuelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F4F7',
  },
  resumeMensuelLabel: {
    fontSize: 14,
    color: '#687076',
  },
  resumeMensuelValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#11181C',
  },
  resumeMensuelTotal: {
    borderBottomWidth: 0,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 2,
    borderTopColor: '#E2E6EA',
  },
  resumeMensuelTotalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#11181C',
  },
  resumeMensuelTotalValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#687076',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: 16,
    marginBottom: 8,
    marginTop: 4,
  },
  tableau: {
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  tableauRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F2F4F7',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableauHeader: {
    backgroundColor: '#EEF2F8',
    paddingVertical: 10,
  },
  tableauRowWeekend: {
    backgroundColor: '#FAFAFA',
  },
  tableauRowAnomalie: {
    backgroundColor: '#FFF5F5',
  },
  tableauHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#687076',
    textTransform: 'uppercase',
  },
  tableauCell: {
    justifyContent: 'center',
  },
  tableauCellDate: {
    flex: 2,
  },
  tableauCellHeure: {
    flex: 1.2,
    alignItems: 'center',
  },
  tableauCellDuree: {
    flex: 1,
    alignItems: 'flex-end',
  },
  tableauDateText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#11181C',
  },
  tableauDateWeekend: {
    color: '#B0BEC5',
  },
  tableauTheoText: {
    fontSize: 10,
    color: '#B0BEC5',
    marginTop: 1,
  },
  tableauHeureText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#11181C',
  },
  tableauEcartText: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  tableauAbsent: {
    fontSize: 14,
    color: '#B0BEC5',
  },
  tableauDureeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A3A6B',
    textAlign: 'right',
  },
  // Modal acompte
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E6EA',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#11181C',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#687076',
    marginBottom: 16,
  },
  modalFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#687076',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 12,
  },
  modalInput: {
    backgroundColor: '#F2F4F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#11181C',
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F2F4F7',
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  modalCancelBtnText: {
    color: '#687076',
    fontWeight: '600',
    fontSize: 15,
  },
  modalSaveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#1A3A6B',
  },
  modalSaveBtnDisabled: {
    backgroundColor: '#B0BEC5',
  },
  modalSaveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  // Vue saisie manuelle
  saisieEmpBlock: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  saisieEmpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderLeftWidth: 4,
    backgroundColor: '#F8F9FA',
    gap: 8,
  },
  saisieEmpAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saisieEmpName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#11181C',
    flex: 1,
  },
  saisieEmpMetier: {
    fontSize: 11,
    fontWeight: '600',
  },
  saisieTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#EEF2F8',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  saisieHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#687076',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  saisieTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F2F4F7',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  saisieCellDate: {
    width: 90,
    paddingHorizontal: 4,
  },
  saisieCellHeure: {
    width: 70,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
  },
  saisieCellDuree: {
    width: 60,
    alignItems: 'center',
  },
  saisieCellAction: {
    width: 36,
    alignItems: 'center',
  },
  saisieDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#11181C',
  },
  saisieCellText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#11181C',
    textAlign: 'center',
  },
  saisieCellManuelle: {
    backgroundColor: '#FFF8E1',
    borderRadius: 6,
  },
  saisieManuelleIcon: {
    fontSize: 10,
  },
  editAbsentBtn: {
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F2F4F7',
    borderWidth: 1.5,
    borderColor: '#E2E6EA',
  },
  editAbsentBtnActive: {
    backgroundColor: '#E74C3C',
    borderColor: '#E74C3C',
  },
  editAbsentBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#687076',
  },
});
