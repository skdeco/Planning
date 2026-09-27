/**
 * Carte d'accueil (admin) : transfère les chantiers « menuiserie » encore présents
 * dans l'espace Travaux vers l'espace Menuiserie, puis les retire de Travaux.
 */
import React, { useState } from 'react';
import { Text, Alert, Platform } from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { DS } from '@/constants/design';
import { useSessionMn } from '@/lib/menuiserie/SessionMn';
import { chantiersMenuiserieTravaux, dejaImportes, transfererChantier, type RapportTransfert } from '@/lib/menuiserie/transfert';
import { Bouton, Carte, Section } from './ui';

export function TransfertTravaux({ onFini }: { onFini: () => void }) {
  const { data, deleteChantier } = useApp();
  const { compte } = useSessionMn();
  const [etat, setEtat] = useState('');
  const [rapports, setRapports] = useState<RapportTransfert[]>([]);
  const [enCours, setEnCours] = useState(false);
  const aTransferer = chantiersMenuiserieTravaux(data);
  if (!compte || (aTransferer.length === 0 && rapports.length === 0)) return null;

  const lancer = async () => {
    setEnCours(true); setRapports([]);
    const faits = await dejaImportes().catch(() => new Set<string>());
    const res: RapportTransfert[] = [];
    for (const [i, c] of aTransferer.entries()) {
      setEtat(`Transfert ${i + 1}/${aTransferer.length} : ${c.nom}…`);
      try {
        if (!faits.has(c.id)) res.push(await transfererChantier(compte, data, c));
        else res.push({ chantier: c.nom, documents: 0, ignores: 0 });
        deleteChantier(c.id); // retiré de Travaux seulement une fois transféré
      } catch (e) {
        res.push({ chantier: c.nom, documents: 0, ignores: 0, erreur: (e as Error).message });
      }
      setRapports([...res]);
    }
    setEtat('Transfert terminé.');
    setEnCours(false);
    onFini();
  };

  const confirmer = () => {
    const texte = `${aTransferer.length} chantier(s) menuiserie vont être recopiés ici (infos, client, intervenants, montants, plans, photos, documents) puis retirés de l'espace Travaux.`;
    if (Platform.OS === 'web') { if (window.confirm(texte)) lancer(); return; }
    Alert.alert('Transférer les chantiers menuiserie ?', texte, [{ text: 'Annuler', style: 'cancel' }, { text: 'Transférer', onPress: lancer }]);
  };

  return (
    <Carte style={{ borderWidth: 2, borderColor: DS.warning }}>
      <Section>Chantiers menuiserie dans Travaux</Section>
      {aTransferer.length > 0 && (
        <>
          <Text style={{ fontSize: 14, color: DS.text }}>
            {aTransferer.length} chantier(s) à transférer : {aTransferer.map(c => c.nom).join(', ')}
          </Text>
          <Bouton label="Transférer dans l'espace Menuiserie" onPress={confirmer} charge={enCours} />
        </>
      )}
      {!!etat && <Text style={{ fontSize: 13, fontWeight: '700', color: DS.primary }}>{etat}</Text>}
      {rapports.map(r => (
        <Text key={r.chantier} style={{ fontSize: 13, color: r.erreur ? DS.error : DS.text }}>
          {r.chantier} : {r.erreur ? `échec (${r.erreur}) — resté dans Travaux` : `${r.documents} document(s) copiés${r.ignores ? `, ${r.ignores} non récupérable(s)` : ''}`}
        </Text>
      ))}
    </Carte>
  );
}
