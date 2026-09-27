/**
 * Compte usine : ses employés — pointages du jour, demandes de congé / absence,
 * solde de congés, fiches de paie, création de compte, position de l'usine.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { ScreenContainer } from '@/components/screen-container';
import { DS, radius } from '@/constants/design';
import { formatDateFR } from '@/lib/date/format';
import { generatePassword } from '@/lib/externAuth';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { useCompteMn } from '@/lib/menuiserie/SessionMn';
import { creerCompteMn } from '@/lib/menuiserie/auth';
import { changerMotDePasseCompteMn } from '@/lib/menuiserie/api';
import {
  comptesDeLUsineMn, deposerDocRhMn, listerCongesMn, listerDocsRhMn, listerPointagesMn, monUsineMn, positionUsineMn, traiterCongeMn,
} from '@/lib/menuiserie/api2';
import type { CompteMn, CongeMn, DocRhMn, PointageMn, UsineMn } from '@/lib/menuiserie/types';
import { Bouton, Carte, Champ, EnTete, Pastille, Section } from '@/components/menuiserie/ui';
import { ouvrirDocumentMn } from '@/components/menuiserie/DocumentsEtape';
import { soldeConges } from '@/lib/menuiserie/rh';

const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export default function EmployesUsine() {
  const router = useRouter();
  const moi = useCompteMn();
  const [usine, setUsine] = useState<UsineMn | null>(null);
  const [employes, setEmployes] = useState<CompteMn[]>([]);
  const [pointages, setPointages] = useState<PointageMn[]>([]);
  const [conges, setConges] = useState<CongeMn[]>([]);
  const [docs, setDocs] = useState<DocRhMn[]>([]);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [mois, setMois] = useState('');
  const [nouveau, setNouveau] = useState<{ nom: string; identifiant: string; email: string; mdp: string } | null>(null);
  const [message, setMessage] = useState('');

  const charger = useCallback(async () => {
    if (!moi.usine_id) return;
    const debut = new Date(); debut.setHours(0, 0, 0, 0);
    try {
      const [u, e, p, c, d] = await Promise.all([
        monUsineMn(moi), comptesDeLUsineMn(moi.usine_id), listerPointagesMn({ usineId: moi.usine_id, depuis: debut.toISOString() }),
        listerCongesMn({ usineId: moi.usine_id }), listerDocsRhMn({ usineId: moi.usine_id }),
      ]);
      setUsine(u); setEmployes(e.filter(x => x.role === 'employe_usine')); setPointages(p); setConges(c); setDocs(d);
    } catch (err) { setMessage((err as Error).message); }
  }, [moi]);
  useEffect(() => { charger(); }, [charger]);

  const definirPosition = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted' || !moi.usine_id) { setMessage('Autorise la localisation pour définir la position.'); return; }
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    await positionUsineMn(moi.usine_id, p.coords.latitude, p.coords.longitude);
    setMessage("Position de l'usine enregistrée : les pointages seront comparés à ce point (200 m)."); charger();
  };

  const creer = async () => {
    if (!nouveau?.nom.trim()) return;
    const r = await creerCompteMn({ nom: nouveau.nom, role: 'employe_usine', motDePasse: nouveau.mdp, identifiant: nouveau.identifiant, email: nouveau.email, usineId: moi.usine_id });
    setMessage(r.ok ? `Compte créé : ${nouveau.email || nouveau.identifiant} / ${nouveau.mdp}` : r.erreur);
    if (r.ok) { setNouveau(null); charger(); }
  };

  const deposerFiche = async (e: CompteMn) => {
    const f = await pickNativeFile({ acceptImages: true, acceptPdf: true, multiple: false });
    if (!f.length) return;
    try {
      await deposerDocRhMn(e, { uri: f[0].uri, mime: f[0].mimeType, nom: f[0].filename || `Fiche_de_paie_${mois || 'mois'}.pdf`, mois });
      setMessage('Fiche de paie déposée.'); setMois(''); charger();
    } catch (err) { setMessage((err as Error).message); }
  };

  const enAttente = conges.filter(c => c.statut === 'en_attente');

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 10 }} keyboardShouldPersistTaps="handled">
        <EnTete titre={`Employés${usine ? ` · ${usine.nom}` : ''}`} retour={() => router.back()} />
        {!!message && <Carte><Text style={{ fontSize: 14, fontWeight: '600', color: DS.primary }} selectable>{message}</Text></Carte>}

        <Carte>
          <Text style={{ fontSize: 14, color: DS.text }}>
            {usine?.latitude != null ? "Position de l'usine définie (zone de pointage : 200 m)." : "La position de l'usine n'est pas encore définie : les pointages ne peuvent pas être vérifiés."}
          </Text>
          <Bouton label="Définir la position de l'usine ici" variante="contour" onPress={definirPosition} />
        </Carte>

        {enAttente.length > 0 && <Section>Demandes à traiter ({enAttente.length})</Section>}
        {enAttente.map(c => {
          const e = employes.find(x => x.id === c.compte_id);
          return (
            <Carte key={c.id} style={{ borderWidth: 2, borderColor: DS.warning }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: DS.text }}>{e?.nom || 'Employé'} · {c.type === 'conges' ? 'Congés' : 'Absence'}</Text>
              <Text style={{ fontSize: 14, color: DS.text }}>Du {formatDateFR(c.date_debut)} au {formatDateFR(c.date_fin)} ({c.jours} j){c.motif ? ` · ${c.motif}` : ''}</Text>
              {!!c.justificatif_chemin && (
                <Pressable onPress={() => ouvrirDocumentMn({ chemin: c.justificatif_chemin as string })} accessibilityRole="link">
                  <Text style={{ fontWeight: '800', color: DS.primary }}>Voir le justificatif</Text>
                </Pressable>
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Bouton label="Accepter" onPress={async () => { await traiterCongeMn(moi, c.id, 'approuve'); charger(); }} /></View>
                <View style={{ flex: 1 }}><Bouton label="Refuser" variante="contour" onPress={async () => { await traiterCongeMn(moi, c.id, 'refuse'); charger(); }} /></View>
              </View>
            </Carte>
          );
        })}

        <Section>Équipe ({employes.length})</Section>
        {employes.map(e => {
          const p = pointages.filter(x => x.compte_id === e.id);
          const arr = p.filter(x => x.type === 'arrivee').pop();
          const dep = p.find(x => x.type === 'depart');
          const fiches = docs.filter(d => d.compte_id === e.id);
          return (
            <Carte key={e.id}>
              <Pressable onPress={() => setOuvert(ouvert === e.id ? null : e.id)} accessibilityRole="button" style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text, flex: 1 }}>{e.nom}</Text>
                  {arr ? <Pastille label={arr.hors_zone ? 'Hors zone' : 'Présent'} fond={arr.hors_zone ? '#F6EEDB' : '#E7F0EA'} texte={arr.hors_zone ? '#5A3E08' : '#1F4D36'} />
                    : <Pastille label="Pas pointé" fond={DS.segment} texte={DS.text} />}
                </View>
                <Text style={{ fontSize: 13, color: DS.textSecondary }}>
                  {arr ? `Arrivée ${heure(arr.horodatage)}${arr.distance_m != null ? ` (${arr.distance_m} m)` : ''}` : ''}{dep ? ` · départ ${heure(dep.horodatage)}` : ''} · congés restants {soldeConges(e, conges)} j
                </Text>
              </Pressable>
              {ouvert === e.id && (
                <View style={{ gap: 8, marginTop: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: DS.text }}>Fiches de paie</Text>
                  {fiches.map(f => (
                    <Pressable key={f.id} onPress={() => ouvrirDocumentMn(f)} accessibilityRole="link" style={{ backgroundColor: DS.background, borderRadius: radius.sm, padding: 8 }}>
                      <Text style={{ fontWeight: '700', color: DS.primary }}>{f.mois ? `${f.mois} · ` : ''}{f.nom}</Text>
                    </Pressable>
                  ))}
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                    <Champ label="Mois (ex. 09/2026)" value={mois} onChangeText={setMois} />
                    <View style={{ width: 140 }}><Bouton label="+ Fiche de paie" variante="contour" onPress={() => deposerFiche(e)} /></View>
                  </View>
                  <Bouton label="Nouveau mot de passe" variante="discret" onPress={async () => {
                    const mdp = generatePassword(10);
                    try { await changerMotDePasseCompteMn(e.id, mdp); setMessage(`Nouveau mot de passe de ${e.nom} : ${mdp}`); } catch (err) { setMessage((err as Error).message); }
                  }} />
                </View>
              )}
            </Carte>
          );
        })}

        {nouveau ? (
          <Carte>
            <Champ label="Nom de l'employé *" value={nouveau.nom} onChangeText={v => setNouveau(n => n && { ...n, nom: v })} />
            <Champ label="Identifiant" value={nouveau.identifiant} onChangeText={v => setNouveau(n => n && { ...n, identifiant: v })} autoCapitalize="none" />
            <Champ label="E-mail (facultatif)" value={nouveau.email} onChangeText={v => setNouveau(n => n && { ...n, email: v })} autoCapitalize="none" keyboardType="email-address" />
            <Champ label="Mot de passe" value={nouveau.mdp} onChangeText={v => setNouveau(n => n && { ...n, mdp: v })} autoCapitalize="none" />
            <Bouton label="Créer le compte employé" onPress={creer} />
            <Bouton label="Annuler" variante="discret" onPress={() => setNouveau(null)} />
          </Carte>
        ) : (
          <Bouton label="+ Nouvel employé" onPress={() => setNouveau({ nom: '', identifiant: '', email: '', mdp: generatePassword(10) })} />
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
