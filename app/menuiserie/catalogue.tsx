/**
 * Catalogue matériaux (panneaux Egger / Finsa / Decospan, tissus, quincaillerie,
 * éclairage, stock usine avec référence interne) et liste des fournisseurs.
 * Admin et usine modifient ; l'employé d'usine consulte.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { DS, radius } from '@/constants/design';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { useCompteMn } from '@/lib/menuiserie/SessionMn';
import { enregistrerArticleMn, enregistrerFournisseurMn, listerCatalogueMn, listerFournisseursMn, supprimerArticleMn } from '@/lib/menuiserie/api2';
import type { ArticleCatalogueMn, CategorieCatalogueMn, FournisseurMn } from '@/lib/menuiserie/types';
import { CATEGORIE_CATALOGUE_LABELS } from '@/lib/menuiserie/types';
import { Bouton, Carte, Champ, EnTete, Puce, Section } from '@/components/menuiserie/ui';
import { ouvrirDocumentMn } from '@/components/menuiserie/DocumentsEtape';

const CATS = Object.keys(CATEGORIE_CATALOGUE_LABELS) as CategorieCatalogueMn[];
type FormArticle = { id?: string; categorie: CategorieCatalogueMn; marque: string; reference: string; reference_interne: string; designation: string; quantite: string; notes: string };

export default function CatalogueMn() {
  const router = useRouter();
  const moi = useCompteMn();
  const peutModifier = moi.role === 'admin' || moi.role === 'usine';
  const [onglet, setOnglet] = useState<'catalogue' | 'fournisseurs'>('catalogue');
  const [cat, setCat] = useState<CategorieCatalogueMn | 'tous'>('tous');
  const [recherche, setRecherche] = useState('');
  const [articles, setArticles] = useState<ArticleCatalogueMn[]>([]);
  const [fournisseurs, setFournisseurs] = useState<FournisseurMn[]>([]);
  const [fa, setFa] = useState<FormArticle | null>(null);
  const [photo, setPhoto] = useState<{ uri: string; nom: string; mime: string } | null>(null);
  const [ff, setFf] = useState<{ id?: string; nom: string; categorie: string; contact: string; telephone: string; email: string } | null>(null);
  const [message, setMessage] = useState('');

  const charger = useCallback(async () => {
    try { const [a, f] = await Promise.all([listerCatalogueMn(), listerFournisseursMn()]); setArticles(a); setFournisseurs(f); }
    catch (e) { setMessage((e as Error).message); }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return articles.filter(a => (cat === 'tous' || a.categorie === cat)
      && (!q || [a.designation, a.marque, a.reference, a.reference_interne].some(v => (v || '').toLowerCase().includes(q))));
  }, [articles, cat, recherche]);

  const enregistrerArticle = async () => {
    if (!fa?.designation.trim()) { setMessage('La désignation est obligatoire.'); return; }
    const n = (s: string) => s.trim() || null;
    try {
      await enregistrerArticleMn({
        id: fa.id, categorie: fa.categorie, designation: fa.designation.trim(), marque: n(fa.marque), reference: n(fa.reference),
        reference_interne: n(fa.reference_interne), quantite: n(fa.quantite), notes: n(fa.notes),
        usine_id: moi.role === 'usine' ? moi.usine_id : undefined,
      }, photo);
      setFa(null); setPhoto(null); setMessage(''); charger();
    } catch (e) { setMessage((e as Error).message); }
  };
  const enregistrerFournisseur = async () => {
    if (!ff?.nom.trim()) return;
    const n = (s: string) => s.trim() || null;
    try {
      await enregistrerFournisseurMn({ id: ff.id, nom: ff.nom.trim(), categorie: n(ff.categorie), contact: n(ff.contact), telephone: n(ff.telephone), email: n(ff.email), usine_id: moi.role === 'usine' ? moi.usine_id : undefined });
      setFf(null); charger();
    } catch (e) { setMessage((e as Error).message); }
  };

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 10 }} keyboardShouldPersistTaps="handled">
        <EnTete titre="Catalogue & fournisseurs" retour={moi.role !== 'admin' ? () => router.back() : undefined} />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Puce label="Catalogue matériaux" actif={onglet === 'catalogue'} onPress={() => setOnglet('catalogue')} />
          <Puce label="Fournisseurs" actif={onglet === 'fournisseurs'} onPress={() => setOnglet('fournisseurs')} />
        </View>
        {!!message && <Text style={{ color: DS.error, fontWeight: '600' }}>{message}</Text>}

        {onglet === 'catalogue' ? (
          <>
            <Champ label="Rechercher (désignation, marque, référence, réf. interne)" value={recherche} onChangeText={setRecherche} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Puce label="Tout" actif={cat === 'tous'} onPress={() => setCat('tous')} />
              {CATS.map(c => <Puce key={c} label={CATEGORIE_CATALOGUE_LABELS[c]} actif={cat === c} onPress={() => setCat(c)} />)}
            </View>
            {peutModifier && (fa ? (
              <Carte>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {CATS.map(c => <Puce key={c} label={CATEGORIE_CATALOGUE_LABELS[c]} actif={fa.categorie === c} onPress={() => setFa(x => x && { ...x, categorie: c })} />)}
                </View>
                <Champ label="Désignation *" value={fa.designation} onChangeText={v => setFa(x => x && { ...x, designation: v })} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Champ label="Marque (Egger, Finsa…)" value={fa.marque} onChangeText={v => setFa(x => x && { ...x, marque: v })} />
                  <Champ label="Référence fournisseur" value={fa.reference} onChangeText={v => setFa(x => x && { ...x, reference: v })} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Champ label="Référence interne" value={fa.reference_interne} onChangeText={v => setFa(x => x && { ...x, reference_interne: v })} />
                  <Champ label="Quantité en stock" value={fa.quantite} onChangeText={v => setFa(x => x && { ...x, quantite: v })} />
                </View>
                <Champ label="Notes" value={fa.notes} onChangeText={v => setFa(x => x && { ...x, notes: v })} />
                <Bouton label={photo ? `Photo : ${photo.nom}` : '+ Photo'} variante="contour" onPress={async () => {
                  const r = await pickNativeFile({ acceptCamera: true, acceptPdf: false, compressImages: true, multiple: false });
                  if (r.length) setPhoto({ uri: r[0].uri, mime: r[0].mimeType, nom: r[0].filename || 'photo.jpg' });
                }} />
                <Bouton label="Enregistrer" onPress={enregistrerArticle} />
                {fa.id && <Bouton label="Supprimer l'article" variante="discret" onPress={async () => { await supprimerArticleMn(fa.id as string); setFa(null); charger(); }} />}
                <Bouton label="Annuler" variante="discret" onPress={() => { setFa(null); setPhoto(null); }} />
              </Carte>
            ) : (
              <Bouton label="+ Nouvelle référence" onPress={() => setFa({ categorie: cat === 'tous' ? 'panneaux' : cat, marque: '', reference: '', reference_interne: '', designation: '', quantite: '', notes: '' })} />
            ))}
            <Section>{liste.length} référence{liste.length > 1 ? 's' : ''}</Section>
            {liste.map(a => (
              <Pressable key={a.id} disabled={!peutModifier} accessibilityRole="button"
                onPress={() => setFa({ id: a.id, categorie: a.categorie, marque: a.marque || '', reference: a.reference || '', reference_interne: a.reference_interne || '', designation: a.designation, quantite: a.quantite || '', notes: a.notes || '' })}>
                <Carte style={{ gap: 4 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: DS.text }}>{a.designation}</Text>
                  <Text style={{ fontSize: 13, color: DS.textSecondary }}>
                    {[a.marque, a.reference, a.reference_interne ? `réf. interne ${a.reference_interne}` : null, a.quantite ? `stock : ${a.quantite}` : null].filter(Boolean).join(' · ') || CATEGORIE_CATALOGUE_LABELS[a.categorie]}
                  </Text>
                  {!!a.photo_chemin && (
                    <Pressable onPress={() => ouvrirDocumentMn({ chemin: a.photo_chemin as string })} accessibilityRole="link" style={{ alignSelf: 'flex-start', backgroundColor: DS.background, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontWeight: '700', color: DS.primary }}>Voir la photo</Text>
                    </Pressable>
                  )}
                </Carte>
              </Pressable>
            ))}
          </>
        ) : (
          <>
            {peutModifier && (ff ? (
              <Carte>
                <Champ label="Nom *" value={ff.nom} onChangeText={v => setFf(x => x && { ...x, nom: v })} />
                <Champ label="Catégorie (panneaux, quincaillerie…)" value={ff.categorie} onChangeText={v => setFf(x => x && { ...x, categorie: v })} />
                <Champ label="Contact" value={ff.contact} onChangeText={v => setFf(x => x && { ...x, contact: v })} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Champ label="Téléphone" value={ff.telephone} onChangeText={v => setFf(x => x && { ...x, telephone: v })} />
                  <Champ label="E-mail" value={ff.email} onChangeText={v => setFf(x => x && { ...x, email: v })} autoCapitalize="none" />
                </View>
                <Bouton label="Enregistrer" onPress={enregistrerFournisseur} />
                <Bouton label="Annuler" variante="discret" onPress={() => setFf(null)} />
              </Carte>
            ) : <Bouton label="+ Nouveau fournisseur" onPress={() => setFf({ nom: '', categorie: '', contact: '', telephone: '', email: '' })} />)}
            {fournisseurs.map(f => (
              <Pressable key={f.id} disabled={!peutModifier} accessibilityRole="button"
                onPress={() => setFf({ id: f.id, nom: f.nom, categorie: f.categorie || '', contact: f.contact || '', telephone: f.telephone || '', email: f.email || '' })}>
                <Carte style={{ gap: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: DS.text }}>{f.nom}</Text>
                  <Text style={{ fontSize: 13, color: DS.textSecondary }}>{[f.categorie, f.contact, f.telephone, f.email].filter(Boolean).join(' · ')}</Text>
                </Carte>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
