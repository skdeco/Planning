/**
 * Administrateur — onglet Client du devis : suppléments proposés au client
 * (libellé + prix HT). Le client les voit dans son espace et les accepte ou refuse.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { DS } from '@/constants/design';
import { formatDateFR } from '@/lib/date/format';
import type { CompteMn } from '@/lib/menuiserie/types';
import { ajouterSupplementMn, listerSupplementsMn, supprimerSupplementMn, totalAccepte, type SupplementMn } from '@/lib/menuiserie/supplements';
import { Bloc, Bouton, Champ, Pastille, euros } from './ui';
import { tm } from '@/lib/menuiserie/i18n';

export function StatutSupplement({ s }: { s: SupplementMn }) {
  if (s.statut === 'accepte') return <Pastille label={tm("Accepté")} fond={DS.successSoft} texte="#065F46" />;
  if (s.statut === 'refuse') return <Pastille label={tm("Refusé")} fond="#FDE2E1" texte={DS.error} />;
  return <Pastille label={tm("En attente du client")} fond={DS.warningSoft} texte="#92400E" />;
}

export function SupplementsDevis({ moi, chantierId, venteBase }: { moi: CompteMn; chantierId: string; venteBase: number }) {
  const [liste, setListe] = useState<SupplementMn[]>([]);
  const [ajout, setAjout] = useState(false);
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState('');
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try { setListe(await listerSupplementsMn(chantierId)); } catch (e) { setErreur((e as Error).message); }
  }, [chantierId]);
  useEffect(() => { charger(); }, [charger]);

  const valeur = Number(montant.replace(/\s/g, '').replace(',', '.'));
  const valider = async () => {
    if (!libelle.trim() || !isFinite(valeur) || valeur <= 0) { setErreur(tm("Indiquez un libellé et un montant.")); return; }
    setCharge(true); setErreur('');
    try { await ajouterSupplementMn(moi, chantierId, { libelle, montant_ht: valeur }); setLibelle(''); setMontant(''); setAjout(false); await charger(); }
    catch (e) { setErreur((e as Error).message); }
    setCharge(false);
  };
  const accepte = totalAccepte(liste);

  return (
    <Bloc titre={tm("Suppléments")} droite={!ajout && (
      <Pressable onPress={() => setAjout(true)} accessibilityRole="button" hitSlop={8}
        style={{ minHeight: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: DS.primary, justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: DS.textInverse }}>{tm("+ Supplément")}</Text>
      </Pressable>
    )}>
      {liste.length === 0 && !ajout && <Text style={{ fontSize: 13, color: DS.textMuted }}>{tm("Aucun supplément. Ceux que vous ajoutez sont envoyés au client pour acceptation.")}</Text>}
      {liste.map(s => (
        <View key={s.id} style={{ borderRadius: 14, backgroundColor: DS.background, padding: 12, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: DS.text }}>{s.libelle}</Text>
            <Text style={{ fontSize: 15, fontFamily: 'Manrope_700Bold', color: DS.text }}>{euros(Number(s.montant_ht))} {tm("HT")}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <StatutSupplement s={s} />
            {!!s.repondu_le && <Text style={{ fontSize: 11, color: DS.textMuted }}>{s.repondu_par_nom} · {formatDateFR(s.repondu_le.slice(0, 10))}</Text>}
            <View style={{ flex: 1 }} />
            {s.statut !== 'accepte' && (
              <Pressable onPress={async () => { await supprimerSupplementMn(moi, s); charger(); }} hitSlop={8} accessibilityRole="button">
                <Text style={{ fontSize: 12, fontWeight: '700', color: DS.error }}>{tm("Retirer")}</Text>
              </Pressable>
            )}
          </View>
          {!!s.commentaire_client && <Text style={{ fontSize: 12, color: DS.textSecondary, fontStyle: 'italic' }}>« {s.commentaire_client} »</Text>}
        </View>
      ))}
      {ajout && (
        <View style={{ gap: 10 }}>
          <Champ label={tm("Libellé du supplément")} value={libelle} onChangeText={setLibelle} placeholder={tm("Ex. : niche supplémentaire cuisine")} />
          <Champ label={tm("Montant HT (€)")} value={montant} onChangeText={setMontant} keyboardType="decimal-pad" placeholder="0" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Bouton label={tm("Annuler")} variante="contour" onPress={() => { setAjout(false); setErreur(''); }} /></View>
            <View style={{ flex: 1 }}><Bouton label={tm("Envoyer au client")} onPress={valider} charge={charge} /></View>
          </View>
        </View>
      )}
      {!!erreur && <Text style={{ fontSize: 13, color: DS.error }}>{erreur}</Text>}
      {accepte > 0 && (
        <Text style={{ fontSize: 13, color: DS.textSecondary }}>
          {tm("Suppléments acceptés :")} <Text style={{ fontWeight: '800', color: DS.text }}>{euros(accepte)}</Text>
          {venteBase > 0 ? <> · {tm("Total vente :")} <Text style={{ fontWeight: '800', color: DS.text }}>{euros(venteBase + accepte)} {tm("HT")}</Text></> : null}
        </Text>
      )}
    </Bloc>
  );
}
