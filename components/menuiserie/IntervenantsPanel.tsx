/**
 * Intervenants d'un chantier (admin) : client, architecte, apporteur, responsable, poseur.
 * Lier un intervenant à un compte Menuiserie lui ouvre l'accès à CE chantier.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { DS, radius } from '@/constants/design';
import { listerComptesMn } from '@/lib/menuiserie/api';
import { lireCacheMn, ecrireCacheMn } from '@/lib/menuiserie/cache';
import { ajouterIntervenantMn, lierCompteIntervenantMn, retirerIntervenantMn } from '@/lib/menuiserie/api2';
import type { CompteMn, IntervenantMn, RoleCompteMn, RoleIntervenantMn } from '@/lib/menuiserie/types';
import { ROLE_INTERVENANT_MN_LABELS } from '@/lib/menuiserie/types';
import { Bouton, Champ, Pastille, Puce } from './ui';

import { tm } from '@/lib/menuiserie/i18n';
const ROLES: RoleIntervenantMn[] = ['client', 'architecte', 'apporteur', 'responsable', 'poseur'];
const COMPTE_POUR: Record<RoleIntervenantMn, RoleCompteMn> = {
  client: 'client', architecte: 'architecte', apporteur: 'apporteur', responsable: 'admin', poseur: 'poseur',
};

export function IntervenantsPanel({ moi, chantierId, intervenants, onChange }: {
  moi: CompteMn; chantierId: string; intervenants: IntervenantMn[]; onChange: () => void;
}) {
  const [comptes, setComptes] = useState<CompteMn[]>(() => lireCacheMn<CompteMn[]>('comptes') || []);
  const [role, setRole] = useState<RoleIntervenantMn>('poseur');
  const [nom, setNom] = useState('');
  const [aLier, setALier] = useState<IntervenantMn | null>(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => { listerComptesMn().then(c => { ecrireCacheMn('comptes', c); setComptes(c); }).catch(() => {}); }, []);

  const agir = async (f: () => Promise<void>) => { try { setErreur(''); await f(); onChange(); } catch (e) { setErreur((e as Error).message); } };
  const candidats = aLier ? comptes.filter(c => c.actif && c.role === COMPTE_POUR[aLier.role]) : [];

  return (
    <View style={{ gap: 8 }}>
      {intervenants.map(i => {
        const compte = comptes.find(c => c.id === i.compte_id);
        return (
          <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: DS.background, borderRadius: radius.sm, padding: 10 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: DS.text }}>{ROLE_INTERVENANT_MN_LABELS[i.role]} · {i.nom}</Text>
              {compte ? <Pastille label={tm("Accès : {0}", compte.email || compte.identifiant)} fond="#E7F0EA" texte="#1F4D36" />
                : <Text style={{ fontSize: 12, color: DS.textSecondary }}>{tm("Pas d'accès à l'app")}</Text>}
            </View>
            <Pressable onPress={() => setALier(i)} accessibilityRole="button" style={{ padding: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: DS.primary }}>{compte ? tm("Changer") : tm("Donner accès")}</Text>
            </Pressable>
            <Pressable onPress={() => agir(() => retirerIntervenantMn(moi, i))} accessibilityRole="button" accessibilityLabel={tm("Retirer {0}", i.nom)} style={{ padding: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: DS.error }}>{tm("Retirer")}</Text>
            </Pressable>
          </View>
        );
      })}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {ROLES.map(r => <Puce key={r} label={ROLE_INTERVENANT_MN_LABELS[r]} actif={role === r} onPress={() => setRole(r)} />)}
      </View>
      <Champ label={tm("Nom ({0})", ROLE_INTERVENANT_MN_LABELS[role])} value={nom} onChangeText={setNom} />
      <Bouton label={tm("Ajouter l'intervenant")} variante="contour" onPress={() => nom.trim() && agir(async () => { await ajouterIntervenantMn(moi, chantierId, role, nom, null); setNom(''); })} />
      {!!erreur && <Text style={{ color: DS.error, fontWeight: '600', fontSize: 13 }}>{erreur}</Text>}

      <Modal visible={!!aLier} transparent animationType="fade" onRequestClose={() => setALier(null)}>
        <Pressable onPress={() => setALier(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: DS.surface, borderRadius: radius.xxl, padding: 16, gap: 8, maxHeight: 460 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: DS.text }}>{tm("Accès pour")}{' '}{aLier?.nom}</Text>
            <Text style={{ fontSize: 13, color: DS.textSecondary }}>{tm("Choisis son compte (créé dans Menuiserie → Comptes, rôle")}{' '}{aLier ? ROLE_INTERVENANT_MN_LABELS[aLier.role] : ''}).</Text>
            <ScrollView>
              {candidats.length === 0 && <Text style={{ padding: 8, color: DS.textSecondary }}>{tm("Aucun compte de ce rôle : crée-le d'abord dans Comptes.")}</Text>}
              {candidats.map(c => (
                <Pressable key={c.id} style={{ padding: 12 }} accessibilityRole="button"
                  onPress={() => { const it = aLier; setALier(null); if (it) agir(() => lierCompteIntervenantMn(moi, it, c.id)); }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: DS.text }}>{c.nom}</Text>
                  <Text style={{ fontSize: 12, color: DS.textSecondary }}>{c.email || c.identifiant}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {!!aLier?.compte_id && <Bouton label={tm("Retirer l'accès")} variante="discret" onPress={() => { const it = aLier; setALier(null); agir(() => lierCompteIntervenantMn(moi, it, null)); }} />}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
