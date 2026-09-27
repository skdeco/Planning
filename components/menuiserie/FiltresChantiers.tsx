/**
 * Filtres des chantiers Menuiserie : deux listes déroulantes.
 *  - État : En cours / Clôturé / SAV / Tous
 *  - Qui ? : sous-sections Usine, Architecte, Client, Apporteur, Responsable, avec leurs noms.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { DS, radius } from '@/constants/design';
import type { ChantierMn, IntervenantMn, RoleIntervenantMn, StatutChantierMn, UsineMn } from '@/lib/menuiserie/types';
import { ROLE_INTERVENANT_MN_LABELS, STATUT_CHANTIER_MN_LABELS } from '@/lib/menuiserie/types';

export interface FiltresMn {
  statut: StatutChantierMn | 'tous';
  usineId: string | null;
  intervenant: { role: RoleIntervenantMn; nom: string } | null;
}

export const FILTRES_MN_DEFAUT: FiltresMn = { statut: 'en_cours', usineId: null, intervenant: null };

export function filtrerChantiers(chantiers: ChantierMn[], intervenants: IntervenantMn[], f: FiltresMn): ChantierMn[] {
  return chantiers.filter(c =>
    (f.statut === 'tous' || c.statut === f.statut)
    && (!f.usineId || c.usine_id === f.usineId)
    && (!f.intervenant || intervenants.some(i => i.chantier_id === c.id && i.role === f.intervenant!.role && i.nom === f.intervenant!.nom)));
}

const ROLES_QUI: RoleIntervenantMn[] = ['architecte', 'client', 'apporteur', 'responsable'];
const ETATS: (StatutChantierMn | 'tous')[] = ['en_cours', 'cloture', 'sav', 'tous'];
const libEtat = (s: StatutChantierMn | 'tous') => (s === 'tous' ? 'Tous' : STATUT_CHANTIER_MN_LABELS[s]);

function Deroulant({ label, actif, onPress }: { label: string; actif: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={{ flex: 1, minHeight: 44, borderRadius: radius.md, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: actif ? DS.sombre : DS.surface, borderWidth: 1, borderColor: actif ? DS.sombre : DS.border }}>
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: actif ? DS.textInverse : DS.text }} numberOfLines={1}>{label}</Text>
      <Text style={{ fontSize: 12, color: actif ? DS.textInverse : DS.textSecondary }}>▾</Text>
    </Pressable>
  );
}

function Ligne({ label, actif, onPress }: { label: string; actif: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: actif }}
      style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: radius.sm, justifyContent: 'center', backgroundColor: actif ? DS.soft : 'transparent' }}>
      <Text style={{ fontSize: 15, fontWeight: actif ? '800' : '500', color: actif ? DS.primary : DS.text }}>{label}</Text>
    </Pressable>
  );
}

export function FiltresChantiers({ valeur, onChange, usines, intervenants }: {
  valeur: FiltresMn; onChange: (f: FiltresMn) => void; usines: UsineMn[]; intervenants: IntervenantMn[];
}) {
  const [ouvert, setOuvert] = useState<'etat' | 'qui' | null>(null);
  const sections = useMemo(() => [
    { titre: 'Usine', role: null as RoleIntervenantMn | null, items: usines.map(u => ({ cle: u.id, label: u.nom })) },
    ...ROLES_QUI.map(r => ({
      titre: ROLE_INTERVENANT_MN_LABELS[r], role: r as RoleIntervenantMn | null,
      items: Array.from(new Set(intervenants.filter(i => i.role === r).map(i => i.nom))).sort().map(n => ({ cle: n, label: n })),
    })),
  ], [usines, intervenants]);

  const usineNom = usines.find(u => u.id === valeur.usineId)?.nom;
  const labelQui = usineNom ? `Usine : ${usineNom}`
    : valeur.intervenant ? `${ROLE_INTERVENANT_MN_LABELS[valeur.intervenant.role]} : ${valeur.intervenant.nom}` : 'Qui ?';
  const fermer = () => setOuvert(null);

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Deroulant label={`État : ${libEtat(valeur.statut)}`} actif={valeur.statut !== 'en_cours'} onPress={() => setOuvert('etat')} />
      <Deroulant label={labelQui} actif={!!usineNom || !!valeur.intervenant} onPress={() => setOuvert('qui')} />

      <Modal visible={!!ouvert} transparent animationType="fade" onRequestClose={fermer}>
        <Pressable onPress={fermer} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: DS.surface, borderRadius: radius.xxl, padding: 12, maxHeight: 520 }}>
            {ouvert === 'etat' ? (
              <>
                <Text style={{ fontSize: 17, fontWeight: '800', color: DS.text, padding: 8 }}>État</Text>
                {ETATS.map(s => <Ligne key={s} label={libEtat(s)} actif={valeur.statut === s} onPress={() => { onChange({ ...valeur, statut: s }); fermer(); }} />)}
              </>
            ) : (
              <>
                <Text style={{ fontSize: 17, fontWeight: '800', color: DS.text, padding: 8 }}>Qui ?</Text>
                <ScrollView>
                  <Ligne label="Tout le monde" actif={!usineNom && !valeur.intervenant} onPress={() => { onChange({ ...valeur, usineId: null, intervenant: null }); fermer(); }} />
                  {sections.map(sec => (
                    <View key={sec.titre} style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.textSecondary, paddingHorizontal: 12, paddingVertical: 4 }}>{sec.titre}</Text>
                      {sec.items.length === 0 && <Text style={{ fontSize: 13, color: DS.textMuted, paddingHorizontal: 12, paddingVertical: 4 }}>Aucun</Text>}
                      {sec.items.map(it => {
                        const actif = sec.role ? valeur.intervenant?.role === sec.role && valeur.intervenant.nom === it.cle : valeur.usineId === it.cle;
                        return (
                          <Ligne key={it.cle} label={it.label} actif={actif} onPress={() => {
                            onChange(sec.role ? { ...valeur, usineId: null, intervenant: { role: sec.role, nom: it.cle } } : { ...valeur, intervenant: null, usineId: it.cle });
                            fermer();
                          }} />
                        );
                      })}
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
