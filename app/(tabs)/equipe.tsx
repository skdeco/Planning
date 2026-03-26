import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal,
  TextInput, ScrollView, Alert, Platform, Switch,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import {
  METIER_COLORS, METIERS_LIST, HORAIRES_DEFAUT, EMPLOYE_COLORS, ST_COLORS,
  DOC_RH_LABELS, DOC_RH_ORDER,
  type Employe, type Metier, type HorairesHebdo, type DocumentRHEmploye,
} from '@/app/types';

const JOURS_SEMAINE = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function genId(): string {
  return `e_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function getAvatarColor(prenom: string): string {
  const colors = ['#1A3A6B', '#9B59B6', '#27AE60', '#E74C3C', '#0088FF', '#FF6B35', '#FFB800'];
  return colors[prenom.charCodeAt(0) % colors.length];
}

function copyToClipboard(text: string) {
  if (Platform.OS === 'web') {
    navigator.clipboard?.writeText(text).catch(() => {});
  }
}

interface EmployeForm {
  prenom: string;
  nom: string;
  metier: Metier;
  role: 'admin' | 'employe';
  identifiant: string;
  motDePasse: string;
  salaireNet: string;
  modeSalaire: 'mensuel' | 'journalier';
  tarifJournalier: string;
  couleur: string;
  horaires: HorairesHebdo;
  isAcheteur: boolean;
  isRH: boolean;
  isCommercial: boolean;
  doitPointer: boolean;
  telephone: string;
  email: string;
}

const DEFAULT_FORM: EmployeForm = {
  prenom: '',
  nom: '',
  metier: 'autre',
  role: 'employe',
  identifiant: '',
  motDePasse: '',
  salaireNet: '',
  modeSalaire: 'mensuel',
  tarifJournalier: '',
  couleur: EMPLOYE_COLORS[0],
  horaires: { ...HORAIRES_DEFAUT },
  isAcheteur: false,
  isRH: false,
  isCommercial: false,
  doitPointer: true,
  telephone: '',
  email: '',
};

export default function EquipeScreen() {
  const { data, currentUser, isHydrated, addEmploye, updateEmploye, deleteEmploye, addSousTraitant, updateSousTraitant, deleteSousTraitant, addDocumentRH, deleteDocumentRH } = useApp();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !currentUser) router.replace('/login' as any);
  }, [isHydrated, currentUser, router]);

  const isAdmin = currentUser?.role === 'admin';
  const isRH = isAdmin || data.employes.find(e => e.id === currentUser?.employeId)?.isRH;

  const [activeTab, setActiveTab] = useState<'employes' | 'soustraitants'>('employes');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeForm>(DEFAULT_FORM);
  const [filterMetier, setFilterMetier] = useState<Metier | 'all'>('all');
  const [showHoraires, setShowHoraires] = useState(false);
  const [showMdp, setShowMdp] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // ST form
  const [showSTForm, setShowSTForm] = useState(false);
  const [editSTId, setEditSTId] = useState<string | null>(null);
  const [stForm, setSTForm] = useState({ societe: '', prenom: '', nom: '', telephone: '', email: '', identifiant: '', motDePasse: '', couleur: ST_COLORS[0] });
  const [showSTMdp, setShowSTMdp] = useState(false);

  const filteredEmployes = useMemo(() => {
    if (filterMetier === 'all') return data.employes;
    return data.employes.filter(e => e.metier === filterMetier);
  }, [data.employes, filterMetier]);

  const openNew = () => {
    setEditId(null);
    setForm(DEFAULT_FORM);
    setShowHoraires(false);
    setShowMdp(false);
    setShowForm(true);
  };

  const openEdit = (emp: Employe) => {
    setEditId(emp.id);
    setForm({
      prenom: emp.prenom,
      nom: emp.nom,
      metier: emp.metier,
      role: emp.role,
      identifiant: emp.identifiant || '',
      motDePasse: emp.motDePasse || '',
      salaireNet: emp.salaireNet != null ? String(emp.salaireNet) : '',
      modeSalaire: emp.modeSalaire || 'mensuel',
      tarifJournalier: emp.tarifJournalier != null ? String(emp.tarifJournalier) : '',
      couleur: emp.couleur || EMPLOYE_COLORS[0],
      horaires: emp.horaires ? { ...emp.horaires } : { ...HORAIRES_DEFAUT },
      isAcheteur: emp.isAcheteur || false,
      isRH: emp.isRH || false,
      isCommercial: emp.isCommercial || false,
      doitPointer: emp.doitPointer !== false,
      telephone: emp.telephone || '',
      email: emp.email || '',
    });
    setShowHoraires(false);
    setShowMdp(false);
    setShowForm(true);
  };

  const confirmAccreditation = (field: 'isAcheteur' | 'isRH' | 'isCommercial', newValue: boolean, label: string) => {
    if (!newValue) {
      setForm(f => ({ ...f, [field]: false }));
      return;
    }
    const msg = `Accorder l'accréditation "${label}" à cet employé ?`;
    if (Platform.OS === 'web') {
      if ((typeof window !== 'undefined' && window.confirm ? window.confirm(msg) : true)) setForm(f => ({ ...f, [field]: true }));
    } else {
      Alert.alert('Confirmation', msg, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Confirmer', onPress: () => setForm(f => ({ ...f, [field]: true })) },
      ]);
    }
  };

  const handleSave = () => {
    if (!form.prenom.trim() || !form.identifiant.trim() || !form.motDePasse.trim()) return;
    const salaire = form.salaireNet.trim() ? parseFloat(form.salaireNet.replace(',', '.')) : undefined;
    const tarif = form.tarifJournalier.trim() ? parseFloat(form.tarifJournalier.replace(',', '.')) : undefined;
    const employe: Employe = {
      id: editId || genId(),
      prenom: form.prenom.trim(),
      nom: form.nom.trim(),
      metier: form.metier,
      role: form.role,
      identifiant: form.identifiant.trim().toLowerCase(),
      motDePasse: form.motDePasse,
      couleur: form.couleur || EMPLOYE_COLORS[0],
      salaireNet: form.modeSalaire === 'mensuel' && salaire && !isNaN(salaire) ? salaire : undefined,
      modeSalaire: form.modeSalaire,
      tarifJournalier: form.modeSalaire === 'journalier' && tarif && !isNaN(tarif) ? tarif : undefined,
      horaires: form.horaires,
      isAcheteur: form.isAcheteur,
      isRH: form.isRH,
      isCommercial: form.isCommercial,
      doitPointer: form.doitPointer,
      telephone: form.telephone.trim() || undefined,
      email: form.email.trim() || undefined,
    };
    if (editId) {
      updateEmploye(employe);
    } else {
      addEmploye(employe);
    }
    setShowForm(false);
  };

  const handleDelete = (id: string, nom: string) => {
    if (Platform.OS === 'web') {
      if ((typeof window !== 'undefined' && window.confirm ? window.confirm(`Supprimer "${nom}" ?`) : true)) deleteEmploye(id);
    } else {
      Alert.alert('Supprimer l\'employé', `Êtes-vous sûr de vouloir supprimer "${nom}" ?`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteEmploye(id) },
      ]);
    }
  };

  const getChantierCount = (empId: string): number => {
    const today = new Date();
    return data.chantiers.filter(c =>
      c.employeIds.includes(empId) && c.statut === 'actif' && new Date(c.dateFin) >= today
    ).length;
  };

  const updateHoraire = (jour: number, field: 'actif' | 'debut' | 'fin', value: boolean | string) => {
    setForm(f => ({
      ...f,
      horaires: {
        ...f.horaires,
        [jour]: { ...f.horaires[jour], [field]: value },
      },
    }));
  };

  const handleCopy = (text: string, field: string) => {
    copyToClipboard(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // ── Documents RH par employé ──
  const DOC_TYPES: { key: DocumentRHEmploye['type']; label: string }[] = [
    { key: 'contrat_travail', label: 'Contrat de travail' },
    { key: 'due', label: 'DUE (Déclaration Unique d’Embauche)' },
    { key: 'cni', label: 'CNI (Carte Nationale d’Identité)' },
    { key: 'carte_vitale', label: 'Carte Vitale' },
    { key: 'justif_domicile', label: 'Justificatif de domicile' },
  ];

  const [showDocsModal, setShowDocsModal] = useState(false);
  const [docsEmployeId, setDocsEmployeId] = useState<string | null>(null);

  const openDocsModal = (empId: string) => {
    setDocsEmployeId(empId);
    setShowDocsModal(true);
  };

  const handleUploadDoc = (employeId: string, type: DocumentRHEmploye['type'], label: string) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Non disponible', 'L’upload de fichiers est disponible depuis le navigateur web.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const doc: DocumentRHEmploye = {
          id: `drh_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          employeId,
          type,
          libelle: label,
          fichier: reader.result as string,
          uploadedAt: new Date().toISOString(),
          uploadedBy: currentUser?.employeId || 'admin',
        };
        addDocumentRH(doc);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleDeleteDoc = (docId: string, label: string) => {
    const doDelete = () => deleteDocumentRH(docId);
    if (Platform.OS === 'web') {
      if ((typeof window !== 'undefined' && window.confirm ? window.confirm(`Supprimer le document "${label}" ?\nCette action est irréversible.`) : true)) doDelete();
    } else {
      Alert.alert('Supprimer ?', `Supprimer "${label}" ?`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // ── Sous-traitants ──
  const openNewST = () => {
    setEditSTId(null);
    setSTForm({ societe: '', prenom: '', nom: '', telephone: '', email: '', identifiant: '', motDePasse: '', couleur: ST_COLORS[0] });
    setShowSTMdp(false);
    setShowSTForm(true);
  };

  const openEditST = (st: any) => {
    setEditSTId(st.id);
    setSTForm({ societe: st.societe || '', prenom: st.prenom || '', nom: st.nom || '', telephone: st.telephone || '', email: st.email || '', identifiant: st.identifiant || '', motDePasse: st.motDePasse || '', couleur: st.couleur || ST_COLORS[0] });
    setShowSTMdp(false);
    setShowSTForm(true);
  };

  const handleSaveST = () => {
    if (!stForm.identifiant.trim() || !stForm.motDePasse.trim()) return;
    const st = {
      id: editSTId || `st_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      societe: stForm.societe.trim(),
      prenom: stForm.prenom.trim(),
      nom: stForm.nom.trim(),
      adresse: '',
      telephone: stForm.telephone.trim(),
      email: stForm.email.trim(),
      identifiant: stForm.identifiant.trim().toLowerCase(),
      motDePasse: stForm.motDePasse,
      documents: editSTId ? (data.sousTraitants.find(s => s.id === editSTId)?.documents || []) : [],
      couleur: stForm.couleur,
    };
    if (editSTId) updateSousTraitant(st);
    else addSousTraitant(st);
    setShowSTForm(false);
  };

  const handleDeleteST = (id: string, nom: string) => {
    if (Platform.OS === 'web') {
      if ((typeof window !== 'undefined' && window.confirm ? window.confirm(`Supprimer "${nom}" ?`) : true)) deleteSousTraitant(id);
    } else {
      Alert.alert('Supprimer', `Supprimer "${nom}" ?`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteSousTraitant(id) },
      ]);
    }
  };

  const renderEmploye = ({ item }: { item: Employe }) => {
    const mc = METIER_COLORS[item.metier];
    const avatarColor = item.couleur || getAvatarColor(item.prenom);
    const count = getChantierCount(item.id);

    return (
      <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: avatarColor }]}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{item.prenom[0].toUpperCase()}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{item.prenom} {item.nom}</Text>
          <View style={[styles.metierBadge, { backgroundColor: mc.color + '22' }]}>
            <View style={[styles.metierDot, { backgroundColor: mc.color }]} />
            <Text style={[styles.metierText, { color: mc.color }]}>{mc.label}</Text>
          </View>
          {count > 0 && (
            <Text style={styles.chantierCount}>{count} chantier{count > 1 ? 's' : ''} en cours</Text>
          )}
          {item.telephone ? <Text style={styles.contactInfo}>📞 {item.telephone}</Text> : null}
          {item.email ? <Text style={styles.contactInfo}>✉ {item.email}</Text> : null}
          {(isAdmin || isRH) && item.salaireNet != null && item.modeSalaire !== 'journalier' && (
            <Text style={styles.salaireInfo}>💶 {item.salaireNet.toLocaleString('fr-FR')} € net/mois</Text>
          )}
          {(isAdmin || isRH) && item.modeSalaire === 'journalier' && item.tarifJournalier != null && (
            <Text style={styles.salaireInfo}>💶 {item.tarifJournalier.toLocaleString('fr-FR')} €/jour</Text>
          )}
          {/* Badges accréditations */}
          <View style={styles.badgesRow}>
            {item.isAcheteur && <View style={styles.badge}><Text style={styles.badgeText}>🛒 Acheteur</Text></View>}
            {item.isRH && <View style={[styles.badge, { backgroundColor: '#D4EDDA' }]}><Text style={[styles.badgeText, { color: '#155724' }]}>👥 RH</Text></View>}
            {item.isCommercial && <View style={[styles.badge, { backgroundColor: '#FFF3CD' }]}><Text style={[styles.badgeText, { color: '#856404' }]}>💼 Commercial</Text></View>}
            {item.doitPointer === false && <View style={[styles.badge, { backgroundColor: '#F8D7DA' }]}><Text style={[styles.badgeText, { color: '#721C24' }]}>⏱ Sans pointage</Text></View>}
          </View>
           {/* Copier identifiants */}
          {(isAdmin || isRH) && (
            <View style={styles.credentialsRow}>
              <Pressable style={styles.credentialBtn} onPress={() => handleCopy(`Identifiant : ${item.identifiant}, MDP : ${item.motDePasse}`, `all_${item.id}`)}>
                <Text style={styles.credentialBtnText}>
                  {copiedField === `all_${item.id}` ? '✓ Copié !' : `📋 Identifiant : ${item.identifiant}, MDP : ${item.motDePasse}`}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
        <View style={styles.cardActions}>
          {(isAdmin || isRH) && (
            <Pressable style={[styles.actionBtn, { backgroundColor: '#EFF6FF' }]} onPress={() => openDocsModal(item.id)}>
              <Text style={{ fontSize: 16 }}>📂</Text>
            </Pressable>
          )}
          <Pressable style={styles.actionBtn} onPress={() => openEdit(item)}>
            <Text style={styles.actionEdit}>✏</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => handleDelete(item.id, `${item.prenom} ${item.nom}`)}>
            <Text style={styles.actionDelete}>🗑</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderST = ({ item }: { item: any }) => (
    <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: item.couleur || '#00BCD4' }]}>
      <View style={[styles.avatar, { backgroundColor: item.couleur || '#00BCD4' }]}>
        <Text style={styles.avatarText}>{(item.societe || item.prenom || '?')[0].toUpperCase()}</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{item.societe || `${item.prenom} ${item.nom}`}</Text>
        {item.societe ? <Text style={styles.chantierCount}>{item.prenom} {item.nom}</Text> : null}
        {item.telephone ? <Text style={styles.contactInfo}>📞 {item.telephone}</Text> : null}
        {item.email ? <Text style={styles.contactInfo}>✉ {item.email}</Text> : null}
        <View style={[styles.badge, { backgroundColor: '#E0F7FA', marginTop: 4 }]}>
          <Text style={[styles.badgeText, { color: '#006064' }]}>🔧 Sous-traitant</Text>
        </View>
          {/* Identifiant visible + copie - admin/RH uniquement */}
        {(isAdmin || isRH) && (<View style={styles.credentialsRow}>
          <Pressable style={styles.credentialBtn} onPress={() => handleCopy(`Identifiant : ${item.identifiant}, MDP : ${item.motDePasse}`, `stall_${item.id}`)}>
            <Text style={styles.credentialBtnText}>
              {copiedField === `stall_${item.id}` ? '✓ Copié !' : `📋 Identifiant : ${item.identifiant}, MDP : ${item.motDePasse}`}
            </Text>
          </Pressable>
        </View>)}
      </View>
      <View style={styles.cardActions}>
        <Pressable style={styles.actionBtn} onPress={() => openEditST(item)}>
          <Text style={styles.actionEdit}>✏</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => handleDeleteST(item.id, item.societe || `${item.prenom} ${item.nom}`)}>
          <Text style={styles.actionDelete}>🗑</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <ScreenContainer containerClassName="bg-[#F2F4F7]">
      {/* En-tête */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.equipe.title}</Text>
        <Pressable style={styles.addBtn} onPress={activeTab === 'employes' ? openNew : openNewST}>
          <Text style={styles.addBtnText}>+ Ajouter</Text>
        </Pressable>
      </View>

      {/* Onglets Employés / Sous-traitants */}
      <View style={styles.tabRow}>
        <Pressable style={[styles.tabBtn, activeTab === 'employes' && styles.tabBtnActive]} onPress={() => setActiveTab('employes')}>
          <Text style={[styles.tabBtnText, activeTab === 'employes' && styles.tabBtnTextActive]}>
            👷 Employés ({data.employes.length})
          </Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, activeTab === 'soustraitants' && styles.tabBtnActive]} onPress={() => setActiveTab('soustraitants')}>
          <Text style={[styles.tabBtnText, activeTab === 'soustraitants' && styles.tabBtnTextActive]}>
            🔧 Sous-traitants ({data.sousTraitants.length})
          </Text>
        </Pressable>
      </View>

      {activeTab === 'employes' && (
        <>
          {/* Filtre métiers */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
            <Pressable style={[styles.filterChip, filterMetier === 'all' && styles.filterChipActive]} onPress={() => setFilterMetier('all')}>
              <Text style={[styles.filterChipText, filterMetier === 'all' && styles.filterChipTextActive]}>Tous</Text>
            </Pressable>
            {METIERS_LIST.map(m => {
              const mc = METIER_COLORS[m];
              const active = filterMetier === m;
              return (
                <Pressable key={m} style={[styles.filterChip, active && { backgroundColor: mc.color, borderColor: mc.color }]} onPress={() => setFilterMetier(m)}>
                  <View style={[styles.filterDot, { backgroundColor: mc.color }]} />
                  <Text style={[styles.filterChipText, active && { color: '#fff' }]}>{mc.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <FlatList
            data={filteredEmployes}
            keyExtractor={item => item.id}
            renderItem={renderEmploye}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyText}>Aucun employé trouvé.</Text></View>}
          />
        </>
      )}

      {activeTab === 'soustraitants' && (
        <FlatList
          data={data.sousTraitants}
          keyExtractor={item => item.id}
          renderItem={renderST}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyText}>Aucun sous-traitant.</Text></View>}
        />
      )}

      {/* ── Modal Employé ── */}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowForm(false)}>
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editId ? 'Modifier l\'employé' : 'Nouvel employé'}</Text>
              <Pressable onPress={() => setShowForm(false)}><Text style={styles.modalClose}>✕</Text></Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Prénom / Nom */}
              <View style={styles.nameRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>Prénom *</Text>
                  <TextInput style={styles.input} value={form.prenom} onChangeText={v => setForm(f => ({ ...f, prenom: v }))} placeholder="Ex: Sacha" placeholderTextColor="#B0BEC5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Nom</Text>
                  <TextInput style={styles.input} value={form.nom} onChangeText={v => setForm(f => ({ ...f, nom: v }))} placeholder="Ex: Martin" placeholderTextColor="#B0BEC5" />
                </View>
              </View>

              {/* Téléphone / Email */}
              <View style={[styles.nameRow, { marginTop: 12 }]}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>Téléphone</Text>
                  <TextInput style={styles.input} value={form.telephone} onChangeText={v => setForm(f => ({ ...f, telephone: v }))} placeholder="06 00 00 00 00" placeholderTextColor="#B0BEC5" keyboardType="phone-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <TextInput style={styles.input} value={form.email} onChangeText={v => setForm(f => ({ ...f, email: v }))} placeholder="email@exemple.fr" placeholderTextColor="#B0BEC5" keyboardType="email-address" autoCapitalize="none" />
                </View>
              </View>

              {/* Identifiant */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Identifiant de connexion *</Text>
              <TextInput style={styles.input} value={form.identifiant} onChangeText={v => setForm(f => ({ ...f, identifiant: v }))} placeholder="Ex: sacha.martin" placeholderTextColor="#B0BEC5" autoCapitalize="none" autoCorrect={false} />

              {/* Mot de passe */}
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Mot de passe *</Text>
              <View style={styles.mdpRow}>
                <TextInput style={[styles.input, { flex: 1 }]} value={form.motDePasse} onChangeText={v => setForm(f => ({ ...f, motDePasse: v }))} placeholder="Ex: 1234" placeholderTextColor="#B0BEC5" secureTextEntry={!showMdp} autoCapitalize="none" autoCorrect={false} />
                <Pressable style={styles.mdpToggle} onPress={() => setShowMdp(v => !v)}>
                  <Text style={styles.mdpToggleText}>{showMdp ? '🙈' : '👁'}</Text>
                </Pressable>
              </View>

              {/* Mode salaire */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Mode de rémunération</Text>
              <View style={styles.roleRow}>
                {(['mensuel', 'journalier'] as const).map(m => (
                  <Pressable key={m} style={[styles.roleChip, form.modeSalaire === m && styles.roleChipActive]} onPress={() => setForm(f => ({ ...f, modeSalaire: m }))}>
                    <Text style={[styles.roleChipText, form.modeSalaire === m && styles.roleChipTextActive]}>
                      {m === 'mensuel' ? '💶 Mensuel fixe' : '📅 Journalier'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {form.modeSalaire === 'mensuel' ? (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Salaire net mensuel (€)</Text>
                  <TextInput style={styles.input} value={form.salaireNet} onChangeText={v => setForm(f => ({ ...f, salaireNet: v }))} placeholder="Ex: 1800" placeholderTextColor="#B0BEC5" keyboardType="numeric" />
                  <Text style={styles.fieldHint}>Visible uniquement par l'administrateur et le RH</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Tarif journalier (€/jour)</Text>
                  <TextInput style={styles.input} value={form.tarifJournalier} onChangeText={v => setForm(f => ({ ...f, tarifJournalier: v }))} placeholder="Ex: 150" placeholderTextColor="#B0BEC5" keyboardType="numeric" />
                  <Text style={styles.fieldHint}>Salaire = nb jours ouvrables du mois × tarif journalier</Text>
                </>
              )}

              {/* Couleur */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Couleur dans le planning</Text>
              <View style={styles.colorRow}>
                {EMPLOYE_COLORS.map(c => (
                  <Pressable key={c} style={[styles.colorSwatch, { backgroundColor: c }, form.couleur === c && styles.colorSwatchActive]} onPress={() => setForm(f => ({ ...f, couleur: c }))} />
                ))}
              </View>

              {/* Métier */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Métier</Text>
              <View style={styles.metierGrid}>
                {METIERS_LIST.map(m => {
                  const mc = METIER_COLORS[m];
                  const active = form.metier === m;
                  return (
                    <Pressable key={m} style={[styles.metierOption, active && { borderColor: mc.color, backgroundColor: mc.color + '15' }]} onPress={() => setForm(f => ({ ...f, metier: m }))}>
                      <View style={[styles.metierOptionDot, { backgroundColor: mc.color }]} />
                      <Text style={[styles.metierOptionText, active && { color: mc.color, fontWeight: '700' }]}>{mc.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Rôle */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Rôle</Text>
              <View style={styles.roleRow}>
                {(['employe', 'admin'] as const).map(r => (
                  <Pressable key={r} style={[styles.roleChip, form.role === r && styles.roleChipActive]} onPress={() => setForm(f => ({ ...f, role: r }))}>
                    <Text style={[styles.roleChipText, form.role === r && styles.roleChipTextActive]}>{r === 'admin' ? 'Administrateur' : 'Employé'}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Pointage obligatoire */}
              <View style={styles.acheteurRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Pointage requis ⏱</Text>
                  <Text style={styles.fieldHint}>Désactiver pour les employés qui ne pointent pas</Text>
                </View>
                <Switch value={form.doitPointer} onValueChange={v => setForm(f => ({ ...f, doitPointer: v }))} trackColor={{ false: '#E2E6EA', true: '#1A3A6B' }} thumbColor="#fff" />
              </View>

              {/* Accréditation Acheteur */}
              <View style={styles.acheteurRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Rôle acheteur 🛒</Text>
                  <Text style={styles.fieldHint}>Peut voir toutes les listes matériel et valider les achats</Text>
                </View>
                <Switch value={form.isAcheteur} onValueChange={v => confirmAccreditation('isAcheteur', v, 'Acheteur 🛒')} trackColor={{ false: '#E2E6EA', true: '#1A3A6B' }} thumbColor="#fff" />
              </View>

              {/* Accréditation RH */}
              <View style={styles.acheteurRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Accréditation RH 👥</Text>
                  <Text style={styles.fieldHint}>Peut gérer les congés, arrêts maladie et avances</Text>
                </View>
                <Switch value={form.isRH} onValueChange={v => confirmAccreditation('isRH', v, 'Ressources Humaines 👥')} trackColor={{ false: '#E2E6EA', true: '#27AE60' }} thumbColor="#fff" />
              </View>

              {/* Accréditation Commercial */}
              <View style={styles.acheteurRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Accréditation Commercial 💼</Text>
                  <Text style={styles.fieldHint}>Accès au module devis et facturation (bientôt)</Text>
                </View>
                <Switch value={form.isCommercial} onValueChange={v => confirmAccreditation('isCommercial', v, 'Commercial 💼')} trackColor={{ false: '#E2E6EA', true: '#F39C12' }} thumbColor="#fff" />
              </View>

              {/* Horaires théoriques */}
              <Pressable style={styles.horairesToggle} onPress={() => setShowHoraires(v => !v)}>
                <Text style={styles.horairesToggleText}>{showHoraires ? '▼' : '▶'} Horaires théoriques</Text>
                <Text style={styles.horairesToggleHint}>Utilisés pour détecter les retards</Text>
              </Pressable>

              {showHoraires && (
                <View style={styles.horairesGrid}>
                  {[1, 2, 3, 4, 5, 6, 0].map(jour => {
                    const h = form.horaires[jour];
                    return (
                      <View key={jour} style={styles.horaireRow}>
                        <View style={styles.horaireJourWrap}>
                          <Switch value={h.actif} onValueChange={v => updateHoraire(jour, 'actif', v)} trackColor={{ false: '#E2E6EA', true: '#1A3A6B' }} thumbColor="#fff" />
                          <Text style={[styles.horaireJour, !h.actif && styles.horaireJourOff]}>{JOURS_SEMAINE[jour]}</Text>
                        </View>
                        {h.actif ? (
                          <View style={styles.horaireHeures}>
                            <TextInput style={styles.horaireInput} value={h.debut} onChangeText={v => updateHoraire(jour, 'debut', v)} placeholder="08:00" placeholderTextColor="#B0BEC5" keyboardType="numbers-and-punctuation" maxLength={5} />
                            <Text style={styles.horaireArrow}>→</Text>
                            <TextInput style={styles.horaireInput} value={h.fin} onChangeText={v => updateHoraire(jour, 'fin', v)} placeholder="17:00" placeholderTextColor="#B0BEC5" keyboardType="numbers-and-punctuation" maxLength={5} />
                          </View>
                        ) : (
                          <Text style={styles.horaireRepos}>Repos</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            <Pressable
              style={[styles.saveBtn, (!form.prenom.trim() || !form.identifiant.trim() || !form.motDePasse.trim()) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!form.prenom.trim() || !form.identifiant.trim() || !form.motDePasse.trim()}
            >
              <Text style={styles.saveBtnText}>{editId ? 'Enregistrer' : 'Ajouter l\'employé'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal Documents RH Employé ── */}
      <Modal visible={showDocsModal} animationType="slide" transparent onRequestClose={() => setShowDocsModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowDocsModal(false)}>
          <Pressable style={[styles.modalSheet, { maxHeight: '90%' }]} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {docsEmployeId
                  ? `📂 Documents de ${data.employes.find(e => e.id === docsEmployeId)?.prenom || ''} ${data.employes.find(e => e.id === docsEmployeId)?.nom || ''}`
                  : '📂 Documents RH'
                }
              </Text>
              <Pressable onPress={() => setShowDocsModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {DOC_RH_ORDER.map(type => {
                const docs = (data.documentsRH || []).filter(
                  d => d.employeId === docsEmployeId && d.type === type
                );
                return (
                  <View key={type} style={docStyles.typeSection}>
                    <View style={docStyles.typeHeader}>
                      <Text style={docStyles.typeLabel}>{DOC_RH_LABELS[type]}</Text>
                      {(isAdmin || isRH) && (
                        <Pressable
                          style={docStyles.uploadBtn}
                          onPress={() => docsEmployeId && handleUploadDoc(docsEmployeId, type, DOC_RH_LABELS[type])}
                        >
                          <Text style={docStyles.uploadBtnText}>+ Ajouter</Text>
                        </Pressable>
                      )}
                    </View>
                    {docs.length === 0 ? (
                      <Text style={docStyles.emptyDoc}>Aucun document</Text>
                    ) : (
                      docs.map(doc => (
                        <View key={doc.id} style={docStyles.docRow}>
                          <Pressable
                            style={docStyles.docName}
                            onPress={() => {
                              if (Platform.OS === 'web') {
                                const win = window.open();
                                if (win) win.document.write(`<iframe src="${doc.fichier}" style="width:100%;height:100%;border:none;"/>`);
                              }
                            }}
                          >
                            <Text style={docStyles.docNameText} numberOfLines={1}>
                              📄 {doc.libelle || DOC_RH_LABELS[doc.type]}
                            </Text>
                            <Text style={docStyles.docDate}>
                              {new Date(doc.uploadedAt).toLocaleDateString('fr-FR')}
                            </Text>
                          </Pressable>
                          {(isAdmin || isRH) && (
                            <Pressable
                              style={docStyles.docDelete}
                              onPress={() => handleDeleteDoc(doc.id, doc.libelle || DOC_RH_LABELS[doc.type])}
                            >
                              <Text style={docStyles.docDeleteText}>🗑</Text>
                            </Pressable>
                          )}
                        </View>
                      ))
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal Sous-traitant ── */}
      <Modal visible={showSTForm} animationType="slide" transparent onRequestClose={() => setShowSTForm(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSTForm(false)}>
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editSTId ? 'Modifier le sous-traitant' : 'Nouveau sous-traitant'}</Text>
              <Pressable onPress={() => setShowSTForm(false)}><Text style={styles.modalClose}>✕</Text></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Société / Raison sociale</Text>
              <TextInput style={styles.input} value={stForm.societe} onChangeText={v => setSTForm(f => ({ ...f, societe: v }))} placeholder="Ex: Plomberie Dupont" placeholderTextColor="#B0BEC5" />

              <View style={[styles.nameRow, { marginTop: 12 }]}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>Prénom</Text>
                  <TextInput style={styles.input} value={stForm.prenom} onChangeText={v => setSTForm(f => ({ ...f, prenom: v }))} placeholder="Jean" placeholderTextColor="#B0BEC5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Nom</Text>
                  <TextInput style={styles.input} value={stForm.nom} onChangeText={v => setSTForm(f => ({ ...f, nom: v }))} placeholder="Dupont" placeholderTextColor="#B0BEC5" />
                </View>
              </View>

              <View style={[styles.nameRow, { marginTop: 12 }]}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>Téléphone</Text>
                  <TextInput style={styles.input} value={stForm.telephone} onChangeText={v => setSTForm(f => ({ ...f, telephone: v }))} placeholder="06 00 00 00 00" placeholderTextColor="#B0BEC5" keyboardType="phone-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <TextInput style={styles.input} value={stForm.email} onChangeText={v => setSTForm(f => ({ ...f, email: v }))} placeholder="email@exemple.fr" placeholderTextColor="#B0BEC5" keyboardType="email-address" autoCapitalize="none" />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Identifiant de connexion *</Text>
              <TextInput style={styles.input} value={stForm.identifiant} onChangeText={v => setSTForm(f => ({ ...f, identifiant: v }))} placeholder="Ex: plomberie.dupont" placeholderTextColor="#B0BEC5" autoCapitalize="none" autoCorrect={false} />

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Mot de passe * (visible par l'admin)</Text>
              <View style={styles.mdpRow}>
                <TextInput style={[styles.input, { flex: 1 }]} value={stForm.motDePasse} onChangeText={v => setSTForm(f => ({ ...f, motDePasse: v }))} placeholder="Ex: st1234" placeholderTextColor="#B0BEC5" secureTextEntry={!showSTMdp} autoCapitalize="none" autoCorrect={false} />
                <Pressable style={styles.mdpToggle} onPress={() => setShowSTMdp(v => !v)}>
                  <Text style={styles.mdpToggleText}>{showSTMdp ? '🙈' : '👁'}</Text>
                </Pressable>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Couleur dans le planning</Text>
              <View style={styles.colorRow}>
                {ST_COLORS.map(c => (
                  <Pressable key={c} style={[styles.colorSwatch, { backgroundColor: c }, stForm.couleur === c && styles.colorSwatchActive]} onPress={() => setSTForm(f => ({ ...f, couleur: c }))} />
                ))}
              </View>
            </ScrollView>

            <Pressable
              style={[styles.saveBtn, (!stForm.identifiant.trim() || !stForm.motDePasse.trim()) && styles.saveBtnDisabled]}
              onPress={handleSaveST}
              disabled={!stForm.identifiant.trim() || !stForm.motDePasse.trim()}
            >
              <Text style={styles.saveBtnText}>{editSTId ? 'Enregistrer' : 'Ajouter le sous-traitant'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#11181C' },
  addBtn: { backgroundColor: '#1A3A6B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  tabRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, gap: 8 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E6EA', alignItems: 'center', backgroundColor: '#F2F4F7' },
  tabBtnActive: { borderColor: '#1A3A6B', backgroundColor: '#1A3A6B' },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: '#687076' },
  tabBtnTextActive: { color: '#fff' },
  filterScroll: { maxHeight: 44, marginBottom: 8 },
  filterContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#E2E6EA', backgroundColor: '#fff', gap: 5 },
  filterChipActive: { backgroundColor: '#1A3A6B', borderColor: '#1A3A6B' },
  filterChipText: { fontSize: 12, fontWeight: '500', color: '#687076' },
  filterChipTextActive: { color: '#fff' },
  filterDot: { width: 7, height: 7, borderRadius: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'flex-start', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 20 },
  cardInfo: { flex: 1, gap: 4 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#11181C' },
  metierBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  metierDot: { width: 7, height: 7, borderRadius: 4 },
  metierText: { fontSize: 12, fontWeight: '600' },
  chantierCount: { fontSize: 12, color: '#687076' },
  contactInfo: { fontSize: 12, color: '#687076' },
  salaireInfo: { fontSize: 12, color: '#27AE60', fontWeight: '600' },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  badge: { backgroundColor: '#EEF2F8', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#1A3A6B' },
  credentialsRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  credentialBtn: { backgroundColor: '#F2F4F7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#E2E6EA' },
  credentialBtnText: { fontSize: 11, fontWeight: '600', color: '#1A3A6B' },
  cardActions: { flexDirection: 'row', gap: 2, marginLeft: 8 },
  actionBtn: { padding: 6 },
  actionEdit: { fontSize: 16, color: '#687076' },
  actionDelete: { fontSize: 16, color: '#E74C3C' },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#687076' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, maxHeight: '92%' },
  modalHandle: { width: 40, height: 4, backgroundColor: '#E2E6EA', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#11181C' },
  modalClose: { fontSize: 18, color: '#687076', padding: 4 },
  nameRow: { flexDirection: 'row' },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldHint: { fontSize: 11, color: '#B0BEC5', marginTop: 4, fontStyle: 'italic' },
  input: { backgroundColor: '#F2F4F7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA' },
  mdpRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mdpToggle: { backgroundColor: '#F2F4F7', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E2E6EA' },
  mdpToggleText: { fontSize: 18 },
  metierGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metierOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E6EA', backgroundColor: '#F2F4F7', gap: 6 },
  metierOptionDot: { width: 8, height: 8, borderRadius: 4 },
  metierOptionText: { fontSize: 13, fontWeight: '500', color: '#687076' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  colorSwatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  colorSwatchActive: { borderColor: '#11181C', transform: [{ scale: 1.2 }] },
  roleRow: { flexDirection: 'row', gap: 10 },
  roleChip: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E6EA', alignItems: 'center', backgroundColor: '#F2F4F7' },
  roleChipActive: { borderColor: '#1A3A6B', backgroundColor: '#1A3A6B' },
  roleChipText: { fontSize: 14, fontWeight: '600', color: '#687076' },
  roleChipTextActive: { color: '#fff' },
  acheteurRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#EEF2F8', borderRadius: 10, borderWidth: 1, borderColor: '#D0D8E8', gap: 12 },
  horairesToggle: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#EEF2F8', borderRadius: 10, borderWidth: 1, borderColor: '#D0D8E8' },
  horairesToggleText: { fontSize: 14, fontWeight: '700', color: '#1A3A6B' },
  horairesToggleHint: { fontSize: 11, color: '#687076', marginTop: 2 },
  horairesGrid: { marginTop: 10, gap: 8 },
  horaireRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 10 },
  horaireJourWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 72 },
  horaireJour: { fontSize: 13, fontWeight: '700', color: '#11181C', width: 30 },
  horaireJourOff: { color: '#B0BEC5' },
  horaireHeures: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  horaireInput: { flex: 1, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA', textAlign: 'center' },
  horaireArrow: { fontSize: 14, color: '#687076' },
  horaireRepos: { flex: 1, fontSize: 13, color: '#B0BEC5', fontStyle: 'italic', textAlign: 'center' },
  saveBtn: { marginTop: 20, backgroundColor: '#1A3A6B', paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#B0BEC5' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

const docStyles = StyleSheet.create({
  typeSection: { marginBottom: 16, backgroundColor: '#F8F9FA', borderRadius: 12, padding: 12 },
  typeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeLabel: { fontSize: 14, fontWeight: '700', color: '#1A3A6B', flex: 1 },
  uploadBtn: { backgroundColor: '#1A3A6B', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  uploadBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  emptyDoc: { fontSize: 12, color: '#B0BEC5', fontStyle: 'italic', paddingLeft: 4 },
  docRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, padding: 10, marginTop: 6, borderWidth: 1, borderColor: '#E2E6EA' },
  docName: { flex: 1 },
  docNameText: { fontSize: 13, fontWeight: '600', color: '#11181C' },
  docDate: { fontSize: 11, color: '#687076', marginTop: 2 },
  docDelete: { padding: 6 },
  docDeleteText: { fontSize: 16 },
});
