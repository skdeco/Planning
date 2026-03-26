import React, { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal,
  TextInput, ScrollView, Alert, Platform, Image,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import {
  ST_COLORS, STATUT_LABELS, STATUT_COLORS,
  type SousTraitant, type DevisST, type MarcheST, type AcompteST, type DocumentST,
} from '@/app/types';
import { DatePicker } from '@/components/DatePicker';

function genId(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function SousTraitantsScreen() {
  const {
    data, currentUser, isHydrated,
    addSousTraitant, updateSousTraitant, deleteSousTraitant,
    addDevis, updateDevis, deleteDevis,
    addAcompteST, updateAcompteST, deleteAcompteST,
  } = useApp();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !currentUser) router.replace('/login' as any);
    if (isHydrated && currentUser && currentUser.role !== 'admin') router.replace('/(tabs)/planning' as any);
  }, [isHydrated, currentUser, router]);

  // ── État liste ──
  const [selectedST, setSelectedST] = useState<SousTraitant | null>(null);
  const [innerTab, setInnerTab] = useState<'infos' | 'finances'>('infos');

  // ── État formulaire ST ──
  const [showSTForm, setShowSTForm] = useState(false);
  const [editSTId, setEditSTId] = useState<string | null>(null);
  const [stForm, setStForm] = useState<Omit<SousTraitant, 'id' | 'documents'>>({
    societe: '', prenom: '', nom: '', adresse: '', telephone: '', email: '',
    identifiant: '', motDePasse: '', couleur: ST_COLORS[0],
  });

  // ── État documents légaux ──
  const [showDocModal, setShowDocModal] = useState(false);
  const [docLibelle, setDocLibelle] = useState('');
  const [docFichier, setDocFichier] = useState('');

  // ── État devis ──
  const [showDevisForm, setShowDevisForm] = useState(false);
  const [editDevisId, setEditDevisId] = useState<string | null>(null);
  const [devisForm, setDevisForm] = useState({
    chantierId: '', objet: '', prixConvenu: '',
  });

  // ── État acompte ST ──
  const [showAcompteForm, setShowAcompteForm] = useState(false);
  const [acompteTargetDevisId, setAcompteTargetDevisId] = useState('');
  const [acompteForm, setAcompteForm] = useState({ date: '', montant: '', commentaire: '' });

  // ── Ouverture fiche ST ──
  const openST = (st: SousTraitant) => {
    setSelectedST(st);
    setInnerTab('infos');
  };

  const openNewST = () => {
    setEditSTId(null);
    setStForm({ societe: '', prenom: '', nom: '', adresse: '', telephone: '', email: '', identifiant: '', motDePasse: '', couleur: ST_COLORS[0] });
    setShowSTForm(true);
  };

  const openEditST = (st: SousTraitant) => {
    setEditSTId(st.id);
    setStForm({ societe: st.societe || '', prenom: st.prenom, nom: st.nom, adresse: st.adresse, telephone: st.telephone, email: st.email, identifiant: st.identifiant, motDePasse: st.motDePasse, couleur: st.couleur });
    setShowSTForm(true);
  };

  const handleSaveST = () => {
    if (!stForm.prenom.trim() || !stForm.nom.trim()) return;
    if (editSTId) {
      const existing = data.sousTraitants.find(s => s.id === editSTId)!;
      updateSousTraitant({ ...existing, ...stForm });
      if (selectedST?.id === editSTId) setSelectedST({ ...existing, ...stForm });
    } else {
      const newST: SousTraitant = { id: genId('st'), ...stForm, documents: [] };
      addSousTraitant(newST);
    }
    setShowSTForm(false);
  };

  const handleDeleteST = (st: SousTraitant) => {
    const confirm = () => { deleteSousTraitant(st.id); setSelectedST(null); };
    if (Platform.OS === 'web') {
      if ((typeof window !== 'undefined' && window.confirm ? window.confirm(`${t.sousTraitants.deleteST} "${st.prenom} ${st.nom}" ?`) : true)) confirm();
    } else {
      Alert.alert(t.common.delete, `${t.sousTraitants.deleteST} "${st.prenom} ${st.nom}" ?`, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.common.delete, style: 'destructive', onPress: confirm },
      ]);
    }
  };

  // ── Documents légaux ──
  const handlePickDoc = () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf,image/*';
      input.onchange = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setDocFichier(reader.result as string);
        reader.readAsDataURL(file);
      };
      input.click();
    }
  };

  const handleSaveDoc = () => {
    if (!selectedST || !docLibelle.trim() || !docFichier) return;
    const doc: DocumentST = {
      id: genId('doc'),
      libelle: docLibelle.trim(),
      fichier: docFichier,
      uploadedAt: new Date().toISOString(),
    };
    const updated = { ...selectedST, documents: [...selectedST.documents, doc] };
    updateSousTraitant(updated);
    setSelectedST(updated);
    setDocLibelle(''); setDocFichier(''); setShowDocModal(false);
  };

  const handleDeleteDoc = (docId: string) => {
    if (!selectedST) return;
    const updated = { ...selectedST, documents: selectedST.documents.filter(d => d.id !== docId) };
    updateSousTraitant(updated);
    setSelectedST(updated);
  };

  // ── Devis ST ──
  const stDevis = selectedST ? data.devis.filter(d => d.soustraitantId === selectedST.id) : [];

  const openNewDevis = () => {
    setEditDevisId(null);
    setDevisForm({ chantierId: data.chantiers[0]?.id || '', objet: '', prixConvenu: '' });
    setShowDevisForm(true);
  };

  const openEditDevis = (d: DevisST) => {
    setEditDevisId(d.id);
    setDevisForm({ chantierId: d.chantierId, objet: d.objet, prixConvenu: String(d.prixConvenu) });
    setShowDevisForm(true);
  };

  const handleSaveDevis = () => {
    if (!selectedST || !devisForm.chantierId || !devisForm.prixConvenu) return;
    const prix = parseFloat(devisForm.prixConvenu.replace(',', '.'));
    if (isNaN(prix)) return;
    if (editDevisId) {
      const existing = data.devis.find(d => d.id === editDevisId)!;
      updateDevis({ ...existing, chantierId: devisForm.chantierId, objet: devisForm.objet, prixConvenu: prix });
    } else {
      addDevis({
        id: genId('dv'),
        soustraitantId: selectedST.id,
        chantierId: devisForm.chantierId,
        objet: devisForm.objet || 'Devis',
        prixConvenu: prix,
        createdAt: new Date().toISOString(),
      });
    }
    setShowDevisForm(false);
  };

  const handleDeleteDevis = (d: DevisST) => {
    const confirm = () => deleteDevis(d.id);
    if (Platform.OS === 'web') {
      if ((typeof window !== 'undefined' && window.confirm ? window.confirm(t.sousTraitants.deleteDevis) : true)) confirm();
    } else {
      Alert.alert(t.common.delete, t.sousTraitants.deleteDevis, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.common.delete, style: 'destructive', onPress: confirm },
      ]);
    }
  };

  // ── Acomptes ST ──
  const openNewAcompte = (devisId: string) => {
    setAcompteTargetDevisId(devisId);
    const today = new Date().toISOString().split('T')[0];
    setAcompteForm({ date: today, montant: '', commentaire: '' });
    setShowAcompteForm(true);
  };

  const handleSaveAcompte = () => {
    if (!acompteTargetDevisId || !acompteForm.montant) return;
    const montant = parseFloat(acompteForm.montant.replace(',', '.'));
    if (isNaN(montant)) return;
    addAcompteST({
      id: genId('ast'),
      devisId: acompteTargetDevisId,
      date: acompteForm.date,
      montant,
      commentaire: acompteForm.commentaire,
      createdAt: new Date().toISOString(),
    });
    setShowAcompteForm(false);
  };

  // ── Upload fichier devis (ST ou admin) ──
  const handleUploadDevisFichier = (devisId: string) => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const existing = data.devis.find(d => d.id === devisId)!;
        updateDevis({ ...existing, devisFichier: reader.result as string });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  // ── Upload devis signé (admin) ──
  const handleUploadDevisSigne = (devisId: string) => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const existing = data.devis.find(d => d.id === devisId)!;
        updateDevis({ ...existing, devisSigne: reader.result as string });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  // ── Upload facture sur acompte (ST) ──
  const handleUploadFacture = (acompteId: string) => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const existing = data.acomptesst.find(a => a.id === acompteId)!;
        updateAcompteST({ ...existing, facture: reader.result as string });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  // ── Rendu carte ST ──
  const renderST = ({ item }: { item: SousTraitant }) => {
    const stMarchesCount = data.marches.filter(m => m.soustraitantId === item.id).length;
    return (
      <Pressable style={[styles.card, { borderLeftColor: item.couleur }]} onPress={() => openST(item)}>
          <View style={styles.cardHeader}>
          <View style={[styles.avatar, { backgroundColor: item.couleur }]}>
            <Text style={styles.avatarText}>{item.prenom[0]}{item.nom[0]}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            {item.societe ? <Text style={styles.cardSociete}>{item.societe}</Text> : null}
            <Text style={styles.cardName}>{item.prenom} {item.nom}</Text>
            {item.telephone ? <Text style={styles.cardMeta}>📞 {item.telephone}</Text> : null}
            {item.email ? <Text style={styles.cardMeta}>✉ {item.email}</Text> : null}
          </View>
          <View style={styles.cardActions}>
            <Pressable style={styles.actionBtn} onPress={() => openEditST(item)}>
              <Text style={styles.actionEdit}>✏</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => handleDeleteST(item)}>
              <Text style={styles.actionDelete}>🗑</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardFooterText}>{stMarchesCount} {t.sousTraitants.contracts}</Text>
          <Text style={styles.cardFooterText}>ID : {item.identifiant}</Text>
        </View>
      </Pressable>
    );
  };

  // ─── Vue liste ───────────────────────────────────────────────────────────────
  if (!selectedST) {
    return (
      <ScreenContainer containerClassName="bg-[#F2F4F7]">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t.sousTraitants.title}</Text>
          <Pressable style={styles.newBtn} onPress={openNewST}>
            <Text style={styles.newBtnText}>+ {t.common.new}</Text>
          </Pressable>
        </View>

        <FlatList
          data={data.sousTraitants}
          keyExtractor={item => item.id}
          renderItem={renderST}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t.sousTraitants.empty}</Text>
              <Text style={styles.emptyHint}>{t.sousTraitants.emptyHint}</Text>
            </View>
          }
        />

        {/* Modal formulaire ST */}
        <Modal visible={showSTForm} animationType="slide" transparent onRequestClose={() => setShowSTForm(false)}>
          <Pressable style={styles.overlay} onPress={() => setShowSTForm(false)}>
            <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
              <View style={styles.handle} />
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{editSTId ? t.common.edit : t.sousTraitants.newST}</Text>
                <Pressable onPress={() => setShowSTForm(false)}><Text style={styles.closeX}>✕</Text></Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Field label="Société / Raison sociale">
                  <TextInput style={styles.input} value={stForm.societe} onChangeText={v => setStForm(f => ({ ...f, societe: v }))} placeholder="Ex: DUPONT BTP SARL" placeholderTextColor="#B0BEC5" />
                </Field>
                <Field label="Prénom *">
                  <TextInput style={styles.input} value={stForm.prenom} onChangeText={v => setStForm(f => ({ ...f, prenom: v }))} placeholder="Prénom" placeholderTextColor="#B0BEC5" />
                </Field>
                <Field label="Nom *">
                  <TextInput style={styles.input} value={stForm.nom} onChangeText={v => setStForm(f => ({ ...f, nom: v }))} placeholder="Nom" placeholderTextColor="#B0BEC5" />
                </Field>
                <Field label="Adresse">
                  <TextInput style={styles.input} value={stForm.adresse} onChangeText={v => setStForm(f => ({ ...f, adresse: v }))} placeholder="Adresse complète" placeholderTextColor="#B0BEC5" />
                </Field>
                <Field label="Téléphone">
                  <TextInput style={styles.input} value={stForm.telephone} onChangeText={v => setStForm(f => ({ ...f, telephone: v }))} placeholder="06 12 34 56 78" placeholderTextColor="#B0BEC5" keyboardType="phone-pad" />
                </Field>
                <Field label="Email">
                  <TextInput style={styles.input} value={stForm.email} onChangeText={v => setStForm(f => ({ ...f, email: v }))} placeholder="email@exemple.fr" placeholderTextColor="#B0BEC5" keyboardType="email-address" autoCapitalize="none" />
                </Field>
                <Field label="Identifiant de connexion *">
                  <TextInput style={styles.input} value={stForm.identifiant} onChangeText={v => setStForm(f => ({ ...f, identifiant: v }))} placeholder="Ex: dupont_st" placeholderTextColor="#B0BEC5" autoCapitalize="none" />
                </Field>
                <Field label="Mot de passe *">
                  <TextInput style={styles.input} value={stForm.motDePasse} onChangeText={v => setStForm(f => ({ ...f, motDePasse: v }))} placeholder="Mot de passe" placeholderTextColor="#B0BEC5" secureTextEntry />
                </Field>
                <Field label="Couleur dans le planning">
                  <View style={styles.colorRow}>
                    {ST_COLORS.map(c => (
                      <Pressable key={c} style={[styles.colorSwatch, { backgroundColor: c }, stForm.couleur === c && styles.colorSwatchActive]} onPress={() => setStForm(f => ({ ...f, couleur: c }))} />
                    ))}
                  </View>
                </Field>
              </ScrollView>
              <Pressable style={[styles.saveBtn, (!stForm.prenom.trim() || !stForm.nom.trim()) && styles.saveBtnDisabled]} onPress={handleSaveST} disabled={!stForm.prenom.trim() || !stForm.nom.trim()}>
                <Text style={styles.saveBtnText}>{editSTId ? t.common.save : t.common.create}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </ScreenContainer>
    );
  }

  // ─── Vue fiche ST ────────────────────────────────────────────────────────────
  const currentST = data.sousTraitants.find(s => s.id === selectedST.id) || selectedST;

  return (
    <ScreenContainer containerClassName="bg-[#F2F4F7]">
      {/* En-tête fiche */}
      <View style={styles.ficheHeader}>
        <Pressable style={styles.backBtn} onPress={() => setSelectedST(null)}>
          <Text style={styles.backBtnText}>‹ {t.common.back}</Text>
        </Pressable>
        <View style={[styles.ficheAvatar, { backgroundColor: currentST.couleur }]}>
          <Text style={styles.ficheAvatarText}>{currentST.prenom[0]}{currentST.nom[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.ficheName}>{currentST.prenom} {currentST.nom}</Text>
          <Text style={styles.ficheId}>ID : {currentST.identifiant}</Text>
        </View>
        <Pressable style={styles.editFicheBtn} onPress={() => openEditST(currentST)}>
          <Text style={styles.editFicheBtnText}>✏</Text>
        </Pressable>
      </View>

      {/* Onglets intérieurs */}
      <View style={styles.innerTabs}>
        <Pressable style={[styles.innerTab, innerTab === 'infos' && styles.innerTabActive]} onPress={() => setInnerTab('infos')}>
          <Text style={[styles.innerTabText, innerTab === 'infos' && styles.innerTabTextActive]}>{t.sousTraitants.tabInfo}</Text>
        </Pressable>
        <Pressable style={[styles.innerTab, innerTab === 'finances' && styles.innerTabActive]} onPress={() => setInnerTab('finances')}>
          <Text style={[styles.innerTabText, innerTab === 'finances' && styles.innerTabTextActive]}>{t.sousTraitants.tabFinances}</Text>
        </Pressable>
      </View>

      {/* ── Onglet Informations ── */}
      {innerTab === 'infos' && (
        <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
          {/* Coordonnées */}
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>{t.sousTraitants.coordinates}</Text>
            {[
              { icon: '📍', label: t.common.address, value: currentST.adresse },
              { icon: '📞', label: t.common.phone, value: currentST.telephone },
              { icon: '✉', label: t.common.email, value: currentST.email },
            ].map((row, i) => row.value ? (
              <View key={i} style={styles.infoRow}>
                <Text style={styles.infoRowIcon}>{row.icon}</Text>
                <View>
                  <Text style={styles.infoRowLabel}>{row.label}</Text>
                  <Text style={styles.infoRowValue}>{row.value}</Text>
                </View>
              </View>
            ) : null)}
          </View>

          {/* Connexion */}
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>{t.sousTraitants.appAccess}</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoRowIcon}>👤</Text>
              <View>
                <Text style={styles.infoRowLabel}>Identifiant</Text>
                <Text style={styles.infoRowValue}>{currentST.identifiant}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoRowIcon}>🔒</Text>
              <View>
                <Text style={styles.infoRowLabel}>Mot de passe</Text>
                <Text style={styles.infoRowValue}>{'•'.repeat(currentST.motDePasse.length)}</Text>
              </View>
            </View>
          </View>

          {/* Documents légaux */}
          <View style={styles.infoCard}>
            <View style={styles.infoCardHeaderRow}>
              <Text style={styles.infoCardTitle}>{t.sousTraitants.legalDocs}</Text>
              <Pressable style={styles.addDocBtn} onPress={() => { setDocLibelle(''); setDocFichier(''); setShowDocModal(true); }}>
                <Text style={styles.addDocBtnText}>+ {t.common.add}</Text>
              </Pressable>
            </View>
            {currentST.documents.length === 0 ? (
              <Text style={styles.emptySmall}>{t.sousTraitants.noDocs}</Text>
            ) : (
              currentST.documents.map(doc => {
                const isPdf = doc.fichier.startsWith('data:application/pdf');
                return (
                  <View key={doc.id} style={styles.docRow}>
                    <Pressable
                      style={styles.docThumb}
                      onPress={() => {
                        if (Platform.OS === 'web') {
                          const w = window.open();
                          if (w) w.document.write(`<iframe src="${doc.fichier}" width="100%" height="100%"></iframe>`);
                        }
                      }}
                    >
                      {isPdf ? (
                        <Text style={styles.docThumbPdf}>📄</Text>
                      ) : (
                        <Image source={{ uri: doc.fichier }} style={styles.docThumbImg} resizeMode="cover" />
                      )}
                    </Pressable>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.docLibelle}>{doc.libelle}</Text>
                      <Text style={styles.docDate}>{new Date(doc.uploadedAt).toLocaleDateString('fr-FR')}</Text>
                    </View>
                    <Pressable onPress={() => handleDeleteDoc(doc.id)}>
                      <Text style={styles.actionDelete}>🗑</Text>
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      {/* ── Onglet Chantiers & Finances ── */}
      {innerTab === 'finances' && (
        <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
          <View style={styles.financeHeader}>
            <Text style={styles.financeTitle}>{t.sousTraitants.financeTitle}</Text>
            <Pressable style={styles.newBtn} onPress={openNewDevis}>
              <Text style={styles.newBtnText}>+ {t.sousTraitants.newDevis}</Text>
            </Pressable>
          </View>

          {stDevis.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t.sousTraitants.noDevis}</Text>
              <Text style={styles.emptyHint}>{t.sousTraitants.noDevisHint}</Text>
            </View>
          ) : (
            stDevis.map(devis => {
              const chantier = data.chantiers.find(c => c.id === devis.chantierId);
              const acomptes = data.acomptesst.filter(a => a.devisId === devis.id);
              const totalAcomptes = acomptes.reduce((s, a) => s + a.montant, 0);
              const resteAPayer = devis.prixConvenu - totalAcomptes;

              return (
                <View key={devis.id} style={styles.marcheCard}>
                  {/* En-tête devis */}
                  <View style={styles.marcheCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.marcheChantier}>{chantier?.nom || t.common.unknownProject}</Text>
                      <Text style={styles.devisObjet}>{devis.objet}</Text>
                    </View>
                    <View style={styles.cardActions}>
                      <Pressable style={styles.actionBtn} onPress={() => openEditDevis(devis)}>
                        <Text style={styles.actionEdit}>✏</Text>
                      </Pressable>
                      <Pressable style={styles.actionBtn} onPress={() => handleDeleteDevis(devis)}>
                        <Text style={styles.actionDelete}>🗑</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Résumé financier */}
                  <View style={styles.financeRow}>
                    <FinanceCell label={t.sousTraitants.agreedPrice} value={fmt(devis.prixConvenu)} color="#1A3A6B" />
                    <FinanceCell label={t.sousTraitants.deposits} value={fmt(totalAcomptes)} color="#E67E22" />
                    <FinanceCell label={t.sousTraitants.remaining} value={fmt(resteAPayer)} color={resteAPayer > 0 ? '#E74C3C' : '#27AE60'} />
                  </View>

                  {/* Documents devis */}
                  <View style={styles.devisRow}>
                    {devis.devisFichier ? (
                      <Pressable style={styles.devisBtn} onPress={() => {
                        if (Platform.OS === 'web') {
                          const w = window.open();
                          if (w) w.document.write(`<iframe src="${devis.devisFichier}" width="100%" height="100%"></iframe>`);
                        }
                      }}>
                        <Text style={styles.devisBtnText}>📄 {t.sousTraitants.devisFile}</Text>
                      </Pressable>
                    ) : (
                      <Pressable style={[styles.devisBtn, styles.devisBtnUpload]} onPress={() => handleUploadDevisFichier(devis.id)}>
                        <Text style={styles.devisBtnText}>⬆ {t.sousTraitants.uploadDevis}</Text>
                      </Pressable>
                    )}
                    {devis.devisSigne ? (
                      <Pressable style={[styles.devisBtn, styles.devisBtnSigne]} onPress={() => {
                        if (Platform.OS === 'web') {
                          const w = window.open();
                          if (w) w.document.write(`<iframe src="${devis.devisSigne}" width="100%" height="100%"></iframe>`);
                        }
                      }}>
                        <Text style={styles.devisBtnText}>✅ {t.sousTraitants.signedDevis}</Text>
                      </Pressable>
                    ) : (
                      <Pressable style={[styles.devisBtn, styles.devisBtnUpload]} onPress={() => handleUploadDevisSigne(devis.id)}>
                        <Text style={styles.devisBtnText}>⬆ {t.sousTraitants.returnSigned}</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Acomptes */}
                  <View style={styles.acomptesSection}>
                    <View style={styles.acomptesSectionHeader}>
                      <Text style={styles.acomptesSectionTitle}>{t.sousTraitants.deposits}</Text>
                      <Pressable style={styles.addAcompteBtn} onPress={() => openNewAcompte(devis.id)}>
                        <Text style={styles.addAcompteBtnText}>+ {t.sousTraitants.newDeposit}</Text>
                      </Pressable>
                    </View>
                    {acomptes.length === 0 ? (
                      <Text style={styles.emptySmall}>{t.sousTraitants.noDeposits}</Text>
                    ) : (
                      acomptes.map(a => (
                        <View key={a.id} style={styles.acompteRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.acompteMontant}>{fmt(a.montant)}</Text>
                            <Text style={styles.acompteDate}>{a.date}{a.commentaire ? ` — ${a.commentaire}` : ''}</Text>
                            {a.facture ? (
                              <Pressable onPress={() => {
                                if (Platform.OS === 'web') {
                                  const w = window.open();
                                  if (w) w.document.write(`<iframe src="${a.facture}" width="100%" height="100%"></iframe>`);
                                }
                              }}>
                                <Text style={styles.factureLink}>📄 {t.sousTraitants.viewInvoice}</Text>
                              </Pressable>
                            ) : (
                              <Pressable onPress={() => handleUploadFacture(a.id)}>
                                <Text style={styles.factureUpload}>⬆ {t.sousTraitants.attachInvoice}</Text>
                              </Pressable>
                            )}
                          </View>
                          <Pressable onPress={() => deleteAcompteST(a.id)}>
                            <Text style={styles.actionDelete}>🗑</Text>
                          </Pressable>
                        </View>
                      ))
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ── Modal formulaire ST (édition depuis fiche) ── */}
      <Modal visible={showSTForm} animationType="slide" transparent onRequestClose={() => setShowSTForm(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowSTForm(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editSTId ? t.common.edit : t.sousTraitants.newST}</Text>
              <Pressable onPress={() => setShowSTForm(false)}><Text style={styles.closeX}>✕</Text></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Field label="Société / Raison sociale"><TextInput style={styles.input} value={stForm.societe} onChangeText={v => setStForm(f => ({ ...f, societe: v }))} placeholder="Ex: DUPONT BTP SARL" placeholderTextColor="#B0BEC5" /></Field>
              <Field label="Prénom *"><TextInput style={styles.input} value={stForm.prenom} onChangeText={v => setStForm(f => ({ ...f, prenom: v }))} placeholder="Prénom" placeholderTextColor="#B0BEC5" /></Field>
              <Field label="Nom *"><TextInput style={styles.input} value={stForm.nom} onChangeText={v => setStForm(f => ({ ...f, nom: v }))} placeholder="Nom" placeholderTextColor="#B0BEC5" /></Field>
              <Field label="Adresse"><TextInput style={styles.input} value={stForm.adresse} onChangeText={v => setStForm(f => ({ ...f, adresse: v }))} placeholder="Adresse complète" placeholderTextColor="#B0BEC5" /></Field>
              <Field label="Téléphone"><TextInput style={styles.input} value={stForm.telephone} onChangeText={v => setStForm(f => ({ ...f, telephone: v }))} placeholder="06 12 34 56 78" placeholderTextColor="#B0BEC5" keyboardType="phone-pad" /></Field>
              <Field label="Email"><TextInput style={styles.input} value={stForm.email} onChangeText={v => setStForm(f => ({ ...f, email: v }))} placeholder="email@exemple.fr" placeholderTextColor="#B0BEC5" keyboardType="email-address" autoCapitalize="none" /></Field>
              <Field label="Identifiant *"><TextInput style={styles.input} value={stForm.identifiant} onChangeText={v => setStForm(f => ({ ...f, identifiant: v }))} placeholder="identifiant" placeholderTextColor="#B0BEC5" autoCapitalize="none" /></Field>
              <Field label="Mot de passe *"><TextInput style={styles.input} value={stForm.motDePasse} onChangeText={v => setStForm(f => ({ ...f, motDePasse: v }))} placeholder="Mot de passe" placeholderTextColor="#B0BEC5" secureTextEntry /></Field>
              <Field label="Couleur">
                <View style={styles.colorRow}>
                  {ST_COLORS.map(c => (
                    <Pressable key={c} style={[styles.colorSwatch, { backgroundColor: c }, stForm.couleur === c && styles.colorSwatchActive]} onPress={() => setStForm(f => ({ ...f, couleur: c }))} />
                  ))}
                </View>
              </Field>
            </ScrollView>
            <Pressable style={[styles.saveBtn, (!stForm.prenom.trim() || !stForm.nom.trim()) && styles.saveBtnDisabled]} onPress={handleSaveST} disabled={!stForm.prenom.trim() || !stForm.nom.trim()}>
              <Text style={styles.saveBtnText}>{editSTId ? t.common.save : t.common.create}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal ajout document légal ── */}
      <Modal visible={showDocModal} animationType="slide" transparent onRequestClose={() => setShowDocModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowDocModal(false)}>
          <Pressable style={styles.sheetSmall} onPress={e => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t.sousTraitants.addDoc}</Text>
              <Pressable onPress={() => setShowDocModal(false)}><Text style={styles.closeX}>✕</Text></Pressable>
            </View>
            <Field label="Libellé *">
              <TextInput style={styles.input} value={docLibelle} onChangeText={setDocLibelle} placeholder="Ex: Kbis, Assurance décennale..." placeholderTextColor="#B0BEC5" />
            </Field>
            <Pressable style={styles.uploadBtn} onPress={handlePickDoc}>
              <Text style={styles.uploadBtnText}>{docFichier ? `✅ ${t.common.fileSelected}` : `⬆ ${t.common.chooseFile}`}</Text>
            </Pressable>
            <Pressable style={[styles.saveBtn, (!docLibelle.trim() || !docFichier) && styles.saveBtnDisabled]} onPress={handleSaveDoc} disabled={!docLibelle.trim() || !docFichier}>
              <Text style={styles.saveBtnText}>{t.common.add}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal formulaire devis ── */}
      <Modal visible={showDevisForm} animationType="slide" transparent onRequestClose={() => setShowDevisForm(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowDevisForm(false)}>
          <Pressable style={styles.sheetSmall} onPress={e => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editDevisId ? t.sousTraitants.editDevis : t.sousTraitants.newDevis}</Text>
              <Pressable onPress={() => setShowDevisForm(false)}><Text style={styles.closeX}>✕</Text></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Field label="Chantier *">
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {data.chantiers.map(c => (
                      <Pressable key={c.id} style={[styles.chip, devisForm.chantierId === c.id && styles.chipActive]} onPress={() => setDevisForm(f => ({ ...f, chantierId: c.id }))}>
                        <Text style={[styles.chipText, devisForm.chantierId === c.id && styles.chipTextActive]}>{c.nom}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </Field>
              <Field label="Objet du devis *">
                <TextInput style={styles.input} value={devisForm.objet} onChangeText={v => setDevisForm(f => ({ ...f, objet: v }))} placeholder="Ex: Peinture, Suppléments, Carrelage..." placeholderTextColor="#B0BEC5" />
              </Field>
              <Field label="Prix convenu (€) *">
                <TextInput style={styles.input} value={devisForm.prixConvenu} onChangeText={v => setDevisForm(f => ({ ...f, prixConvenu: v }))} placeholder="Ex: 5000" placeholderTextColor="#B0BEC5" keyboardType="decimal-pad" />
              </Field>
            </ScrollView>
            <Pressable style={[styles.saveBtn, (!devisForm.chantierId || !devisForm.prixConvenu) && styles.saveBtnDisabled]} onPress={handleSaveDevis} disabled={!devisForm.chantierId || !devisForm.prixConvenu}>
              <Text style={styles.saveBtnText}>{editDevisId ? t.common.save : t.sousTraitants.createDevis}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal acompte ST ── */}
      <Modal visible={showAcompteForm} animationType="slide" transparent onRequestClose={() => setShowAcompteForm(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowAcompteForm(false)}>
          <Pressable style={styles.sheetSmall} onPress={e => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t.sousTraitants.addDeposit}</Text>
              <Pressable onPress={() => setShowAcompteForm(false)}><Text style={styles.closeX}>✕</Text></Pressable>
            </View>
            <DatePicker
              label="Date"
              value={acompteForm.date}
              onChange={v => setAcompteForm(f => ({ ...f, date: v }))}
            />
            <Field label="Montant (€) *">
              <TextInput style={styles.input} value={acompteForm.montant} onChangeText={v => setAcompteForm(f => ({ ...f, montant: v }))} placeholder="Ex: 1500" placeholderTextColor="#B0BEC5" keyboardType="decimal-pad" />
            </Field>
            <Field label="Commentaire">
              <TextInput style={styles.input} value={acompteForm.commentaire} onChangeText={v => setAcompteForm(f => ({ ...f, commentaire: v }))} placeholder="Ex: Acompte démarrage" placeholderTextColor="#B0BEC5" />
            </Field>
            <Pressable style={[styles.saveBtn, !acompteForm.montant && styles.saveBtnDisabled]} onPress={handleSaveAcompte} disabled={!acompteForm.montant}>
              <Text style={styles.saveBtnText}>{t.common.save}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

// ─── Composants utilitaires ───────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function FinanceCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.financeCell}>
      <Text style={styles.financeCellLabel}>{label}</Text>
      <Text style={[styles.financeCellValue, { color }]}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#11181C' },
  newBtn: { backgroundColor: '#1A3A6B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22 },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderLeftWidth: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cardSociete: { fontSize: 11, fontWeight: '700', color: '#687076', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#11181C' },
  cardMeta: { fontSize: 12, color: '#687076', marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 6 },
  actionEdit: { fontSize: 16, color: '#687076' },
  actionDelete: { fontSize: 16, color: '#E74C3C' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  cardFooterText: { fontSize: 12, color: '#B0BEC5' },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#687076', fontWeight: '500' },
  emptyHint: { fontSize: 13, color: '#B0BEC5', marginTop: 6 },
  emptySmall: { fontSize: 13, color: '#B0BEC5', paddingVertical: 8 },
  // Fiche ST
  ficheHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 12 },
  backBtn: { paddingRight: 4 },
  backBtnText: { fontSize: 16, color: '#1A3A6B', fontWeight: '600' },
  ficheAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  ficheAvatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  ficheName: { fontSize: 18, fontWeight: '800', color: '#11181C' },
  ficheId: { fontSize: 12, color: '#687076' },
  editFicheBtn: { padding: 8 },
  editFicheBtnText: { fontSize: 18, color: '#687076' },
  // Onglets intérieurs
  innerTabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: '#E2E6EA', borderRadius: 12, padding: 4 },
  innerTab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  innerTabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  innerTabText: { fontSize: 13, fontWeight: '600', color: '#687076' },
  innerTabTextActive: { color: '#1A3A6B' },
  tabContent: { flex: 1, paddingHorizontal: 16 },
  // Infos
  infoCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  infoCardTitle: { fontSize: 13, fontWeight: '700', color: '#687076', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12 },
  infoCardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  infoRowIcon: { fontSize: 18, width: 24, textAlign: 'center', marginTop: 2 },
  infoRowLabel: { fontSize: 11, fontWeight: '600', color: '#B0BEC5', textTransform: 'uppercase', letterSpacing: 0.3 },
  infoRowValue: { fontSize: 14, color: '#11181C', fontWeight: '500', marginTop: 1 },
  addDocBtn: { backgroundColor: '#EEF2F8', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addDocBtnText: { fontSize: 13, fontWeight: '600', color: '#1A3A6B' },
  docRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F2F4F7' },
  docThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#FFF3E0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  docThumbPdf: { fontSize: 24 },
  docThumbImg: { width: 44, height: 44 },
  docLibelle: { fontSize: 14, fontWeight: '600', color: '#11181C' },
  docDate: { fontSize: 11, color: '#B0BEC5', marginTop: 2 },
  // Finances
  financeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  financeTitle: { fontSize: 18, fontWeight: '700', color: '#11181C' },
  marcheCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  marcheCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  marcheChantier: { fontSize: 16, fontWeight: '700', color: '#11181C' },
  marcheDesc: { fontSize: 13, color: '#687076', marginTop: 2 },
  devisObjet: { fontSize: 13, fontWeight: '600', color: '#1A3A6B', marginTop: 2 },
  financeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  financeCell: { flex: 1, backgroundColor: '#F8F9FA', borderRadius: 10, padding: 10, alignItems: 'center' },
  financeCellLabel: { fontSize: 10, fontWeight: '600', color: '#687076', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4, textAlign: 'center' },
  financeCellValue: { fontSize: 14, fontWeight: '800' },
  devisRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  devisBtn: { flex: 1, backgroundColor: '#EEF2F8', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  devisBtnSigne: { backgroundColor: '#D4EDDA' },
  devisBtnUpload: { backgroundColor: '#FFF3CD' },
  devisBtnText: { fontSize: 12, fontWeight: '600', color: '#1A3A6B' },
  devisAbsent: { flex: 1, fontSize: 12, color: '#B0BEC5', textAlign: 'center', paddingVertical: 8 },
  acomptesSection: { borderTopWidth: 1, borderTopColor: '#F2F4F7', paddingTop: 12 },
  acomptesSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  acomptesSectionTitle: { fontSize: 13, fontWeight: '700', color: '#687076', textTransform: 'uppercase', letterSpacing: 0.3 },
  addAcompteBtn: { backgroundColor: '#EEF2F8', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  addAcompteBtnText: { fontSize: 12, fontWeight: '600', color: '#1A3A6B' },
  acompteRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  acompteMontant: { fontSize: 15, fontWeight: '700', color: '#11181C' },
  acompteDate: { fontSize: 12, color: '#687076', marginTop: 2 },
  factureLink: { fontSize: 12, color: '#1A3A6B', fontWeight: '600', marginTop: 4 },
  factureUpload: { fontSize: 12, color: '#E67E22', fontWeight: '600', marginTop: 4 },
  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, maxHeight: '92%' },
  sheetSmall: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, maxHeight: '70%' },
  handle: { width: 40, height: 4, backgroundColor: '#E2E6EA', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#11181C' },
  closeX: { fontSize: 18, color: '#687076', padding: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { backgroundColor: '#F2F4F7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA' },
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorSwatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  colorSwatchActive: { borderColor: '#11181C', transform: [{ scale: 1.15 }] },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E2E6EA', backgroundColor: '#F2F4F7' },
  chipActive: { borderColor: '#1A3A6B', backgroundColor: '#1A3A6B' },
  chipText: { fontSize: 13, fontWeight: '500', color: '#687076' },
  chipTextActive: { color: '#fff' },
  saveBtn: { marginTop: 16, backgroundColor: '#1A3A6B', paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#B0BEC5' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  uploadBtn: { backgroundColor: '#EEF2F8', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A3A6B', borderStyle: 'dashed', marginBottom: 4 },
  uploadBtnText: { color: '#1A3A6B', fontWeight: '600', fontSize: 14 },
});
