import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, Modal, Alert, Platform, Linking,
} from 'react-native';
import { DS, font, radius, space } from '@/constants/design';
import { useApp } from '@/app/context/AppContext';
import { fournisseurSlug } from '@/app/context/AppContext';
import type { Fournisseur } from '@/app/types';

/**
 * Carnet d'adresses fournisseurs : liste des fiches + formulaire détaillé
 * (ajout / édition / suppression). Composant autonome, à embarquer dans une
 * modal (Matériel) ou une section d'écran (Gestion).
 */
interface Props {
  /** Affiche un bouton "Fermer" en bas (usage modal). */
  onClose?: () => void;
  /** Titre affiché en haut (défaut : "Fournisseurs"). */
  title?: string;
}

const EMPTY: Fournisseur = { id: '', nom: '' };

export function FournisseursManager({ onClose, title = 'Fournisseurs' }: Props) {
  const { data, addFournisseurFiche, updateFournisseurFiche, deleteFournisseurFiche } = useApp();
  const fiches = useMemo(
    () => [...(data.fournisseursFiches || [])].sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr')),
    [data.fournisseursFiches],
  );
  const [recherche, setRecherche] = useState('');
  const [form, setForm] = useState<Fournisseur | null>(null); // fiche en édition (ou nouvelle)

  const filtered = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return fiches;
    return fiches.filter(f =>
      [f.nom, f.categorie, f.contact, f.telephone, f.email].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [fiches, recherche]);

  const openNew = () => setForm({ ...EMPTY });
  const openEdit = (f: Fournisseur) => setForm({ ...f });

  const save = () => {
    if (!form) return;
    const nom = (form.nom || '').trim();
    if (!nom) { Alert.alert('Nom requis', 'Indiquez au moins le nom du fournisseur.'); return; }
    const clean: Fournisseur = {
      ...form,
      nom,
      categorie: form.categorie?.trim() || undefined,
      contact: form.contact?.trim() || undefined,
      telephone: form.telephone?.trim() || undefined,
      email: form.email?.trim() || undefined,
      adresse: form.adresse?.trim() || undefined,
      siteWeb: form.siteWeb?.trim() || undefined,
      siret: form.siret?.trim() || undefined,
      rib: form.rib?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
    };
    if (form.id) {
      updateFournisseurFiche(clean);
    } else {
      addFournisseurFiche({ ...clean, id: `${fournisseurSlug(nom)}_${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString() });
    }
    setForm(null);
  };

  const remove = (f: Fournisseur) => {
    const doDelete = () => deleteFournisseurFiche(f.id);
    if (Platform.OS === 'web') { if (window.confirm(`Supprimer "${f.nom}" ?`)) doDelete(); }
    else Alert.alert('Supprimer', `Supprimer "${f.nom}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: doDelete },
    ]);
  };

  const call = (tel?: string) => { if (tel) Linking.openURL(`tel:${tel.replace(/\s/g, '')}`).catch(() => {}); };
  const mail = (email?: string) => { if (email) Linking.openURL(`mailto:${email}`).catch(() => {}); };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm }}>
        <Text style={{ fontSize: font.title, fontWeight: font.bold, color: DS.textStrong }}>{title}</Text>
        <Pressable onPress={openNew} style={{ backgroundColor: DS.primary, borderRadius: radius.md, paddingVertical: space.xs, paddingHorizontal: space.md }}>
          <Text style={{ color: DS.textInverse, fontWeight: font.semibold, fontSize: font.compact }}>＋ Nouveau</Text>
        </Pressable>
      </View>

      <TextInput
        value={recherche}
        onChangeText={setRecherche}
        placeholder="Rechercher un fournisseur…"
        placeholderTextColor={DS.textSecondary}
        style={{ backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, color: DS.text, marginBottom: space.sm }}
      />

      <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
        {filtered.length === 0 ? (
          <Text style={{ color: DS.textSecondary, fontStyle: 'italic', textAlign: 'center', padding: space.lg }}>
            {fiches.length === 0 ? 'Aucun fournisseur pour le moment.' : 'Aucun résultat.'}
          </Text>
        ) : filtered.map(f => (
          <Pressable key={f.id} onPress={() => openEdit(f)}
            style={{ backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md, padding: space.md, marginBottom: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: font.md, fontWeight: font.semibold, color: DS.text }} numberOfLines={1}>{f.nom}</Text>
                {(f.categorie || f.contact) ? (
                  <Text style={{ fontSize: font.compact, color: DS.textSecondary, marginTop: 1 }} numberOfLines={1}>
                    {[f.categorie, f.contact].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                {(f.telephone || f.email) ? (
                  <Text style={{ fontSize: font.compact, color: DS.textSecondary, marginTop: 1 }} numberOfLines={1}>
                    {[f.telephone, f.email].filter(Boolean).join('  ·  ')}
                  </Text>
                ) : null}
              </View>
              {f.telephone ? (
                <Pressable onPress={() => call(f.telephone)} hitSlop={8} style={{ padding: space.xs }}>
                  <Text style={{ fontSize: 18 }}>📞</Text>
                </Pressable>
              ) : null}
              {f.email ? (
                <Pressable onPress={() => mail(f.email)} hitSlop={8} style={{ padding: space.xs }}>
                  <Text style={{ fontSize: 18 }}>✉️</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => remove(f)} hitSlop={8} style={{ padding: space.xs }}>
                <Text style={{ fontSize: 16, color: DS.error }}>✕</Text>
              </Pressable>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {onClose ? (
        <Pressable onPress={onClose} style={{ paddingVertical: space.md, alignItems: 'center', marginTop: space.sm }}>
          <Text style={{ color: DS.textSecondary, fontWeight: font.semibold }}>Fermer</Text>
        </Pressable>
      ) : null}

      {/* Formulaire fiche (ajout / édition) */}
      <Modal visible={form !== null} transparent animationType="slide" onRequestClose={() => setForm(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setForm(null)} />
          <View style={{ backgroundColor: DS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: space.lg, maxHeight: '90%' }}>
            <Text style={{ fontSize: font.title, fontWeight: font.bold, color: DS.textStrong, marginBottom: space.md }}>
              {form?.id ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {form && ([
                { k: 'nom', label: 'Nom *', kb: 'default' },
                { k: 'categorie', label: 'Catégorie / spécialité (ex: Placo, Électricité…)', kb: 'default' },
                { k: 'contact', label: 'Contact (interlocuteur)', kb: 'default' },
                { k: 'telephone', label: 'Téléphone', kb: 'phone-pad' },
                { k: 'email', label: 'Email', kb: 'email-address' },
                { k: 'adresse', label: 'Adresse', kb: 'default', multi: true },
                { k: 'siteWeb', label: 'Site web', kb: 'url' },
                { k: 'siret', label: 'SIRET', kb: 'default' },
                { k: 'rib', label: 'RIB / IBAN', kb: 'default' },
                { k: 'notes', label: 'Notes (délais, conditions, remise…)', kb: 'default', multi: true },
              ] as { k: keyof Fournisseur; label: string; kb: string; multi?: boolean }[]).map(({ k, label, kb, multi }) => (
                <View key={k} style={{ marginBottom: space.sm }}>
                  <Text style={{ fontSize: font.compact, color: DS.textSecondary, marginBottom: 3 }}>{label}</Text>
                  <TextInput
                    value={(form as any)[k] ?? ''}
                    onChangeText={(v) => setForm(prev => (prev ? { ...prev, [k]: v } : prev))}
                    keyboardType={kb as any}
                    autoCapitalize={k === 'email' || k === 'siteWeb' ? 'none' : 'sentences'}
                    multiline={!!(multi as any)}
                    style={{
                      backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md,
                      paddingHorizontal: space.md, paddingVertical: space.sm, color: DS.text,
                      minHeight: (multi as any) ? 60 : undefined, textAlignVertical: (multi as any) ? 'top' : 'center',
                    }}
                  />
                </View>
              ))}
              <View style={{ height: space.sm }} />
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
              <Pressable onPress={() => setForm(null)} style={{ flex: 1, paddingVertical: space.md, alignItems: 'center', borderRadius: radius.md, backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.border }}>
                <Text style={{ color: DS.textSecondary, fontWeight: font.semibold }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={save} style={{ flex: 2, paddingVertical: space.md, alignItems: 'center', borderRadius: radius.md, backgroundColor: DS.primary }}>
                <Text style={{ color: DS.textInverse, fontWeight: font.bold }}>{form?.id ? 'Enregistrer' : 'Ajouter'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
