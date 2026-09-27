/** Détail d'une étape d'un chantier : statut, informations, documents, montants. */
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DS, radius } from '@/constants/design';
import { DateInput } from '@/components/ui/DateInput';
import { formatDateHeureFR } from '@/lib/date/format';
import { majEtapeMn } from '@/lib/menuiserie/api';
import type { DefEtape } from '@/lib/menuiserie/etapes';
import type { CompteMn, DocumentMn, EtapeMn, MontantMn, StatutEtapeMn } from '@/lib/menuiserie/types';
import { Bouton, Champ, Section } from './ui';
import { DocumentsEtape } from './DocumentsEtape';
import { MontantsEtape } from './MontantsEtape';
import { BadgeRempliPar } from './BadgeRempliPar';

const STATUTS: { cle: StatutEtapeMn; label: string }[] = [
  { cle: 'a_faire', label: 'À faire' }, { cle: 'en_cours', label: 'En cours' }, { cle: 'fait', label: 'Fait' },
];

export function EtapeSheet({ moi, chantierId, usineId, def, etape, documents, montants, onClose, onChange }: {
  moi: CompteMn; chantierId: string; usineId: string | null; def: DefEtape | null; etape: EtapeMn | undefined;
  documents: DocumentMn[]; montants: MontantMn[]; onClose: () => void; onChange: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [infos, setInfos] = useState<Record<string, string>>({});
  const [charge, setCharge] = useState(false);
  useEffect(() => { setInfos(etape?.infos || {}); }, [etape, def?.cle]);
  if (!def) return null;

  const changerStatut = async (s: StatutEtapeMn) => {
    await majEtapeMn(moi, chantierId, def.cle, { statut: s }, `Statut : ${STATUTS.find(x => x.cle === s)?.label}`);
    onChange();
  };
  const enregistrerInfos = async () => {
    setCharge(true);
    await majEtapeMn(moi, chantierId, def.cle, { infos }, 'Informations mises à jour');
    setCharge(false); onChange();
  };
  const statut = etape?.statut || 'a_faire';

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: DS.background, paddingTop: insets.top > 20 ? 12 : insets.top + 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: DS.text, flex: 1 }}>{def.titre}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: DS.primary }}>Fermer</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 + insets.bottom, gap: 10 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <BadgeRempliPar def={def} />
          </View>
          {!!def.aide && <Text style={{ fontSize: 13, color: DS.textSecondary, lineHeight: 18 }}>{def.aide}</Text>}

          {def.aVenir ? (
            <Text style={{ fontSize: 15, color: DS.text, fontWeight: '600' }}>Cette étape arrive dans une prochaine mise à jour.</Text>
          ) : (
            <>
              <Section>Avancement</Section>
              <View style={{ flexDirection: 'row', backgroundColor: DS.segment, borderRadius: radius.md, padding: 3 }}>
                {STATUTS.map(s => (
                  <Pressable key={s.cle} onPress={() => changerStatut(s.cle)} accessibilityRole="button" accessibilityState={{ selected: statut === s.cle }}
                    style={{ flex: 1, minHeight: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: statut === s.cle ? DS.surface : 'transparent' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: statut === s.cle ? DS.primary : DS.textSecondary }}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
              {!!etape?.updated_by_nom && (
                <Text style={{ fontSize: 12, color: DS.textSecondary }}>Modifié par {etape.updated_by_nom} · {formatDateHeureFR(etape.updated_at)}</Text>
              )}

              {!!def.champs?.length && (
                <>
                  <Section>Informations</Section>
                  {def.champs.map(c => c.type === 'date' ? (
                    <View key={c.cle} style={{ gap: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>{c.label}</Text>
                      <DateInput value={infos[c.cle] || ''} onChangeDate={v => setInfos(p => ({ ...p, [c.cle]: v }))} accessibilityLabel={c.label}
                        style={{ borderWidth: 1, borderColor: DS.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: DS.text, backgroundColor: DS.surface }} />
                    </View>
                  ) : (
                    <Champ key={c.cle} label={c.label} value={infos[c.cle] || ''} onChangeText={v => setInfos(p => ({ ...p, [c.cle]: v }))} multiline={c.cle === 'liste'} style={{ backgroundColor: DS.surface }} />
                  ))}
                  <Bouton label="Enregistrer les informations" onPress={enregistrerInfos} charge={charge} />
                </>
              )}

              <Section>Documents et photos</Section>
              <DocumentsEtape moi={moi} chantierId={chantierId} def={def} documents={documents} onChange={onChange} />

              {def.montants.length > 0 && <Section>Montants</Section>}
              <MontantsEtape moi={moi} chantierId={chantierId} usineId={usineId} def={def} montants={montants} onChange={onChange} />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
