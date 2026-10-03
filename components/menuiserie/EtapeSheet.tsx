/** Détail d'une étape d'un chantier : statut, informations, documents, montants. */
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DS, radius } from '@/constants/design';
import { DateInput } from '@/components/ui/DateInput';
import { formatDateHeureFR } from '@/lib/date/format';
import { majEtapeMn } from '@/lib/menuiserie/api';
import { etapeModifiablePour, voitMontantsUsine, TYPES_MONTANT_USINE, type DefEtape } from '@/lib/menuiserie/etapes';
import type { ChantierMn, CompteMn, DocumentMn, EtapeMn, MontantMn, StatutEtapeMn } from '@/lib/menuiserie/types';
import { VerificationMeubles } from './VerificationMeubles';
import { ReservesPanel } from './ReservesPanel';
import { Bouton, Champ, Section } from './ui';
import { DocumentsEtape } from './DocumentsEtape';
import { MontantsEtape } from './MontantsEtape';
import { BadgeRempliPar } from './BadgeRempliPar';

import { tm, traduit } from '@/lib/menuiserie/i18n';
const STATUTS: { cle: StatutEtapeMn; label: string }[] = traduit([
  { cle: 'a_faire', label: 'À faire' }, { cle: 'en_cours', label: 'En cours' }, { cle: 'fait', label: 'Fait' },
]);

export function EtapeSheet({ moi, chantierId, usineId, def, etape, documents, montants, onClose, onChange, poseur, chantier, dateReception }: {
  moi: CompteMn; chantierId: string; usineId: string | null; def: DefEtape | null; etape: EtapeMn | undefined;
  documents: DocumentMn[]; montants: MontantMn[]; onClose: () => void; onChange: () => void;
  /** Compte du poseur rattaché (prix de pose visible par lui) */
  poseur?: { id: string; nom: string } | null;
  chantier?: ChantierMn;
  /** Date de réception de la livraison : sert à proposer le début de pose */
  dateReception?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const [infos, setInfos] = useState<Record<string, string>>({});
  const [charge, setCharge] = useState(false);
  useEffect(() => {
    const base = { ...(etape?.infos || {}) };
    // Pose : dès que la réception de la livraison est datée, on propose le jour ouvré suivant
    if (def?.cle === 'pose' && !base.date_debut && dateReception) {
      const d = new Date(`${dateReception}T12:00:00`);
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
      base.date_debut = d.toISOString().slice(0, 10);
    }
    if (def?.cle === 'pose' && !base.poseur && poseur) base.poseur = poseur.nom;
    setInfos(base);
  }, [etape, def?.cle, dateReception, poseur]);
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
  const modifiable = etapeModifiablePour(moi, def.cle);
  const typesMontants = moi.role === 'admin' ? def.montants : moi.role === 'usine' ? def.montants.filter(t => TYPES_MONTANT_USINE.includes(t)) : [];
  // Employé d'usine : seulement si l'admin le lui a ouvert (réglage du compte)
  const voitMontants = moi.role !== 'employe_usine' || voitMontantsUsine(moi);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: DS.background, paddingTop: insets.top > 20 ? 12 : insets.top + 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: DS.text, flex: 1 }}>{def.titre}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: DS.primary }}>{tm("Fermer")}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 + insets.bottom, gap: 10 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <BadgeRempliPar def={def} />
          </View>
          {!!def.aide && <Text style={{ fontSize: 13, color: DS.textSecondary, lineHeight: 18 }}>{def.aide}</Text>}

          {def.aVenir ? (
            <Text style={{ fontSize: 15, color: DS.text, fontWeight: '600' }}>{tm("Cette étape arrive dans une prochaine mise à jour.")}</Text>
          ) : (
            <>
              <Section>{tm("Avancement")}</Section>
              <View style={{ flexDirection: 'row', backgroundColor: DS.segment, borderRadius: radius.md, padding: 3 }}>
                {STATUTS.map(s => (
                  <Pressable key={s.cle} disabled={!modifiable} onPress={() => changerStatut(s.cle)} accessibilityRole="button" accessibilityState={{ selected: statut === s.cle }}
                    style={{ flex: 1, minHeight: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: statut === s.cle ? DS.surface : 'transparent' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: statut === s.cle ? DS.primary : DS.textSecondary }}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
              {!!etape?.updated_by_nom && (
                <Text style={{ fontSize: 12, color: DS.textSecondary }}>{tm("Modifié par")}{' '}{etape.updated_by_nom} · {formatDateHeureFR(etape.updated_at)}</Text>
              )}

              {!!def.champs?.length && (
                <>
                  <Section>{tm("Informations")}</Section>
                  {def.champs.map(c => c.type === 'date' ? (
                    <View key={c.cle} style={{ gap: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>{c.label}</Text>
                      <DateInput value={infos[c.cle] || ''} onChangeDate={v => setInfos(p => ({ ...p, [c.cle]: v }))} accessibilityLabel={c.label}
                        style={{ borderWidth: 1, borderColor: DS.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: DS.text, backgroundColor: DS.surface }} />
                    </View>
                  ) : (
                    <Champ key={c.cle} label={c.label} value={infos[c.cle] || ''} editable={modifiable} onChangeText={v => setInfos(p => ({ ...p, [c.cle]: v }))} multiline={c.cle === 'liste'} style={{ backgroundColor: DS.surface }} />
                  ))}
                  {modifiable && <Bouton label={tm("Enregistrer les informations")} onPress={enregistrerInfos} charge={charge} />}
                </>
              )}

              {def.cle === 'verification' && (
                <>
                  <Section>{tm("Meubles")}</Section>
                  <VerificationMeubles moi={moi} chantierId={chantierId} modifiable={modifiable} />
                </>
              )}
              {def.cle === 'pv' && (
                <>
                  <Section>{tm("Réserves")}</Section>
                  <ReservesPanel moi={moi} chantierId={chantierId} chantier={chantier} onDocument={onChange} />
                </>
              )}

              <Section>{tm("Documents et photos")}</Section>
              <DocumentsEtape moi={moi} chantierId={chantierId} def={def} documents={documents} onChange={onChange} lectureSeule={!modifiable} />

              {voitMontants && (typesMontants.length > 0 || montants.length > 0) && <Section>{tm("Montants")}</Section>}
              {voitMontants && (
                <MontantsEtape moi={moi} chantierId={chantierId} usineId={usineId} etape={def.cle} types={typesMontants}
                  montants={montants} onChange={onChange} compteCible={def.cle === 'pose' ? poseur : null} lectureSeule={!typesMontants.length} />
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
