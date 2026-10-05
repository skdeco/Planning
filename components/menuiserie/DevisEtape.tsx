/**
 * Étape « Devis » en deux onglets, sans doublon :
 *  - Client : le devis SK DECO et le prix de vente (administrateurs seulement) ;
 *  - Usine  : le devis de l'usine et le prix d'achat.
 * Chaque onglet montre son montant en grand, ses documents et ses lignes.
 * Le montant HT d'un PDF est lu tout seul à l'envoi (et relisible à la main).
 */
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { DS } from '@/constants/design';
import type { CompteMn, DocumentMn, MontantMn } from '@/lib/menuiserie/types';
import type { DefEtape } from '@/lib/menuiserie/etapes';
import { coteDevis } from '@/lib/menuiserie/importDevis';
import { supprimerMontantMn } from '@/lib/menuiserie/api';
import { DocumentsEtape } from './DocumentsEtape';
import { MontantsEtape } from './MontantsEtape';
import { Bloc, euros } from './ui';
import { tm } from '@/lib/menuiserie/i18n';

type Cote = 'client' | 'usine';

export function DevisEtape({ moi, chantierId, usineId, def, documents, montants, onChange, modifiable }: {
  moi: CompteMn; chantierId: string; usineId: string | null; def: DefEtape;
  documents: DocumentMn[]; montants: MontantMn[]; onChange: () => void; modifiable: boolean;
}) {
  const admin = moi.role === 'admin';
  const [onglet, setOnglet] = useState<Cote>(admin ? 'client' : 'usine');
  const cote: Cote = admin ? onglet : 'usine';
  const type = cote === 'client' ? 'vente_client' : 'achat_usine';
  const docs = documents.filter(d => coteDevis(d, montants) === cote);
  const lignes = montants.filter(m => m.type === type);
  const total = lignes.reduce((x, m) => x + Number(m.montant_ht), 0);
  const achat = montants.filter(m => m.type === 'achat_usine').reduce((x, m) => x + Number(m.montant_ht), 0);
  const vente = montants.filter(m => m.type === 'vente_client').reduce((x, m) => x + Number(m.montant_ht), 0);
  const peutSaisir = admin || (moi.role === 'usine' && cote === 'usine');

  return (
    <>
      {admin && (
        <View style={{ flexDirection: 'row', backgroundColor: DS.segment, borderRadius: 999, padding: 4 }}>
          {(['client', 'usine'] as const).map(o => {
            const on = onglet === o;
            return (
              <Pressable key={o} onPress={() => setOnglet(o)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={{ flex: 1, minHeight: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? DS.primary : 'transparent' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: on ? DS.textInverse : DS.textSecondary }}>{o === 'client' ? tm("Client") : tm("Usine")}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Le montant de l'onglet, en grand (et la marge quand les deux sont connus) */}
      <View style={{ backgroundColor: cote === 'client' ? DS.primary : DS.surface, borderRadius: 20, borderWidth: cote === 'client' ? 0 : 1, borderColor: DS.border, padding: 18, gap: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: cote === 'client' ? 'rgba(255,255,255,0.7)' : DS.textSecondary }}>
          {cote === 'client' ? tm("Vente client") : tm("Achat usine")} · {tm("HT")}
        </Text>
        <Text style={{ fontSize: 32, fontFamily: 'Manrope_700Bold', color: cote === 'client' ? DS.textInverse : DS.text }}>{total ? euros(total) : '—'}</Text>
        {lignes.length === 1 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ flex: 1, fontSize: 12, color: cote === 'client' ? 'rgba(255,255,255,0.7)' : DS.textSecondary }} numberOfLines={1}>
              {lignes[0].libelle || tm("Saisi à la main")}
            </Text>
            {peutSaisir && (
              <Pressable onPress={async () => { await supprimerMontantMn(moi, lignes[0]); onChange(); }} hitSlop={8} accessibilityRole="button">
                <Text style={{ fontSize: 12, fontWeight: '700', color: cote === 'client' ? '#FFFFFF' : DS.error, textDecorationLine: 'underline' }}>{tm("Retirer")}</Text>
              </Pressable>
            )}
          </View>
        )}
        {admin && achat > 0 && vente > 0 && (
          <Text style={{ fontSize: 13, color: cote === 'client' ? 'rgba(255,255,255,0.8)' : DS.textSecondary }}>
            {tm("Marge")} {euros(vente - achat)} · {Math.round(((vente - achat) / vente) * 100)} %
          </Text>
        )}
      </View>

      <DocumentsEtape key={cote} moi={moi} chantierId={chantierId} def={def} documents={docs} onChange={onChange} lectureSeule={!modifiable}
        titre={cote === 'client' ? tm("Devis SK DECO") : tm("Devis de l'usine")}
        importDevis={{ usineId, montants, type, cote }} />

      {/* Plusieurs lignes : détail ; sinon simple bouton pour en ajouter une à la main */}
      {lignes.length > 1 ? (
        <Bloc titre={tm("Détail du montant")}>
          <MontantsEtape key={type} moi={moi} chantierId={chantierId} usineId={usineId} etape={def.cle} types={peutSaisir ? [type] : []}
            montants={lignes} onChange={onChange} lectureSeule={!peutSaisir} />
        </Bloc>
      ) : peutSaisir ? (
        <MontantsEtape key={type} moi={moi} chantierId={chantierId} usineId={usineId} etape={def.cle} types={[type]}
          montants={[]} onChange={onChange} />
      ) : null}
    </>
  );
}
