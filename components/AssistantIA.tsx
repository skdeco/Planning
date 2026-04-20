import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/app/context/AppContext';

interface AssistantIAProps {
  visible: boolean;
  onClose: () => void;
}

interface Suggestion {
  id: string;
  emoji: string;
  titre: string;
  description: string;
  bouton: string;
  route: string;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function AssistantIA({ visible, onClose }: AssistantIAProps) {
  const { data } = useApp();
  const router = useRouter();

  const suggestions = useMemo(() => {
    const result: Suggestion[] = [];
    const today = new Date();
    const todayStr = toYMD(today);

    // ── 1. Planning optimization ─────────────────────────────────────────

    // Demain
    const demain = new Date(today);
    demain.setDate(demain.getDate() + 1);
    const demainStr = toYMD(demain);
    const jourDemain = demain.getDay(); // 0=Dim, 6=Sam

    // Employés disponibles demain (pas en congé, pas en arrêt, jour ouvrable)
    if (jourDemain !== 0 && jourDemain !== 6) {
      const employeIdsAffectesDemain = new Set(
        data.affectations
          .filter(a => a.dateDebut <= demainStr && a.dateFin >= demainStr)
          .map(a => a.employeId)
      );

      const employeIdsEnConge = new Set(
        data.demandesConge
          .filter(d => d.statut === 'approuve' && d.dateDebut <= demainStr && d.dateFin >= demainStr)
          .map(d => d.employeId)
      );

      const employeIdsEnArret = new Set(
        data.arretsMaladie
          .filter(a => a.statut === 'approuve' && a.dateDebut <= demainStr && (!a.dateFin || a.dateFin >= demainStr))
          .map(a => a.employeId)
      );

      const employesDispo = data.employes.filter(
        e => !employeIdsAffectesDemain.has(e.id) && !employeIdsEnConge.has(e.id) && !employeIdsEnArret.has(e.id)
      );

      if (employesDispo.length > 0) {
        result.push({
          id: 'planning-dispo',
          emoji: '📋',
          titre: `${employesDispo.length} employé${employesDispo.length > 1 ? 's' : ''} disponible${employesDispo.length > 1 ? 's' : ''} demain`,
          description: `${employesDispo.map(e => e.prenom).join(', ')} ${employesDispo.length > 1 ? 'ne sont' : "n'est"} affecté${employesDispo.length > 1 ? 's' : ''} à aucun chantier demain`,
          bouton: 'Planifier',
          route: '/(tabs)/planning',
        });
      }
    }

    // Chantiers actifs sans personne lundi prochain
    const prochainLundi = new Date(today);
    const dayOfWeek = prochainLundi.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 7 : 8 - dayOfWeek;
    prochainLundi.setDate(prochainLundi.getDate() + daysUntilMonday);
    const lundiStr = toYMD(prochainLundi);

    const chantiersActifs = data.chantiers.filter(c => c.statut === 'actif');
    const chantiersSansPersonneLundi = chantiersActifs.filter(ch => {
      const affectes = data.affectations.filter(
        a => a.chantierId === ch.id && a.dateDebut <= lundiStr && a.dateFin >= lundiStr
      );
      return affectes.length === 0;
    });

    if (chantiersSansPersonneLundi.length > 0) {
      const noms = chantiersSansPersonneLundi.slice(0, 3).map(c => c.nom).join(', ');
      const extra = chantiersSansPersonneLundi.length > 3 ? ` (+${chantiersSansPersonneLundi.length - 3})` : '';
      result.push({
        id: 'planning-vide-lundi',
        emoji: '⚠️',
        titre: `${chantiersSansPersonneLundi.length} chantier${chantiersSansPersonneLundi.length > 1 ? 's' : ''} sans personne lundi`,
        description: `${noms}${extra} n'${chantiersSansPersonneLundi.length > 1 ? 'ont' : 'a'} aucun employé prévu lundi prochain`,
        bouton: 'Voir',
        route: '/(tabs)/planning',
      });
    }

    // ── 2. Financial alerts ──────────────────────────────────────────────

    // Paiements en retard ST (devis sans acompte versé récemment)
    const devisAvecRetard: { chantierId: string; montantDu: number }[] = [];
    for (const devis of (data.devis || [])) {
      const acomptes = (data.acomptesst || []).filter(a => a.devisId === devis.id);
      const totalVerse = acomptes.reduce((s, a) => s + a.montant, 0);
      const resteDu = devis.prixConvenu - totalVerse;
      if (resteDu > 0) {
        devisAvecRetard.push({ chantierId: devis.chantierId, montantDu: resteDu });
      }
    }

    if (devisAvecRetard.length > 0) {
      const totalRetard = devisAvecRetard.reduce((s, d) => s + d.montantDu, 0);
      const nbChantiers = new Set(devisAvecRetard.map(d => d.chantierId)).size;
      result.push({
        id: 'finance-retard',
        emoji: '💰',
        titre: `${totalRetard.toLocaleString('fr-FR')}€ de paiements en attente`,
        description: `Sur ${nbChantiers} chantier${nbChantiers > 1 ? 's' : ''} avec des devis sous-traitants non soldés`,
        bouton: 'Voir',
        route: '/(tabs)/chantiers',
      });
    }

    // Budget dépassé
    const budgets = data.budgetsChantier || {};
    for (const ch of chantiersActifs) {
      const budget = budgets[ch.id];
      if (!budget || budget <= 0) continue;
      const depenses = (data.depenses || data.depensesChantier || []).filter(d => d.chantierId === ch.id);
      const totalDepense = depenses.reduce((s, d) => s + (d.montantTTC || d.montant || 0), 0);
      if (totalDepense > budget) {
        const depassement = Math.round(((totalDepense - budget) / budget) * 100);
        result.push({
          id: `budget-depasse-${ch.id}`,
          emoji: '🚨',
          titre: `Budget dépassé sur ${ch.nom}`,
          description: `Dépassement de ${depassement}% (${totalDepense.toLocaleString('fr-FR')}€ / ${budget.toLocaleString('fr-FR')}€ prévus)`,
          bouton: 'Voir',
          route: '/(tabs)/chantiers',
        });
      }
    }

    // ── 3. HR reminders ──────────────────────────────────────────────────

    // Demandes en attente
    const congesEnAttente = data.demandesConge.filter(d => d.statut === 'en_attente').length;
    const arretsEnAttente = data.arretsMaladie.filter(d => d.statut === 'en_attente').length;
    const avancesEnAttente = data.demandesAvance.filter(d => d.statut === 'en_attente').length;
    const totalRHEnAttente = congesEnAttente + arretsEnAttente + avancesEnAttente;

    if (totalRHEnAttente > 0) {
      const details: string[] = [];
      if (congesEnAttente > 0) details.push(`${congesEnAttente} congé${congesEnAttente > 1 ? 's' : ''}`);
      if (arretsEnAttente > 0) details.push(`${arretsEnAttente} arrêt${arretsEnAttente > 1 ? 's' : ''}`);
      if (avancesEnAttente > 0) details.push(`${avancesEnAttente} avance${avancesEnAttente > 1 ? 's' : ''}`);
      result.push({
        id: 'rh-attente',
        emoji: '📝',
        titre: `${totalRHEnAttente} demande${totalRHEnAttente > 1 ? 's' : ''} en attente`,
        description: details.join(', ') + ' à valider',
        bouton: 'Traiter',
        route: '/(tabs)/rh',
      });
    }

    // Employés qui n'ont pas pointé depuis X jours
    const employesDoiventPointer = data.employes.filter(e => e.doitPointer !== false && e.role !== 'admin');
    for (const emp of employesDoiventPointer) {
      const pointagesEmp = data.pointages
        .filter(p => p.employeId === emp.id)
        .sort((a, b) => b.date.localeCompare(a.date));
      const dernierPointage = pointagesEmp[0];
      if (dernierPointage) {
        const dernierDate = new Date(dernierPointage.date);
        const diffJours = Math.floor((today.getTime() - dernierDate.getTime()) / (1000 * 60 * 60 * 24));
        // Alerte si 3+ jours ouvrables sans pointer (hors week-end)
        if (diffJours >= 5) {
          result.push({
            id: `pointage-absent-${emp.id}`,
            emoji: '⏰',
            titre: `${emp.prenom} ${emp.nom} n'a pas pointé`,
            description: `Dernier pointage il y a ${diffJours} jours`,
            bouton: 'Voir',
            route: '/(tabs)/pointage',
          });
        }
      }
    }

    // ── 4. Material ──────────────────────────────────────────────────────

    const listesAvecNonAchete = (data.listesMateriaux || []).filter(
      l => l.items.some(i => !i.achete)
    );
    if (listesAvecNonAchete.length > 0) {
      const totalArticles = listesAvecNonAchete.reduce(
        (s, l) => s + l.items.filter(i => !i.achete).length, 0
      );
      result.push({
        id: 'materiel-acheter',
        emoji: '🛒',
        titre: `${totalArticles} article${totalArticles > 1 ? 's' : ''} à acheter`,
        description: `Sur ${listesAvecNonAchete.length} liste${listesAvecNonAchete.length > 1 ? 's' : ''} matériel en attente`,
        bouton: 'Voir',
        route: '/(tabs)/materiel',
      });
    }

    // ── 5. Documents ─────────────────────────────────────────────────────

    const dans30jours = new Date(today);
    dans30jours.setDate(dans30jours.getDate() + 30);
    const dans30joursStr = toYMD(dans30jours);

    let docsExpirent = 0;
    for (const st of data.sousTraitants) {
      for (const doc of st.documents) {
        if (doc.expirationDate && doc.expirationDate <= dans30joursStr && doc.expirationDate >= todayStr) {
          docsExpirent++;
        }
      }
    }

    if (docsExpirent > 0) {
      result.push({
        id: 'docs-expiration',
        emoji: '📄',
        titre: `${docsExpirent} document${docsExpirent > 1 ? 's' : ''} bientôt expiré${docsExpirent > 1 ? 's' : ''}`,
        description: `Documents sous-traitants qui expirent dans les 30 prochains jours`,
        bouton: 'Voir',
        route: '/(tabs)/sous-traitants',
      });
    }

    return result;
  }, [data]);

  const handleAction = (route: string) => {
    onClose();
    setTimeout(() => {
      router.push(route as any);
    }, 300);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Poignée */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>🤖 Assistant SK DECO</Text>
              <Text style={styles.subtitle}>Voici ce que je recommande aujourd'hui :</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Suggestions */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {suggestions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>👍</Text>
                <Text style={styles.emptyText}>Tout est en ordre !</Text>
                <Text style={styles.emptySubtext}>Aucune action requise pour le moment</Text>
              </View>
            ) : (
              suggestions.map((s) => (
                <View key={s.id} style={styles.card}>
                  <Text style={styles.cardEmoji}>{s.emoji}</Text>
                  <View style={styles.cardContent}>
                    <Text style={styles.cardTitle}>{s.titre}</Text>
                    <Text style={styles.cardDesc}>{s.description}</Text>
                  </View>
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => handleAction(s.route)}
                  >
                    <Text style={styles.actionBtnText}>{s.bouton}</Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>

          {/* Footer */}
          {suggestions.length > 0 && (
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {suggestions.length} suggestion{suggestions.length > 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    height: SCREEN_HEIGHT * 0.8,
    backgroundColor: '#F5EDE3',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E8DDD0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8DDD0',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#2C2C2C',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: '#8C8077',
    marginTop: 4,
    fontWeight: '500',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8DDD0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#2C2C2C',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 20,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8DDD0',
    shadowColor: '#2C2C2C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2C2C2C',
    letterSpacing: -0.2,
  },
  cardDesc: {
    fontSize: 12,
    color: '#8C8077',
    marginTop: 3,
    lineHeight: 16,
  },
  actionBtn: {
    backgroundColor: '#C9A96E',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C2C2C',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8C8077',
    marginTop: 6,
  },
  footer: {
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E8DDD0',
    backgroundColor: '#F5EDE3',
  },
  footerText: {
    fontSize: 13,
    color: '#8C8077',
    fontWeight: '600',
  },
});
