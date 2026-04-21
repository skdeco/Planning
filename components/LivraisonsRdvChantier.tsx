/**
 * Bloc "Livraisons & RDV de chantier" — intégrable dans la fiche chantier (admin)
 * ou le portail client (lecture + création livraison si autorisé).
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Modal, Alert, Platform, ScrollView, Image, Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '@/app/context/AppContext';
import type { LivraisonChantier, RdvChantier, FrequenceRdv } from '@/app/types';
import { uploadFileToStorage } from '@/lib/supabase';
import { DatePickerField } from '@/components/ui/DatePickerField';

interface Props {
  chantierId: string;
  isAdmin: boolean;
  /** Rôle externe (client/architecte/apporteur) — peut créer livraisons, lire RDV */
  externRole?: 'client' | 'architecte' | 'apporteur' | 'contractant';
  createdByNom?: string;
}

const FREQ_LABELS: Record<FrequenceRdv, string> = {
  hebdomadaire: 'Chaque semaine',
  bimensuel: 'Toutes les 2 semaines',
  mensuel: 'Chaque mois',
  ponctuel: 'Ponctuel',
};
const JOURS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function genId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function todayIso() { return new Date().toISOString().slice(0, 10); }
function formatFR(iso?: string) {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function LivraisonsRdvChantier({ chantierId, isAdmin, externRole, createdByNom }: Props) {
  const { data, addLivraison, updateLivraison, deleteLivraison, addRdvChantier, updateRdvChantier, deleteRdvChantier, currentUser } = useApp();

  const livraisons = useMemo(
    () => (data.livraisons || []).filter(l => l.chantierId === chantierId).sort((a, b) => a.dateLivraison.localeCompare(b.dateLivraison)),
    [data.livraisons, chantierId]
  );
  const rdvs = useMemo(
    () => (data.rdvChantiers || []).filter(r => r.chantierId === chantierId).sort((a, b) => a.dateDebut.localeCompare(b.dateDebut)),
    [data.rdvChantiers, chantierId]
  );

  // ── Livraison form ──
  const [showLivForm, setShowLivForm] = useState(false);
  const [editLivId, setEditLivId] = useState<string | null>(null);
  const [livForm, setLivForm] = useState({
    titre: '',
    dateLivraison: todayIso(),
    heure: '',
    numeroColis: '',
    transporteur: '',
    numeroTransporteur: '',
    nomContact: '',
    telephoneContact: '',
    adresseLivraison: '',
    note: '',
    photoEtiquetteUri: '',
  });

  const openNewLiv = () => {
    setEditLivId(null);
    setLivForm({ titre: '', dateLivraison: todayIso(), heure: '', numeroColis: '', transporteur: '', numeroTransporteur: '', nomContact: '', telephoneContact: '', adresseLivraison: '', note: '', photoEtiquetteUri: '' });
    setShowLivForm(true);
  };
  const openEditLiv = (l: LivraisonChantier) => {
    setEditLivId(l.id);
    setLivForm({
      titre: l.titre,
      dateLivraison: l.dateLivraison,
      heure: l.heure || '',
      numeroColis: l.numeroColis || '',
      transporteur: l.transporteur || '',
      numeroTransporteur: l.numeroTransporteur || '',
      nomContact: l.nomContact || '',
      telephoneContact: l.telephoneContact || '',
      adresseLivraison: l.adresseLivraison || '',
      note: l.note || '',
      photoEtiquetteUri: l.photoEtiquetteUri || '',
    });
    setShowLivForm(true);
  };
  const pickPhotoEtiquette = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (res.canceled || !res.assets?.[0]) return;
      setLivForm(f => ({ ...f, photoEtiquetteUri: res.assets[0].uri }));
    } catch { Alert.alert('Erreur', "Impossible d'ouvrir la bibliothèque."); }
  };
  const saveLiv = async () => {
    if (!livForm.titre.trim() || !livForm.dateLivraison) return;
    const now = new Date().toISOString();
    let photoUri = livForm.photoEtiquetteUri;
    if (photoUri && !photoUri.startsWith('http')) {
      const id = editLivId || genId('liv');
      const up = await uploadFileToStorage(photoUri, `chantiers/${chantierId}/livraisons`, id);
      if (up) photoUri = up;
    }
    if (editLivId) {
      const existing = livraisons.find(l => l.id === editLivId);
      if (!existing) return;
      updateLivraison({
        ...existing,
        titre: livForm.titre.trim(),
        dateLivraison: livForm.dateLivraison,
        heure: livForm.heure.trim() || undefined,
        numeroColis: livForm.numeroColis.trim() || undefined,
        transporteur: livForm.transporteur.trim() || undefined,
        numeroTransporteur: livForm.numeroTransporteur.trim() || undefined,
        nomContact: livForm.nomContact.trim() || undefined,
        telephoneContact: livForm.telephoneContact.trim() || undefined,
        adresseLivraison: livForm.adresseLivraison.trim() || undefined,
        note: livForm.note.trim() || undefined,
        photoEtiquetteUri: photoUri || undefined,
        updatedAt: now,
      });
    } else {
      addLivraison({
        id: genId('liv'),
        chantierId,
        titre: livForm.titre.trim(),
        dateLivraison: livForm.dateLivraison,
        heure: livForm.heure.trim() || undefined,
        numeroColis: livForm.numeroColis.trim() || undefined,
        transporteur: livForm.transporteur.trim() || undefined,
        numeroTransporteur: livForm.numeroTransporteur.trim() || undefined,
        nomContact: livForm.nomContact.trim() || undefined,
        telephoneContact: livForm.telephoneContact.trim() || undefined,
        adresseLivraison: livForm.adresseLivraison.trim() || undefined,
        note: livForm.note.trim() || undefined,
        photoEtiquetteUri: photoUri || undefined,
        recue: false,
        createdBy: currentUser?.role === 'admin' ? 'admin' : (currentUser?.apporteurId || currentUser?.employeId || 'unknown'),
        createdByNom: createdByNom || currentUser?.nom,
        createdAt: now,
        updatedAt: now,
      });
    }
    setShowLivForm(false);
  };
  const toggleRecue = (l: LivraisonChantier) => {
    updateLivraison({
      ...l,
      recue: !l.recue,
      recueAt: !l.recue ? new Date().toISOString() : undefined,
      updatedAt: new Date().toISOString(),
    });
  };
  const confirmDeleteLiv = (l: LivraisonChantier) => {
    const msg = `Supprimer la livraison "${l.titre}" ?`;
    if (Platform.OS === 'web') { if (window.confirm(msg)) deleteLivraison(l.id); }
    else Alert.alert('Supprimer', msg, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteLivraison(l.id) },
    ]);
  };

  // ── RDV form ──
  const [showRdvForm, setShowRdvForm] = useState(false);
  const [editRdvId, setEditRdvId] = useState<string | null>(null);
  const [rdvForm, setRdvForm] = useState({
    titre: '',
    dateDebut: todayIso(),
    heureDebut: '09:00',
    dureeMinutes: 90,
    frequence: 'hebdomadaire' as FrequenceRdv,
    jourSemaine: 0,
    dateFinRecurrence: '',
    assigneA: 'admin',
    assigneNom: 'Admin',
    lieu: 'chantier' as 'chantier' | 'visio' | 'bureau',
    note: '',
  });
  const openNewRdv = () => {
    setEditRdvId(null);
    setRdvForm({
      titre: 'Point chantier hebdomadaire',
      dateDebut: todayIso(), heureDebut: '09:00', dureeMinutes: 90,
      frequence: 'hebdomadaire', jourSemaine: 0, dateFinRecurrence: '',
      assigneA: 'admin', assigneNom: 'Admin',
      lieu: 'chantier', note: '',
    });
    setShowRdvForm(true);
  };
  const openEditRdv = (r: RdvChantier) => {
    setEditRdvId(r.id);
    setRdvForm({
      titre: r.titre,
      dateDebut: r.dateDebut,
      heureDebut: r.heureDebut || '09:00',
      dureeMinutes: r.dureeMinutes,
      frequence: r.frequence,
      jourSemaine: r.jourSemaine ?? 0,
      dateFinRecurrence: r.dateFinRecurrence || '',
      assigneA: r.assigneA,
      assigneNom: r.assigneNom,
      lieu: r.lieu || 'chantier',
      note: r.note || '',
    });
    setShowRdvForm(true);
  };
  const saveRdv = () => {
    if (!rdvForm.titre.trim() || !rdvForm.dateDebut) return;
    const now = new Date().toISOString();
    if (editRdvId) {
      const existing = rdvs.find(r => r.id === editRdvId);
      if (!existing) return;
      updateRdvChantier({
        ...existing,
        titre: rdvForm.titre.trim(),
        dateDebut: rdvForm.dateDebut,
        heureDebut: rdvForm.heureDebut,
        dureeMinutes: rdvForm.dureeMinutes,
        frequence: rdvForm.frequence,
        jourSemaine: rdvForm.frequence === 'ponctuel' ? undefined : rdvForm.jourSemaine,
        dateFinRecurrence: rdvForm.dateFinRecurrence || undefined,
        assigneA: rdvForm.assigneA,
        assigneNom: rdvForm.assigneNom,
        lieu: rdvForm.lieu,
        note: rdvForm.note.trim() || undefined,
        updatedAt: now,
      });
    } else {
      addRdvChantier({
        id: genId('rdv'),
        chantierId,
        titre: rdvForm.titre.trim(),
        dateDebut: rdvForm.dateDebut,
        heureDebut: rdvForm.heureDebut,
        dureeMinutes: rdvForm.dureeMinutes,
        frequence: rdvForm.frequence,
        jourSemaine: rdvForm.frequence === 'ponctuel' ? undefined : rdvForm.jourSemaine,
        dateFinRecurrence: rdvForm.dateFinRecurrence || undefined,
        assigneA: rdvForm.assigneA,
        assigneNom: rdvForm.assigneNom,
        lieu: rdvForm.lieu,
        note: rdvForm.note.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      });
    }
    setShowRdvForm(false);
  };
  const confirmDeleteRdv = (r: RdvChantier) => {
    const msg = `Supprimer le RDV "${r.titre}" ?`;
    if (Platform.OS === 'web') { if (window.confirm(msg)) deleteRdvChantier(r.id); }
    else Alert.alert('Supprimer', msg, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteRdvChantier(r.id) },
    ]);
  };

  const employes = data.employes || [];
  const canCreateLiv = isAdmin || externRole === 'client' || externRole === 'architecte';
  const canCreateRdv = isAdmin;

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>🚚 Livraisons ({livraisons.length})</Text>
      {livraisons.length === 0 ? (
        <Text style={styles.empty}>Aucune livraison prévue.</Text>
      ) : (
        livraisons.map(l => (
          <View key={l.id} style={[styles.livCard, l.recue && styles.livCardDone]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={styles.livTitre}>{l.titre}</Text>
                {l.recue && <View style={styles.badgeDone}><Text style={styles.badgeDoneText}>✓ Reçue</Text></View>}
              </View>
              <Text style={styles.livMeta}>
                📅 {formatFR(l.dateLivraison)}{l.heure ? ` · ${l.heure}` : ''}
              </Text>
              {l.transporteur && <Text style={styles.livDetail}>🚛 {l.transporteur}{l.numeroTransporteur ? ` · ${l.numeroTransporteur}` : ''}</Text>}
              {l.numeroColis && <Text style={styles.livDetail}>📦 Colis {l.numeroColis}</Text>}
              {l.nomContact && <Text style={styles.livDetail}>👤 {l.nomContact}{l.telephoneContact ? ` · ${l.telephoneContact}` : ''}</Text>}
              {l.note && <Text style={styles.livNote}>💬 {l.note}</Text>}
              {l.photoEtiquetteUri && (
                <Pressable onPress={() => l.photoEtiquetteUri && (Platform.OS === 'web' ? window.open(l.photoEtiquetteUri) : Linking.openURL(l.photoEtiquetteUri))}>
                  <Image source={{ uri: l.photoEtiquetteUri }} style={{ width: 80, height: 80, borderRadius: 6, marginTop: 6 }} />
                </Pressable>
              )}
            </View>
            <View style={styles.livActions}>
              <Pressable onPress={() => toggleRecue(l)} style={[styles.miniBtn, l.recue ? styles.miniBtnUndo : styles.miniBtnDone]}>
                <Text style={styles.miniBtnText}>{l.recue ? '↩' : '✓'}</Text>
              </Pressable>
              {(isAdmin || l.createdBy === (currentUser?.apporteurId || currentUser?.employeId)) && (
                <>
                  <Pressable onPress={() => openEditLiv(l)} style={styles.miniBtn}>
                    <Text style={styles.miniBtnText}>✏️</Text>
                  </Pressable>
                  <Pressable onPress={() => confirmDeleteLiv(l)} style={[styles.miniBtn, styles.miniBtnDel]}>
                    <Text style={styles.miniBtnText}>🗑</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        ))
      )}
      {canCreateLiv && (
        <Pressable style={styles.addBtn} onPress={openNewLiv}>
          <Text style={styles.addBtnText}>+ Ajouter une livraison</Text>
        </Pressable>
      )}

      {/* RDV — visible seulement si admin ou si externRole valide */}
      {(isAdmin || externRole) && (
        <>
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>📅 RDV de chantier ({rdvs.length})</Text>
          {rdvs.length === 0 ? (
            <Text style={styles.empty}>Aucun RDV programmé.</Text>
          ) : (
            rdvs.map(r => (
              <View key={r.id} style={styles.rdvCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rdvTitre}>{r.titre}</Text>
                  <Text style={styles.rdvMeta}>
                    {FREQ_LABELS[r.frequence]}
                    {r.frequence !== 'ponctuel' && r.jourSemaine !== undefined ? ` · ${JOURS_FR[r.jourSemaine]}` : ''}
                    {r.heureDebut ? ` · ${r.heureDebut}` : ''}
                    {r.dureeMinutes ? ` (${r.dureeMinutes}min)` : ''}
                  </Text>
                  <Text style={styles.rdvDetail}>
                    👤 {r.assigneNom}{r.lieu && r.lieu !== 'chantier' ? ` · ${r.lieu}` : ''}
                  </Text>
                  <Text style={styles.rdvDetail}>📆 Dès {formatFR(r.dateDebut)}{r.dateFinRecurrence ? ` → ${formatFR(r.dateFinRecurrence)}` : ''}</Text>
                  {r.note && <Text style={styles.rdvNote}>💬 {r.note}</Text>}
                </View>
                {isAdmin && (
                  <View style={styles.livActions}>
                    <Pressable onPress={() => openEditRdv(r)} style={styles.miniBtn}>
                      <Text style={styles.miniBtnText}>✏️</Text>
                    </Pressable>
                    <Pressable onPress={() => confirmDeleteRdv(r)} style={[styles.miniBtn, styles.miniBtnDel]}>
                      <Text style={styles.miniBtnText}>🗑</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))
          )}
          {canCreateRdv && (
            <Pressable style={styles.addBtn} onPress={openNewRdv}>
              <Text style={styles.addBtnText}>+ Programmer un RDV récurrent</Text>
            </Pressable>
          )}
        </>
      )}

      {/* Modal livraison */}
      <Modal visible={showLivForm} animationType="fade" transparent onRequestClose={() => setShowLivForm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <ScrollView style={{ maxHeight: '92%' }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>{editLivId ? 'Modifier la livraison' : 'Nouvelle livraison'}</Text>
              <Text style={styles.label}>Titre *</Text>
              <TextInput style={styles.input} value={livForm.titre} onChangeText={v => setLivForm(f => ({ ...f, titre: v }))} placeholder="Ex : Parquet point de Hongrie" />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.label}>Date *</Text>
                  <DatePickerField value={livForm.dateLivraison} onChange={v => setLivForm(f => ({ ...f, dateLivraison: v }))} placeholder="Date livraison" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Heure</Text>
                  <TextInput style={styles.input} value={livForm.heure} onChangeText={v => setLivForm(f => ({ ...f, heure: v }))} placeholder="09:30" />
                </View>
              </View>
              <Text style={[styles.label, { marginTop: 10 }]}>Transporteur</Text>
              <TextInput style={styles.input} value={livForm.transporteur} onChangeText={v => setLivForm(f => ({ ...f, transporteur: v }))} placeholder="DHL, Chronopost..." />
              <Text style={[styles.label, { marginTop: 10 }]}>N° de suivi transporteur</Text>
              <TextInput style={styles.input} value={livForm.numeroTransporteur} onChangeText={v => setLivForm(f => ({ ...f, numeroTransporteur: v }))} placeholder="JVGL123456789FR" />
              <Text style={[styles.label, { marginTop: 10 }]}>N° de colis</Text>
              <TextInput style={styles.input} value={livForm.numeroColis} onChangeText={v => setLivForm(f => ({ ...f, numeroColis: v }))} placeholder="Ex : BT-2026-0123" />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Contact livraison</Text>
                  <TextInput style={styles.input} value={livForm.nomContact} onChangeText={v => setLivForm(f => ({ ...f, nomContact: v }))} placeholder="Nom" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Téléphone</Text>
                  <TextInput style={styles.input} value={livForm.telephoneContact} onChangeText={v => setLivForm(f => ({ ...f, telephoneContact: v }))} placeholder="06..." keyboardType="phone-pad" />
                </View>
              </View>
              <Text style={[styles.label, { marginTop: 10 }]}>Adresse de livraison (si différente)</Text>
              <TextInput style={styles.input} value={livForm.adresseLivraison} onChangeText={v => setLivForm(f => ({ ...f, adresseLivraison: v }))} placeholder="Optionnel" />
              <Text style={[styles.label, { marginTop: 10 }]}>Note</Text>
              <TextInput style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]} value={livForm.note} onChangeText={v => setLivForm(f => ({ ...f, note: v }))} placeholder="Instructions particulières..." multiline />
              <Pressable onPress={pickPhotoEtiquette} style={{ marginTop: 10, backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#C9A96E' }}>
                <Text style={{ color: '#8C6D2F', fontWeight: '700', fontSize: 12 }}>
                  {livForm.photoEtiquetteUri ? '✓ Photo étiquette ajoutée' : '📷 Photo d\'étiquette (optionnel)'}
                </Text>
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <Pressable onPress={() => setShowLivForm(false)} style={{ flex: 1, backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#2C2C2C', fontWeight: '700' }}>Annuler</Text>
                </Pressable>
                <Pressable onPress={saveLiv} disabled={!livForm.titre.trim()} style={{ flex: 1, backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: !livForm.titre.trim() ? 0.5 : 1 }}>
                  <Text style={{ color: '#C9A96E', fontWeight: '800' }}>{editLivId ? 'Enregistrer' : 'Créer'}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Modal RDV */}
      <Modal visible={showRdvForm} animationType="fade" transparent onRequestClose={() => setShowRdvForm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <ScrollView style={{ maxHeight: '92%' }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>{editRdvId ? 'Modifier le RDV' : 'Nouveau RDV de chantier'}</Text>
              <Text style={styles.label}>Titre *</Text>
              <TextInput style={styles.input} value={rdvForm.titre} onChangeText={v => setRdvForm(f => ({ ...f, titre: v }))} placeholder="Point chantier hebdomadaire" />

              <Text style={[styles.label, { marginTop: 10 }]}>Fréquence</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {(Object.keys(FREQ_LABELS) as FrequenceRdv[]).map(f => (
                  <Pressable
                    key={f}
                    onPress={() => setRdvForm(v => ({ ...v, frequence: f }))}
                    style={[styles.chip, rdvForm.frequence === f && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, rdvForm.frequence === f && { color: '#fff' }]}>{FREQ_LABELS[f]}</Text>
                  </Pressable>
                ))}
              </View>

              {rdvForm.frequence !== 'ponctuel' && (
                <>
                  <Text style={[styles.label, { marginTop: 10 }]}>Jour de la semaine</Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {JOURS_FR.map((j, i) => (
                      <Pressable key={i} onPress={() => setRdvForm(v => ({ ...v, jourSemaine: i }))} style={[styles.chip, rdvForm.jourSemaine === i && styles.chipActive]}>
                        <Text style={[styles.chipText, rdvForm.jourSemaine === i && { color: '#fff' }]}>{j.slice(0, 3)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.label}>Date 1ère occurrence *</Text>
                  <DatePickerField value={rdvForm.dateDebut} onChange={v => setRdvForm(f => ({ ...f, dateDebut: v }))} placeholder="Date début" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Heure</Text>
                  <TextInput style={styles.input} value={rdvForm.heureDebut} onChangeText={v => setRdvForm(f => ({ ...f, heureDebut: v }))} placeholder="09:00" />
                </View>
                <View style={{ width: 90 }}>
                  <Text style={styles.label}>Durée (min)</Text>
                  <TextInput
                    style={styles.input}
                    value={String(rdvForm.dureeMinutes)}
                    onChangeText={v => setRdvForm(f => ({ ...f, dureeMinutes: parseInt(v) || 90 }))}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              {rdvForm.frequence !== 'ponctuel' && (
                <>
                  <Text style={[styles.label, { marginTop: 10 }]}>Fin de récurrence (optionnel)</Text>
                  <DatePickerField value={rdvForm.dateFinRecurrence} onChange={v => setRdvForm(f => ({ ...f, dateFinRecurrence: v }))} placeholder="Pas de fin" minDate={rdvForm.dateDebut} />
                </>
              )}

              <Text style={[styles.label, { marginTop: 10 }]}>Assigné à</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                <Pressable
                  onPress={() => setRdvForm(f => ({ ...f, assigneA: 'admin', assigneNom: 'Admin' }))}
                  style={[styles.chip, rdvForm.assigneA === 'admin' && styles.chipActive]}
                >
                  <Text style={[styles.chipText, rdvForm.assigneA === 'admin' && { color: '#fff' }]}>👔 Admin (moi)</Text>
                </Pressable>
                {employes.map(e => (
                  <Pressable
                    key={e.id}
                    onPress={() => setRdvForm(f => ({ ...f, assigneA: e.id, assigneNom: `${e.prenom} ${e.nom}` }))}
                    style={[styles.chip, rdvForm.assigneA === e.id && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, rdvForm.assigneA === e.id && { color: '#fff' }]}>{e.prenom} {e.nom}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={[styles.label, { marginTop: 10 }]}>Lieu</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['chantier', 'visio', 'bureau'] as const).map(l => (
                  <Pressable key={l} onPress={() => setRdvForm(f => ({ ...f, lieu: l }))} style={[styles.chip, rdvForm.lieu === l && styles.chipActive]}>
                    <Text style={[styles.chipText, rdvForm.lieu === l && { color: '#fff' }]}>
                      {l === 'chantier' ? '🏗 Chantier' : l === 'visio' ? '💻 Visio' : '🏢 Bureau'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.label, { marginTop: 10 }]}>Note</Text>
              <TextInput style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]} value={rdvForm.note} onChangeText={v => setRdvForm(f => ({ ...f, note: v }))} multiline placeholder="Points à aborder..." />

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <Pressable onPress={() => setShowRdvForm(false)} style={{ flex: 1, backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#2C2C2C', fontWeight: '700' }}>Annuler</Text>
                </Pressable>
                <Pressable onPress={saveRdv} disabled={!rdvForm.titre.trim()} style={{ flex: 1, backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: !rdvForm.titre.trim() ? 0.5 : 1 }}>
                  <Text style={{ color: '#C9A96E', fontWeight: '800' }}>{editRdvId ? 'Enregistrer' : 'Créer'}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#2C2C2C', marginBottom: 10 },
  empty: { fontSize: 12, color: '#B0BEC5', fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  livCard: { flexDirection: 'row', backgroundColor: '#FAF7F3', borderRadius: 10, padding: 10, marginBottom: 8, gap: 8, borderLeftWidth: 3, borderLeftColor: '#C9A96E' },
  livCardDone: { borderLeftColor: '#2E7D32', backgroundColor: '#F1F8F2' },
  livTitre: { fontSize: 13, fontWeight: '800', color: '#2C2C2C' },
  livMeta: { fontSize: 11, color: '#8C6D2F', fontWeight: '700', marginTop: 2 },
  livDetail: { fontSize: 11, color: '#687076', marginTop: 2 },
  livNote: { fontSize: 11, color: '#8C6D2F', fontStyle: 'italic', marginTop: 4 },
  livActions: { flexDirection: 'row', gap: 4, alignItems: 'flex-start' },
  badgeDone: { backgroundColor: '#D4EDDA', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeDoneText: { fontSize: 10, fontWeight: '800', color: '#155724' },
  miniBtn: { width: 32, height: 32, backgroundColor: '#fff', borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E8DDD0' },
  miniBtnDone: { backgroundColor: '#D4EDDA', borderColor: '#2E7D32' },
  miniBtnUndo: { backgroundColor: '#E8DDD0', borderColor: '#8C8077' },
  miniBtnDel: { backgroundColor: '#FBEFEC', borderColor: '#E74C3C' },
  miniBtnText: { fontSize: 13 },
  addBtn: { backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C9A96E' },
  addBtnText: { color: '#8C6D2F', fontSize: 12, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#E8DDD0', marginVertical: 14 },
  rdvCard: { flexDirection: 'row', backgroundColor: '#FAF7F3', borderRadius: 10, padding: 10, marginBottom: 8, gap: 8, borderLeftWidth: 3, borderLeftColor: '#2C2C2C' },
  rdvTitre: { fontSize: 13, fontWeight: '800', color: '#2C2C2C' },
  rdvMeta: { fontSize: 11, color: '#C9A96E', fontWeight: '700', marginTop: 2 },
  rdvDetail: { fontSize: 11, color: '#687076', marginTop: 2 },
  rdvNote: { fontSize: 11, color: '#8C6D2F', fontStyle: 'italic', marginTop: 4 },
  modal: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#2C2C2C', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', color: '#2C2C2C', marginBottom: 4 },
  input: { backgroundColor: '#FAF7F3', borderRadius: 10, borderWidth: 1.5, borderColor: '#E8DDD0', paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: '#2C2C2C' },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#F5EDE3', borderWidth: 1, borderColor: '#E8DDD0' },
  chipActive: { backgroundColor: '#2C2C2C', borderColor: '#2C2C2C' },
  chipText: { fontSize: 11, fontWeight: '700', color: '#2C2C2C' },
});
