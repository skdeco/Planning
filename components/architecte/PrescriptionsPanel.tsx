import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Plus, Pencil, Trash2, Link2, Paperclip, X, Check, RotateCcw, FileText, Image as ImageIcon } from 'lucide-react-native';
import type { Prescription, PrescriptionNature, PrescriptionStatut, PrescriptionDocument } from '@/app/types';
import { PRESCRIPTION_STATUT_LABELS } from '@/app/types';
import { useApp } from '@/app/context/AppContext';
import { PanelHeader } from '@/components/ui/PanelHeader';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { uploadFileToStorage } from '@/lib/supabase';
import { openDocPreview } from '@/lib/share/openDocPreview';
import { sendPushNotification } from '@/hooks/useNotifications';
import { getAdminPushTokens } from '@/lib/notif/getAdminPushTokens';
import { DS, radius, space, font } from '@/constants/design';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FilterChip } from '@/components/ui/FilterChip';
import { StatusPill, type StatusType } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * PrescriptionsPanel — prescriptions matériaux & déco d'un chantier.
 * Boucle archi → entreprise → client (statut). Palette V10 bordeaux/crème.
 *
 * Panel plein écran (pattern SuiviCRPanel). Le formulaire d'ajout est rendu
 * en overlay inline — jamais en <Modal> imbriquée (fix bug Modal-on-Modal iOS).
 */
