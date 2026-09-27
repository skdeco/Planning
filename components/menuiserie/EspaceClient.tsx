/**
 * Espace client / architecte d'un chantier : rubriques de documents partagés,
 * date de livraison, règlements, messagerie. L'architecte (et l'apporteur) voit
 * aussi sa commission — jamais visible par le client.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { DS, radius } from '@/constants/design';
import { formatDateFR } from '@/lib/date/format';
import type { ChantierMn, CompteMn, DocumentMn, MontantMn } from '@/lib/menuiserie/types';
import { CATEGORIES_CLIENT, TYPE_MONTANT_MN_LABELS } from '@/lib/menuiserie/types';
import { ouvrirDocumentMn } from './DocumentsEtape';
import { Bouton, Carte, Section, euros } from './ui';

export function EspaceClient({ moi, chantier, documents, montants, onMessagerie }: {
  moi: CompteMn; chantier: ChantierMn; documents: DocumentMn[]; montants: MontantMn[]; onMessagerie: () => void;
}) {
  const reglements = montants.filter(m => m.visibilite === 'client');
  const commissions = montants.filter(m => m.visibilite === 'personnel');
  const totalRegle = reglements.filter(m => m.type === 'reglement_client').reduce((s, m) => s + Number(m.montant_ht), 0);
  const totalDevis = reglements.filter(m => m.type === 'vente_client').reduce((s, m) => s + Number(m.montant_ht), 0);

  return (
    <View style={{ gap: 10 }}>
      {moi.role !== 'apporteur' && (
        <>
          <Section>Mon projet</Section>
          <Carte style={{ gap: 0, padding: 0 }}>
            {CATEGORIES_CLIENT.map((cat, i) => {
              const docs = documents.filter(d => d.categorie_client === cat.cle);
              return (
                <View key={cat.cle} style={{ padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: DS.border, gap: 4 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: DS.text }}>{cat.label}</Text>
                  {docs.length === 0 && <Text style={{ fontSize: 13, color: DS.textMuted }}>Pas encore disponible</Text>}
                  {docs.map(d => (
                    <Pressable key={d.id} onPress={() => ouvrirDocumentMn(d)} accessibilityRole="link" style={{ minHeight: 32, justifyContent: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: DS.primary }} numberOfLines={1}>{d.nom}</Text>
                    </Pressable>
                  ))}
                </View>
              );
            })}
          </Carte>

          <Section>Règlements</Section>
          <Carte>
            {totalDevis > 0 && <Text style={{ fontSize: 14, color: DS.text }}>Montant du projet : <Text style={{ fontWeight: '800' }}>{euros(totalDevis)} HT</Text></Text>}
            {reglements.filter(m => m.type === 'reglement_client').map(m => (
              <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: DS.background, borderRadius: radius.sm, padding: 10 }}>
                <Text style={{ fontSize: 14, color: DS.text }}>{m.libelle || 'Règlement'} · {formatDateFR(m.date_montant)}</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: DS.text }}>{euros(Number(m.montant_ht))}</Text>
              </View>
            ))}
            <Text style={{ fontSize: 14, color: DS.text }}>Total réglé : <Text style={{ fontWeight: '800' }}>{euros(totalRegle)}</Text></Text>
          </Carte>
          <Bouton label="Messagerie · proposer un RDV" variante="contour" onPress={onMessagerie} />
        </>
      )}

      {(moi.role === 'architecte' || moi.role === 'apporteur') && (
        <>
          <Section>Ma commission</Section>
          <Carte style={{ backgroundColor: DS.sombre }}>
            {commissions.length === 0 && <Text style={{ fontSize: 14, color: '#D8D2CC' }}>Aucune commission renseignée.</Text>}
            {commissions.map(m => (
              <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, color: '#D8D2CC' }}>{m.libelle || TYPE_MONTANT_MN_LABELS[m.type]}</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: DS.textInverse }}>{euros(Number(m.montant_ht))}</Text>
              </View>
            ))}
          </Carte>
        </>
      )}
    </View>
  );
}