export interface PrescriptionsPanelProps {
  visible?: boolean;
  onClose?: () => void;
  chantierId: string;
  /** Auteur des prescriptions créées ('admin' ou apporteurId architecte). */
  auteurId?: string;
  /** Rendu sans Modal (intégré dans un onglet, ex. portail architecte). */
  embedded?: boolean;
  /** Lecture seule (vue client passive) : masque l'ajout et l'édition. */
  readonly?: boolean;
  /**
   * Mode CLIENT : peut valider/refuser ce qu'on lui propose (statut 'propose'),
   * et proposer ses propres envies (marquées 'suggéré client'). Ne modifie pas
   * les prescriptions des autres.
   */
  clientMode?: boolean;
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Éditeur de liens multiples (une ligne = input + suppression). */
function LinksEditor({ liens, onChange }: { liens: string[]; onChange: (l: string[]) => void }) {
  return (
    <>
      {liens.map((l, i) => (
        <View key={i} style={styles.linkRow}>
          <TextInput
            style={[styles.input, styles.linkInput]} placeholder="https://…" autoCapitalize="none"
            placeholderTextColor={DS.textAlt} value={l}
            onChangeText={t => onChange(liens.map((x, j) => (j === i ? t : x)))}
          />
          <Pressable hitSlop={8} onPress={() => onChange(liens.filter((_, j) => j !== i))} style={styles.miniDel}><X size={16} color={DS.marron} /></Pressable>
        </View>
      ))}
      <Pressable style={styles.addLine} onPress={() => onChange([...liens, ''])}>
        <Link2 size={15} color={DS.bordeaux} /><Text style={styles.addLineText}>Ajouter un lien</Text>
      </Pressable>
    </>
  );
}

/** Éditeur de documents (chips + bouton fichier/photo/caméra). */
function DocsEditor({ docs, onChange, onPick, busy }: { docs: PrescriptionDocument[]; onChange: (d: PrescriptionDocument[]) => void; onPick: () => void; busy: boolean }) {
  return (
    <>
      {docs.length > 0 && (
        <View style={styles.docWrap}>
          {docs.map(d => (
            <View key={d.id} style={styles.docChip}>
              <Pressable style={styles.docChipMain} onPress={() => openDocPreview(d.uri)}>
                {d.type === 'pdf' ? <FileText size={13} color={DS.bordeaux} /> : <ImageIcon size={13} color={DS.bordeaux} />}
                <Text style={styles.docChipText} numberOfLines={1}>{d.nom}</Text>
              </Pressable>
              <Pressable hitSlop={6} onPress={() => onChange(docs.filter(x => x.id !== d.id))}><X size={13} color={DS.marron} /></Pressable>
            </View>
          ))}
        </View>
      )}
      <Pressable style={styles.addLine} onPress={onPick} disabled={busy}>
        {busy ? <ActivityIndicator size="small" color={DS.bordeaux} /> : <Paperclip size={15} color={DS.bordeaux} />}
        <Text style={styles.addLineText}>Ajouter fichier / photo</Text>
      </Pressable>
    </>
  );
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

/** Mappe le statut de prescription vers un StatusPill (3 tons DS). */
function statutToPill(statut: PrescriptionStatut): StatusType {
  if (statut === 'valide') return 'actif';
  if (statut === 'commande' || statut === 'pose') return 'livre';
  return 'attente'; // a_proposer, propose, refuse
}

const NATURES: { key: PrescriptionNature; label: string }[] = [
  { key: 'materiau', label: 'Matériau' },
  { key: 'deco', label: 'Décoration' },
];

const STATUTS: PrescriptionStatut[] = [
  'a_proposer', 'propose', 'valide', 'refuse', 'commande', 'pose',
];

type FormState = {
  nature: PrescriptionNature;
  categorie: string;
  designation: string;
  marque: string;
  reference: string;
  liens: string[];
  documents: PrescriptionDocument[];
  ftLiens: string[];
  ftDocuments: PrescriptionDocument[];
  prixUnitaire: string;
  unite: string;
  quantite: string;
  tauxTVA: string;
  auDevis: boolean;
  montantDevis: string;
  statut: PrescriptionStatut;
};

const EMPTY_FORM: FormState = {
  nature: 'materiau', categorie: '', designation: '', marque: '', reference: '',
  liens: [], documents: [], ftLiens: [], ftDocuments: [],
  prixUnitaire: '', unite: '', quantite: '', tauxTVA: '20', auDevis: false, montantDevis: '', statut: 'a_proposer',
};

const TVA_OPTIONS = ['20', '10', '5.5'];

export function PrescriptionsPanel({ visible, onClose, chantierId, auteurId = 'admin', embedded = false, readonly = false, clientMode = false }: PrescriptionsPanelProps) {
  const { data, addPrescription, updatePrescription, deletePrescription } = useApp();

  // Décision client : valider / refuser une prescription proposée (trace le décideur).
  const decide = (p: Prescription, statut: PrescriptionStatut) =>
    updatePrescription({ ...p, statut, decideParId: auteurId, decideAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  // Changement de statut par le prescripteur (proposer au client / repasser en brouillon).
  const setStatut = (p: Prescription, statut: PrescriptionStatut) =>
    updatePrescription({ ...p, statut, updatedAt: new Date().toISOString() });

  // Devis entreprise (signé prioritaire) pour vérifier si un article y est déjà inclus.
  const marcheDevis = (data.marchesChantier || []).find(m => m.chantierId === chantierId && (m.devisSigneUri || m.devisInitialUri));
  const devisEntrepriseUri = marcheDevis?.devisSigneUri || marcheDevis?.devisInitialUri;

  const [filter, setFilter] = useState<string | null>(null); // null = toutes
  const [detailId, setDetailId] = useState<string | null>(null); // fiche détaillée (client)
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const chantierNom = useMemo(
    () => data.chantiers.find(c => c.id === chantierId)?.nom ?? '',
    [data.chantiers, chantierId],
  );

  const items = useMemo(
    () => (data.prescriptions || []).filter(p =>
      p.chantierId === chantierId
      // Client : ne voit pas les brouillons « à proposer » de l'archi (sauf ses propres suggestions).
      && (!clientMode || p.statut !== 'a_proposer' || p.sourceClient),
    ),
    [data.prescriptions, chantierId, clientMode],
  );

  const categories = useMemo(
    () => Array.from(new Set(items.map(i => i.categorie))).sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const visibles = useMemo(
    () => (filter === null ? items : items.filter(i => i.categorie === filter)),
    [items, filter],
  );

  // Regroupe par catégorie (ordre alphabétique)
  const groupes = useMemo(() => {
    const map = new Map<string, Prescription[]>();
    for (const p of visibles) {
      const arr = map.get(p.categorie) || [];
      arr.push(p);
      map.set(p.categorie, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibles]);

  const totalCategorie = (list: Prescription[]) =>
    list.reduce((s, p) => s + (p.prixUnitaire || 0) * (p.quantite || 0), 0);

  const openNew = () => {
    setEditId(null);
    setForm(clientMode ? { ...EMPTY_FORM, nature: 'deco', categorie: 'Mes envies' } : EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (p: Prescription) => {
    setEditId(p.id);
    // Migration : l'ancien champ `lien` unique est repris dans `liens`.
    const liens = p.liens && p.liens.length ? [...p.liens] : (p.lien ? [p.lien] : []);
    setForm({
      nature: p.nature,
      categorie: p.categorie,
      designation: p.designation,
      marque: p.marque || '',
      reference: p.reference || '',
      liens,
      documents: p.documents ? [...p.documents] : [],
      ftLiens: p.ficheTechnique?.liens ? [...p.ficheTechnique.liens] : [],
      ftDocuments: p.ficheTechnique?.documents ? [...p.ficheTechnique.documents] : [],
      prixUnitaire: p.prixUnitaire != null ? String(p.prixUnitaire) : '',
      unite: p.unite || '',
      quantite: p.quantite != null ? String(p.quantite) : '',
      tauxTVA: p.tauxTVA != null ? String(p.tauxTVA) : '20',
      auDevis: !!p.auDevis,
      montantDevis: p.montantDevis != null ? String(p.montantDevis) : '',
      statut: p.statut,
    });
    setShowForm(true);
  };

  const save = () => {
    const now = new Date().toISOString();
    const existing = editId ? items.find(i => i.id === editId) : undefined;
    const num = (v: string) => (v.trim() ? parseFloat(v.replace(',', '.')) || undefined : undefined);
    const liens = form.liens.map(l => l.trim()).filter(Boolean);
    const ftLiens = form.ftLiens.map(l => l.trim()).filter(Boolean);
    const ficheTechnique = (ftLiens.length || form.ftDocuments.length)
      ? { liens: ftLiens.length ? ftLiens : undefined, documents: form.ftDocuments.length ? form.ftDocuments : undefined }
      : undefined;
    const entry: Prescription = {
      id: editId || genId('presc'),
      chantierId,
      nature: form.nature,
      categorie: form.categorie.trim() || 'Divers',
      designation: form.designation.trim() || 'Sans titre',
      marque: form.marque.trim() || undefined,
      reference: form.reference.trim() || undefined,
      lien: liens[0],                                   // compat ascendante (1er lien)
      liens: liens.length ? liens : undefined,
      documents: form.documents.length ? form.documents : undefined,
      ficheTechnique,
      prixUnitaire: num(form.prixUnitaire),
      unite: form.unite.trim() || undefined,
      quantite: num(form.quantite),
      tauxTVA: num(form.tauxTVA),
      auDevis: form.auDevis || undefined,
      montantDevis: form.auDevis ? num(form.montantDevis) : undefined,
      statut: clientMode ? 'a_proposer' : form.statut,
      sourceClient: clientMode ? true : existing?.sourceClient,
      visibilite: existing?.visibilite,
      alternatives: existing?.alternatives,
      livraisonId: existing?.livraisonId,
      createParId: existing?.createParId || auteurId,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    if (editId) updatePrescription(entry);
    else addPrescription(entry);
    // Suggestion du client → notifier le prescripteur : l'admin/entreprise ET
    // l'architecte du chantier s'il y en a un (chacun peut la formaliser).
    if (clientMode && !editId) {
      const chantier = data.chantiers.find(c => c.id === chantierId);
      const archi = (data.apporteurs || []).find(a => a.id === chantier?.architecteId);
      const tokens = [
        ...getAdminPushTokens(data.employes || [], data.adminEmployeId),
        ...(archi?.pushToken ? [archi.pushToken] : []),
      ];
      const uniq = Array.from(new Set(tokens));
      if (uniq.length > 0) {
        sendPushNotification(uniq, 'Suggestion client', `${chantierNom} : nouvelle envie proposée — ${entry.designation}`).catch(() => {});
      }
    }
    setShowForm(false);
  };

  // Upload de fichiers/photos (caméra incluse) → documents
  const [uploading, setUploading] = useState(false);
  const pickDocs = async (onAdd: (docs: PrescriptionDocument[]) => void) => {
    try {
      const files = await pickNativeFile({ acceptImages: true, acceptPdf: true, acceptCamera: true, multiple: true });
      if (!files.length) return;
      setUploading(true);
      const uploaded: PrescriptionDocument[] = [];
      for (const f of files) {
        const url = await uploadFileToStorage(f.uri, `chantiers/${chantierId}/prescriptions`, genId('pdoc'));
        if (url) uploaded.push({ id: genId('pdoc'), nom: f.filename || 'Document', uri: url, type: f.mimeType?.includes('pdf') ? 'pdf' : 'image' });
      }
      setUploading(false);
      if (uploaded.length) onAdd(uploaded);
      else Alert.alert('Upload', "Le fichier n'a pas pu être envoyé.");
    } catch { setUploading(false); }
  };

  const confirmDelete = (p: Prescription) => {
    Alert.alert('Supprimer', `Supprimer « ${p.designation} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deletePrescription(p.id) },
    ]);
  };

  const set = (patch: Partial<FormState>) => setForm(f => ({ ...f, ...patch }));

  const body = (
      <View style={[styles.screen, embedded && styles.embedded]}>
        {/* En-tête (masqué en mode intégré : le portail affiche déjà le contexte) */}
        {!embedded && (
          <PanelHeader title="Prescriptions" sub={chantierNom} onClose={onClose ?? (() => {})} />
        )}

        {/* Filtres par catégorie */}
        {categories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <FilterChip label="Toutes" active={filter === null} onPress={() => setFilter(null)} activeColor={DS.bordeaux} />
            {categories.map(c => (
              <FilterChip key={c} label={c} active={filter === c} onPress={() => setFilter(c)} activeColor={DS.bordeaux} />
            ))}
          </ScrollView>
        )}

        {/* Liste groupée */}
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {groupes.length === 0 ? (
            <EmptyState iconComponent={Plus} title="Aucune prescription" description="Ajoutez le premier matériau ou élément de décoration." />
          ) : (
            groupes.map(([cat, list]) => (
              <View key={cat} style={styles.groupe}>
                <SectionHeader title={cat} count={list.length} subtitle={`${fmt(totalCategorie(list))} €`} uppercase size="sm" />
                {list.map(p => {
                  const sousTotal = (p.prixUnitaire || 0) * (p.quantite || 0);
                  return (
                    <Pressable key={p.id} style={styles.card} onPress={() => setDetailId(p.id)}>
                      <View style={styles.cardBody}>
                        <Text style={styles.designation} numberOfLines={1}>{p.designation}</Text>
                        {(p.marque || p.reference) ? (
                          <Text style={styles.marque} numberOfLines={1}>{[p.marque, p.reference].filter(Boolean).join(' · ')}</Text>
                        ) : null}
                        <View style={styles.metaRow}>
                          {p.prixUnitaire != null ? (
                            <Text style={styles.prix}>
                              {fmt(p.prixUnitaire)} €{p.unite ? ` /${p.unite}` : ''}
                              {p.quantite != null && sousTotal ? ` · ${fmt(sousTotal)} €` : ''}
                            </Text>
                          ) : null}
                          {(p.lien || p.liens?.length || p.ficheTechnique?.liens?.length) ? <Link2 size={13} color={DS.textSecondary} /> : null}
                          {(p.documents?.length || p.ficheTechnique?.documents?.length) ? <Paperclip size={13} color={DS.textSecondary} /> : null}
                        </View>
                        <View style={styles.pillRow}>
                          <StatusPill label={PRESCRIPTION_STATUT_LABELS[p.statut]} status={statutToPill(p.statut)} />
                          {p.sourceClient ? <Text style={styles.suggestBadge}>Suggéré client</Text> : null}
                        </View>
                      </View>
                      <View style={styles.actions}>
                        {p.statut === 'a_proposer' && !p.sourceClient ? <Text style={styles.draftBadge}>Brouillon</Text> : null}
                        <Text style={styles.cardChevron}>›</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>

        {/* FAB ajouter */}
        {!readonly && (
          <Pressable style={styles.fab} onPress={openNew}>
            <Plus size={22} color={DS.cremeFond} />
          </Pressable>
        )}

        {/* Fiche détaillée (client) : photo, specs, liens, documents, actions libellées */}
        {detailId && (() => {
          const p = items.find(i => i.id === detailId);
          if (!p) return null;
          const st = (p.prixUnitaire || 0) * (p.quantite || 0);
          const img = p.imageUri || p.documents?.find(d => d.type === 'image')?.uri;
          const liens = Array.from(new Set([...(p.liens || []), ...(p.lien ? [p.lien] : [])])).filter(Boolean);
          const ftLiens = p.ficheTechnique?.liens || [];
          const ftDocs = p.ficheTechnique?.documents || [];
          return (
            <View style={styles.formOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setDetailId(null)} />
              <View style={styles.formSheet}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={styles.detailHead}>
                    <Text style={styles.detailTitle}>{p.designation}</Text>
                    <Pressable hitSlop={8} onPress={() => setDetailId(null)} style={styles.closeBtn}><X size={20} color={DS.sombre} /></Pressable>
                  </View>
                  {img ? <Image source={{ uri: img }} style={styles.detailImg} resizeMode="cover" /> : null}
                  {(p.marque || p.reference || p.coloris) ? (
                    <Text style={styles.detailSub}>{[p.marque, p.reference, p.coloris].filter(Boolean).join(' · ')}</Text>
                  ) : null}
                  {p.prixUnitaire != null ? (
                    <Text style={styles.detailPrix}>
                      {fmt(p.prixUnitaire)} € HT{p.unite ? ` /${p.unite}` : ''}{p.quantite != null ? ` × ${p.quantite}` : ''}{st ? ` = ${fmt(st)} € HT` : ''}
                    </Text>
                  ) : null}
                  <View style={styles.detailPillRow}>
                    <StatusPill label={PRESCRIPTION_STATUT_LABELS[p.statut]} status={statutToPill(p.statut)} />
                    {p.sourceClient ? <Text style={styles.suggestBadge}>Suggéré client</Text> : null}
                  </View>
                  {p.note ? <Text style={styles.detailNote}>{p.note}</Text> : null}

                  {liens.length > 0 && (<>
                    <Text style={styles.formLabel}>Liens</Text>
                    {liens.map((l, i) => (
                      <Pressable key={`l${i}`} style={styles.detailLink} onPress={() => openDocPreview(l)}>
                        <Link2 size={15} color={DS.bordeaux} /><Text style={styles.detailLinkText} numberOfLines={1}>{l}</Text>
                      </Pressable>
                    ))}
                  </>)}
                  {(p.documents?.length || 0) > 0 && (<>
                    <Text style={styles.formLabel}>Documents</Text>
                    {p.documents!.map(d => (
                      <Pressable key={d.id} style={styles.detailLink} onPress={() => openDocPreview(d.uri)}>
                        {d.type === 'pdf' ? <FileText size={15} color={DS.bordeaux} /> : <ImageIcon size={15} color={DS.bordeaux} />}<Text style={styles.detailLinkText} numberOfLines={1}>{d.nom}</Text>
                      </Pressable>
                    ))}
                  </>)}
                  {(ftLiens.length > 0 || ftDocs.length > 0) && (<>
                    <Text style={styles.formLabel}>Fiche technique</Text>
                    {ftLiens.map((l, i) => (
                      <Pressable key={`fl${i}`} style={styles.detailLink} onPress={() => openDocPreview(l)}>
                        <Link2 size={15} color={DS.bordeaux} /><Text style={styles.detailLinkText} numberOfLines={1}>{l}</Text>
                      </Pressable>
                    ))}
                    {ftDocs.map(d => (
                      <Pressable key={d.id} style={styles.detailLink} onPress={() => openDocPreview(d.uri)}>
                        <FileText size={15} color={DS.bordeaux} /><Text style={styles.detailLinkText} numberOfLines={1}>{d.nom}</Text>
                      </Pressable>
                    ))}
                  </>)}

                  {/* Actions CLIENT (uniquement sur ce qui lui a été proposé) */}
                  {clientMode && p.statut === 'propose' && (
                    <View style={styles.detailActions}>
                      <Pressable style={[styles.detailBtn, styles.detailBtnOk]} onPress={() => decide(p, 'valide')}>
                        <Check size={17} color={DS.cremeFond} /><Text style={styles.detailBtnOkText}>Valider ce choix</Text>
                      </Pressable>
                      <Pressable style={styles.detailBtnGhost} onPress={() => decide(p, 'refuse')}>
                        <Text style={styles.detailBtnGhostText}>Refuser</Text>
                      </Pressable>
                    </View>
                  )}
                  {clientMode && p.statut === 'valide' && (
                    <View style={styles.detailActions}>
                      <Text style={styles.detailAccepted}>✓ Vous avez validé ce choix</Text>
                      <Pressable style={styles.detailBtnGhost} onPress={() => decide(p, 'propose')}>
                        <Text style={styles.detailBtnGhostText}>Changer d'avis — en choisir un autre</Text>
                      </Pressable>
                    </View>
                  )}
                  {clientMode && p.statut === 'refuse' && (
                    <View style={styles.detailActions}>
                      <Text style={styles.detailRefused}>Vous avez refusé ce choix</Text>
                      <Pressable style={styles.detailBtnGhost} onPress={() => decide(p, 'propose')}>
                        <Text style={styles.detailBtnGhostText}>Revenir sur mon refus</Text>
                      </Pressable>
                    </View>
                  )}
                  {/* Sa propre suggestion (client) */}
                  {clientMode && p.sourceClient && p.createParId === auteurId && (
                    <View style={styles.detailActions}>
                      <Pressable style={styles.detailBtnGhost} onPress={() => { setDetailId(null); openEdit(p); }}>
                        <Text style={styles.detailBtnGhostText}>Modifier ma suggestion</Text>
                      </Pressable>
                      <Pressable style={styles.detailBtnGhost} onPress={() => { setDetailId(null); confirmDelete(p); }}>
                        <Text style={styles.detailBtnGhostText}>Supprimer</Text>
                      </Pressable>
                    </View>
                  )}

                  {/* Actions PRESCRIPTEUR (architecte / entreprise) */}
                  {!clientMode && (
                    <View style={styles.detailActions}>
                      {p.statut === 'a_proposer' && !p.sourceClient && (
                        <Pressable style={[styles.detailBtn, styles.detailBtnOk]} onPress={() => setStatut(p, 'propose')}>
                          <Check size={17} color={DS.cremeFond} /><Text style={styles.detailBtnOkText}>Proposer au client</Text>
                        </Pressable>
                      )}
                      {p.statut === 'propose' && (
                        <Pressable style={styles.detailBtnGhost} onPress={() => setStatut(p, 'a_proposer')}>
                          <Text style={styles.detailBtnGhostText}>Repasser en brouillon (retirer au client)</Text>
                        </Pressable>
                      )}
                      <Pressable style={styles.detailBtnGhost} onPress={() => { setDetailId(null); openEdit(p); }}>
                        <Text style={styles.detailBtnGhostText}>Modifier</Text>
                      </Pressable>
                      <Pressable style={styles.detailBtnGhost} onPress={() => { setDetailId(null); confirmDelete(p); }}>
                        <Text style={styles.detailBtnGhostText}>Supprimer</Text>
                      </Pressable>
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>
          );
        })()}

        {/* Formulaire ajout/édition — overlay inline (pas de Modal imbriquée) */}
        {showForm && (
          <View style={styles.formOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowForm(false)} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={styles.formSheet}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.formTitle}>{editId ? 'Modifier' : 'Nouvelle prescription'}</Text>

                <View style={styles.segRow}>
                  {NATURES.map(n => (
                    <FilterChip key={n.key} label={n.label} active={form.nature === n.key} onPress={() => set({ nature: n.key })} activeColor={DS.bordeaux} />
                  ))}
                </View>

                <TextInput style={styles.input} placeholder="Catégorie (ex: Carrelage, Luminaires)" placeholderTextColor={DS.textAlt} value={form.categorie} onChangeText={t => set({ categorie: t })} />
                <TextInput style={styles.input} placeholder="Désignation (ex: Grès cérame 60×60 mat)" placeholderTextColor={DS.textAlt} value={form.designation} onChangeText={t => set({ designation: t })} />
                <View style={styles.row2}>
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Marque" placeholderTextColor={DS.textAlt} value={form.marque} onChangeText={t => set({ marque: t })} />
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Référence" placeholderTextColor={DS.textAlt} value={form.reference} onChangeText={t => set({ reference: t })} />
                </View>
                <View style={styles.row2}>
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Prix HT €" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.prixUnitaire} onChangeText={t => set({ prixUnitaire: t })} />
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Unité" placeholderTextColor={DS.textAlt} value={form.unite} onChangeText={t => set({ unite: t })} />
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Qté" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.quantite} onChangeText={t => set({ quantite: t })} />
                </View>
                <View style={styles.segRow}>
                  <Text style={styles.tvaLabel}>TVA %</Text>
                  {TVA_OPTIONS.map(tx => (
                    <FilterChip key={tx} label={`${tx.replace('.', ',')} %`} active={form.tauxTVA === tx} onPress={() => set({ tauxTVA: tx })} activeColor={DS.bordeaux} />
                  ))}
                </View>

                <Pressable style={styles.devisToggle} onPress={() => set({ auDevis: !form.auDevis })}>
                  <View style={[styles.checkbox, form.auDevis && styles.checkboxOn]} />
                  <Text style={styles.devisToggleText}>Prévu au devis (comparer l'écart de prix)</Text>
                </Pressable>
                {devisEntrepriseUri ? (
                  <Pressable style={styles.addLine} onPress={() => openDocPreview(devisEntrepriseUri)}>
                    <FileText size={15} color={DS.bordeaux} /><Text style={styles.addLineText}>Ouvrir le devis entreprise (vérifier si déjà inclus)</Text>
                  </Pressable>
                ) : null}
                {form.auDevis && (
                  <TextInput style={styles.input} placeholder="Montant prévu au devis € HT" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.montantDevis} onChangeText={t => set({ montantDevis: t })} />
                )}

                <Text style={styles.formLabel}>Références & visuels de l'article</Text>
                <LinksEditor liens={form.liens} onChange={l => set({ liens: l })} />
                <DocsEditor docs={form.documents} onChange={d => set({ documents: d })} onPick={() => pickDocs(docs => set({ documents: [...form.documents, ...docs] }))} busy={uploading} />

                <Text style={styles.formLabel}>Fiche technique</Text>
                <LinksEditor liens={form.ftLiens} onChange={l => set({ ftLiens: l })} />
                <DocsEditor docs={form.ftDocuments} onChange={d => set({ ftDocuments: d })} onPick={() => pickDocs(docs => set({ ftDocuments: [...form.ftDocuments, ...docs] }))} busy={uploading} />

                <Text style={styles.formLabel}>Statut</Text>
                <View style={styles.segWrap}>
                  {STATUTS.map(s => (
                    <FilterChip key={s} label={PRESCRIPTION_STATUT_LABELS[s]} active={form.statut === s} onPress={() => set({ statut: s })} activeColor={DS.bordeaux} />
                  ))}
                </View>

                <Pressable style={styles.saveBtn} onPress={save}>
                  <Text style={styles.saveText}>{editId ? 'Enregistrer' : 'Ajouter'}</Text>
                </Pressable>
              </ScrollView>
            </View>
            </KeyboardAvoidingView>
          </View>
        )}
      </View>
  );
  if (embedded) return body;
  return (
    <Modal visible={!!visible} animationType="slide" transparent onRequestClose={onClose}>
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DS.cremeFond },
  embedded: { paddingTop: space.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.lg, paddingTop: space.xxxl, paddingBottom: space.md },
  hTitle: { fontSize: font.xl, fontWeight: font.heavy, color: DS.sombre, textTransform: 'uppercase' },
  hSub: { fontSize: font.compact, fontWeight: font.semibold, color: DS.textSecondary, textTransform: 'uppercase', marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm },
  scroll: { paddingHorizontal: space.lg, paddingBottom: 120 },
  groupe: { marginBottom: space.lg },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border,
    padding: space.md, marginBottom: space.sm,
  },
  cardBody: { flex: 1, minWidth: 0 },
  designation: { fontSize: font.body, fontWeight: font.bold, color: DS.sombre },
  marque: { fontSize: font.compact, color: DS.textSecondary, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  prix: { fontSize: font.compact, fontWeight: font.semibold, color: DS.marron },
  pillRow: { marginTop: space.sm, flexDirection: 'row' },
  actions: { flexDirection: 'row', gap: space.sm },
  actionBtn: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  okBtn: { backgroundColor: DS.success },
  suggestBadge: { fontSize: font.tiny, fontWeight: font.bold, color: DS.marron, backgroundColor: DS.nudeMoyen, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.xs, marginLeft: space.xs, overflow: 'hidden', textTransform: 'uppercase' },
  cardChevron: { fontSize: 24, fontWeight: '700', color: DS.textAlt },
  draftBadge: { fontSize: font.tiny, fontWeight: font.bold, color: DS.textSecondary, backgroundColor: DS.cremeNude, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.xs, overflow: 'hidden', textTransform: 'uppercase' },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: space.sm },
  detailTitle: { flex: 1, fontSize: font.title, fontWeight: font.heavy, color: DS.sombre },
  detailImg: { width: '100%', height: 200, borderRadius: radius.md, backgroundColor: DS.cremeNude, marginBottom: space.sm },
  detailSub: { fontSize: font.body, color: DS.textSecondary, marginBottom: space.xs },
  detailPrix: { fontSize: font.md, fontWeight: font.bold, color: DS.marron, marginBottom: space.sm },
  detailPillRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm },
  detailNote: { fontSize: font.compact, color: DS.textSecondary, fontStyle: 'italic', marginBottom: space.sm },
  detailLink: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: DS.border },
  detailLinkText: { flex: 1, fontSize: font.compact, color: DS.bordeaux, fontWeight: font.semibold },
  detailActions: { marginTop: space.lg, gap: space.sm },
  detailBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, borderRadius: radius.xl, paddingVertical: space.md },
  detailBtnOk: { backgroundColor: DS.success },
  detailBtnOkText: { color: DS.cremeFond, fontSize: font.md, fontWeight: font.bold },
  detailBtnGhost: { borderRadius: radius.xl, paddingVertical: space.md, alignItems: 'center', backgroundColor: DS.cremeNude },
  detailBtnGhostText: { color: DS.marron, fontSize: font.body, fontWeight: font.bold },
  detailAccepted: { fontSize: font.body, fontWeight: font.bold, color: DS.success, textAlign: 'center' },
  detailRefused: { fontSize: font.body, fontWeight: font.bold, color: DS.marron, textAlign: 'center' },
  fab: {
    position: 'absolute', right: space.lg, bottom: space.xl,
    width: 52, height: 52, borderRadius: radius.lg, backgroundColor: DS.bordeaux,
    alignItems: 'center', justifyContent: 'center',
  },
  // Formulaire (overlay inline)
  formOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,38,34,0.42)', justifyContent: 'flex-end' },
  formSheet: { backgroundColor: DS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.xl, maxHeight: '88%' },
  formTitle: { fontSize: font.title, fontWeight: font.heavy, color: DS.sombre, marginBottom: space.md, textTransform: 'uppercase' },
  segRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md, alignItems: 'center' },
  tvaLabel: { fontSize: font.compact, fontWeight: font.semibold, color: DS.textSecondary, marginRight: space.xs },
  segWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  input: {
    backgroundColor: DS.surfaceHover, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md,
    paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: font.md, color: DS.text, marginBottom: space.sm,
  },
  row2: { flexDirection: 'row', gap: space.sm },
  flex1: { flex: 1 },
  formLabel: { fontSize: font.compact, fontWeight: font.semibold, color: DS.textSecondary, textTransform: 'uppercase', marginBottom: space.sm, marginTop: space.xs },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  linkInput: { flex: 1 },
  miniDel: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude, marginBottom: space.sm },
  devisToggle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, marginBottom: space.sm },
  checkbox: { width: 22, height: 22, borderRadius: radius.xs, borderWidth: 1.5, borderColor: DS.border, backgroundColor: DS.surface },
  checkboxOn: { backgroundColor: DS.bordeaux, borderColor: DS.bordeaux },
  devisToggleText: { fontSize: font.compact, fontWeight: font.semibold, color: DS.sombre, flex: 1 },
  addLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.sm, marginBottom: space.sm },
  addLineText: { fontSize: font.compact, fontWeight: font.bold, color: DS.bordeaux },
  docWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.xs },
  docChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DS.cremeNude, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 10, maxWidth: '100%' },
  docChipMain: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  docChipText: { fontSize: font.compact, fontWeight: font.semibold, color: DS.bordeaux, flexShrink: 1 },
  saveBtn: { backgroundColor: DS.bordeaux, borderRadius: radius.xl, paddingVertical: space.md, alignItems: 'center', marginTop: space.sm },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { color: DS.cremeFond, fontSize: font.md, fontWeight: font.bold },
});
