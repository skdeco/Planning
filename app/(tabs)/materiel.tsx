import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal,
  Platform, Animated, LayoutAnimation, UIManager,
} from 'react-native';
import { useConfirm } from '@/hooks/useConfirm';

// Activer LayoutAnimation sur Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { ScreenContainer } from '@/components/screen-container';
import type { ListeMateriau, MateriauItem } from '@/app/types';
import { router } from 'expo-router';
import { apiCall } from '@/lib/_core/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function genId() { return `mat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function sendNotificationEmail(
  acheteurs: { prenom: string; nom: string }[],
  employeNom: string,
  chantierNom: string,
  articles: string[]
) {
  if (acheteurs.length === 0) return;
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification('🛒 Nouvelle liste matériel', {
        body: `${employeNom} a ajouté ${articles.length} article(s) pour ${chantierNom}`,
        icon: '/favicon.ico',
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
          new Notification('🛒 Nouvelle liste matériel', {
            body: `${employeNom} a ajouté ${articles.length} article(s) pour ${chantierNom}`,
          });
        }
      });
    }
  }
  apiCall('/api/notify-materiel', {
    method: 'POST',
    body: JSON.stringify({
      acheteurs: acheteurs.map(a => `${a.prenom} ${a.nom}`),
      employeNom,
      chantierNom,
      articles,
    }),
  }).catch(err => console.warn('[Materiel] Erreur notification email:', err));
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function MaterielScreen() {
  const {
    data, currentUser, isHydrated,
    upsertListeMateriau, deleteListeMateriau,
    toggleMateriau, addMateriauItem, deleteMateriauItem,
  } = useApp();
  const { t } = useLanguage();

  useEffect(() => {
    if (isHydrated && !currentUser) router.replace('/login');
  }, [isHydrated, currentUser]);

  const isAdmin = currentUser?.role === 'admin';
  const isEmploye = currentUser?.role === 'employe';
  const currentEmploye = isEmploye
    ? data.employes.find(e => e.id === currentUser?.employeId)
    : null;
  const isAcheteur = isAdmin || (currentEmploye?.isAcheteur === true);

  // Mode vue
  const [viewMode, setViewMode] = useState<'mes_listes' | 'acheteur'>(
    isAcheteur && !isEmploye ? 'acheteur' : 'mes_listes'
  );
  const [searchQuery, setSearchQuery] = useState('');

  // ── État d'ouverture des sections archivées (par listeId) ──
  const [openArchives, setOpenArchives] = useState<Record<string, boolean>>({});
  const toggleArchive = useCallback((listeId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenArchives(prev => ({ ...prev, [listeId]: !prev[listeId] }));
  }, []);

  // ── État pour l'ajout d'article ──
  const { confirm, ConfirmModal } = useConfirm();

  const [addModal, setAddModal] = useState<{
    listeId: string | null;
    chantierId: string;
    chantierNom: string;
  } | null>(null);
  const [newArticle, setNewArticle] = useState('');
  const [newQuantite, setNewQuantite] = useState('');
  const [newCommentaire, setNewCommentaire] = useState('');
  const inputRef = useRef<TextInput>(null);

  // ── Chantiers visibles selon le rôle ──
  const chantiersVisibles = isAdmin
    ? data.chantiers.filter(c => c.statut !== 'termine')
    : data.chantiers.filter(c =>
        c.statut !== 'termine' &&
        data.affectations.some(a =>
          a.chantierId === c.id && a.employeId === currentUser?.employeId
        )
      );

  // ── Helper recherche matériel ──
  const matchSearch = useCallback((liste: ListeMateriau) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const chantier = data.chantiers.find(c => c.id === liste.chantierId);
    if (chantier?.nom.toLowerCase().includes(q)) return true;
    return liste.items.some(i => i.texte.toLowerCase().includes(q));
  }, [searchQuery, data.chantiers]);

  // ── Listes de l'employé connecté ──
  const mesListes = isEmploye
    ? (data.listesMateriaux || []).filter(l => l.employeId === currentUser?.employeId && matchSearch(l))
    : (data.listesMateriaux || []).filter(matchSearch);

  // ── Toutes les listes pour la vue acheteur ──
  const toutesListes = (data.listesMateriaux || []).filter(matchSearch);

  // ── Grouper par chantier pour la vue acheteur ──
  const listesParChantier = chantiersVisibles.map(c => ({
    chantier: c,
    listes: toutesListes.filter(l => l.chantierId === c.id),
  })).filter(g => g.listes.length > 0);

  // ── Compter les articles non achetés (badge) ──
  const nbNonAchetes = toutesListes.reduce((acc, l) =>
    acc + l.items.filter(i => !i.achete).length, 0);

  // ── Ouvrir le modal d'ajout pour un chantier ──
  const openAddModal = (chantierId: string, chantierNom: string) => {
    const existingListe = mesListes.find(
      l => l.chantierId === chantierId && l.employeId === currentUser?.employeId
    );
    setAddModal({
      listeId: existingListe?.id || null,
      chantierId,
      chantierNom,
    });
    setNewArticle('');
    setNewQuantite('');
    setNewCommentaire('');
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  // ── Ajouter un article ──
  const handleAddArticle = () => {
    if (!newArticle.trim() || !addModal) return;
    const now = new Date().toISOString();
    const item: MateriauItem = {
      id: genId(),
      texte: newArticle.trim(),
      quantite: newQuantite.trim() || undefined,
      commentaire: newCommentaire.trim() || undefined,
      achete: false,
      createdAt: now,
    };

    if (addModal.listeId) {
      addMateriauItem(addModal.listeId, item);
    } else {
      const employeId = currentUser?.employeId || 'admin';
      const newListe: ListeMateriau = {
        id: genId(),
        chantierId: addModal.chantierId,
        employeId,
        items: [item],
        createdAt: now,
        updatedAt: now,
      };
      upsertListeMateriau(newListe);
      setAddModal(prev => prev ? { ...prev, listeId: newListe.id } : prev);
    }

    const acheteurs = data.employes.filter(e => e.isAcheteur && e.id !== currentUser?.employeId);
    const employeNom = currentEmploye
      ? `${currentEmploye.prenom} ${currentEmploye.nom}`
      : 'Admin';
    sendNotificationEmail(acheteurs, employeNom, addModal.chantierNom, [item.texte]);

    setNewArticle('');
    setNewQuantite('');
    setNewCommentaire('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // ── Cocher/décocher un article (acheteur) ──
  const handleToggle = (listeId: string, itemId: string) => {
    const acheteurNom = isAdmin
      ? 'Admin'
      : currentEmploye ? `${currentEmploye.prenom} ${currentEmploye.nom}` : 'Acheteur';
    toggleMateriau(listeId, itemId, acheteurNom);
  };

  // ── Supprimer un article (admin, acheteur, ou créateur de la liste) ──
  const handleDeleteItem = async (listeId: string, itemId: string) => {
    const listeActuelle = data.listesMateriaux?.find(l => l.id === listeId);
    if (!listeActuelle) return;
    const canDelete = isAdmin || isAcheteur || listeActuelle.employeId === currentUser?.employeId;
    if (!canDelete) return;
    if (await confirm(t.materiel.deleteItem)) {
      deleteMateriauItem(listeId, itemId);
    }
  };

  // ── Supprimer une liste entière (admin uniquement) ──
  const handleDeleteListe = async (listeId: string) => {
    if (await confirm(t.materiel.deleteList)) {
      deleteListeMateriau(listeId);
    }
  };

  // ── Rendu d'une liste d'articles ──
  const renderListe = (liste: ListeMateriau, showEmploye = false) => {
    const employe = data.employes.find(e => e.id === liste.employeId);
    const itemsActifs = liste.items.filter(i => !i.achete);
    const itemsAchetes = liste.items.filter(i => i.achete);
    const canEdit = isAdmin || isAcheteur || liste.employeId === currentUser?.employeId;

    return (
      <View key={liste.id} style={styles.listeCard}>
        {/* Header avec nom employé + bouton supprimer liste (admin) */}
        <View style={styles.listeCardHeader}>
          {showEmploye && employe ? (
            <View style={styles.employeHeader}>
              <View style={[styles.employeAvatar, { backgroundColor: employe.couleur || '#1A3A6B' }]}>
                <Text style={styles.employeAvatarText}>
                  {employe.prenom[0]}{employe.nom[0]}
                </Text>
              </View>
              <Text style={styles.employeNom}>{employe.prenom} {employe.nom}</Text>
            </View>
          ) : <View />}
          {isAdmin && (
            <Pressable onPress={() => handleDeleteListe(liste.id)} style={styles.deleteListeBtn}>
              <Text style={styles.deleteListeBtnText}>🗑 {t.materiel.deleteListBtn}</Text>
            </Pressable>
          )}
        </View>

        {/* Articles actifs */}
        {itemsActifs.length === 0 && itemsAchetes.length === 0 && (
          <Text style={styles.emptyText}>{t.materiel.noItems}</Text>
        )}
        {itemsActifs.map(item => (
          <View key={item.id} style={styles.itemRow}>
            <Pressable
              style={[styles.checkbox, isAcheteur && styles.checkboxAcheteur]}
              onPress={() => isAcheteur ? handleToggle(liste.id, item.id) : undefined}
            >
              <Text style={styles.checkboxInner}> </Text>
            </Pressable>
            <View style={styles.itemContent}>
              <Text style={styles.itemTexte}>{item.texte}</Text>
              {item.quantite ? (
                <Text style={styles.itemQuantite}>{item.quantite}</Text>
              ) : null}
              {item.commentaire ? (
                <Text style={styles.itemCommentaire}>💬 {item.commentaire}</Text>
              ) : null}
            </View>
            {canEdit && (
              <Pressable onPress={() => handleDeleteItem(liste.id, item.id)} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>✕</Text>
              </Pressable>
            )}
          </View>
        ))}

        {/* Articles achetés — section repliable */}
        {itemsAchetes.length > 0 && (
          <View style={styles.archiveSection}>
            {/* Bouton toggle */}
            <Pressable
              style={styles.archiveToggleBtn}
              onPress={() => toggleArchive(liste.id)}
            >
              <View style={styles.archiveToggleLeft}>
                <Text style={styles.archiveToggleIcon}>
                  {openArchives[liste.id] ? '▾' : '▸'}
                </Text>
                <Text style={styles.archiveToggleText}>
                  {t.materiel.archived} ({itemsAchetes.length})
                </Text>
              </View>
              <View style={styles.archiveBadge}>
                <Text style={styles.archiveBadgeText}>✅ {itemsAchetes.length}</Text>
              </View>
            </Pressable>

            {/* Contenu déplié */}
            {openArchives[liste.id] && (
              <View style={styles.archiveContent}>
                {itemsAchetes.map(item => (
                  <View key={item.id} style={[styles.itemRow, styles.itemAchete]}>
                    <Pressable
                      style={[styles.checkbox, styles.checkboxChecked, isAcheteur && styles.checkboxAcheteur]}
                      onPress={() => isAcheteur ? handleToggle(liste.id, item.id) : undefined}
                    >
                      <Text style={styles.checkboxCheckedInner}>✓</Text>
                    </Pressable>
                    <View style={styles.itemContent}>
                      <Text style={[styles.itemTexte, styles.itemTexteBarre]}>{item.texte}</Text>
                      {item.quantite ? (
                        <Text style={[styles.itemQuantite, styles.itemTexteBarre]}>{item.quantite}</Text>
                      ) : null}
                      {item.commentaire ? (
                        <Text style={[styles.itemCommentaire, styles.itemTexteBarre]}>💬 {item.commentaire}</Text>
                      ) : null}
                      {item.achetePar && (
                        <Text style={styles.achetePar}>✓ {t.materiel.boughtBy} {item.achetePar}</Text>
                      )}
                    </View>
                    {canEdit && (
                      <Pressable onPress={() => handleDeleteItem(liste.id, item.id)} style={styles.deleteBtn}>
                        <Text style={styles.deleteBtnText}>✕</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Bouton ajouter un article */}
        {(isAdmin || liste.employeId === currentUser?.employeId) && (
          <Pressable
            style={styles.addItemBtn}
            onPress={() => {
              const chantier = data.chantiers.find(c => c.id === liste.chantierId);
              openAddModal(liste.chantierId, chantier?.nom || '');
            }}
          >
            <Text style={styles.addItemBtnText}>+ {t.materiel.addItem}</Text>
          </Pressable>
        )}
      </View>
    );
  };

  // ── Vue employé : mes listes par chantier ──
  const renderMesListes = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      {chantiersVisibles.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{t.materiel.noActiveProject}</Text>
        </View>
      )}
      {chantiersVisibles.map(chantier => {
        const liste = mesListes.find(
          l => l.chantierId === chantier.id &&
          (isAdmin || l.employeId === currentUser?.employeId)
        );
        return (
          <View key={chantier.id} style={styles.chantierSection}>
            <View style={[styles.chantierHeader, { borderLeftColor: chantier.couleur }]}>
              <Text style={styles.chantierNom}>{chantier.nom}</Text>
              <Text style={styles.chantierAdresse}>{chantier.adresse}</Text>
            </View>
            {liste ? (
              renderListe(liste, false)
            ) : (
              <View style={styles.listeCard}>
                <Text style={styles.emptyText}>{t.materiel.noItemsForProject}</Text>
                <Pressable
                  style={styles.addItemBtn}
                  onPress={() => openAddModal(chantier.id, chantier.nom)}
                >
                  <Text style={styles.addItemBtnText}>+ {t.materiel.createList}</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );

  // ── Vue acheteur : toutes les listes par chantier → employé ──
  const renderVueAcheteur = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      {listesParChantier.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{t.materiel.noLists}</Text>
        </View>
      )}
      {listesParChantier.map(({ chantier, listes }) => {
        const itemsNonAchetes = listes.flatMap(l => l.items.filter(i => !i.achete));
        const itemsAchetes = listes.flatMap(l => l.items.filter(i => i.achete));

        return (
          <View key={chantier.id} style={styles.chantierSection}>
            <View style={[styles.chantierHeader, { borderLeftColor: chantier.couleur }]}>
              <Text style={styles.chantierNom}>{chantier.nom}</Text>
              <Text style={styles.chantierAdresse}>{chantier.adresse}</Text>
              <View style={styles.chantierStats}>
                {itemsNonAchetes.length > 0 && (
                  <View style={styles.statsBadgeRed}>
                    <Text style={styles.statsBadgeRedText}>{itemsNonAchetes.length} {t.materiel.toBuy}</Text>
                  </View>
                )}
                {itemsAchetes.length > 0 && (
                  <View style={styles.statsBadgeGreen}>
                    <Text style={styles.statsBadgeGreenText}>{itemsAchetes.length} {t.materiel.bought}</Text>
                  </View>
                )}
              </View>
            </View>

            {listes.map(liste => renderListe(liste, true))}
          </View>
        );
      })}
    </ScrollView>
  );

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🛒 {t.materiel.title}</Text>
        {nbNonAchetes > 0 && isAcheteur && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{nbNonAchetes}</Text>
          </View>
        )}
      </View>

      {isAcheteur && (
        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tab, viewMode === 'mes_listes' && styles.tabActive]}
            onPress={() => setViewMode('mes_listes')}
          >
            <Text style={[styles.tabText, viewMode === 'mes_listes' && styles.tabTextActive]}>
              {isEmploye ? t.materiel.myLists : t.materiel.byEmployee}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, viewMode === 'acheteur' && styles.tabActive]}
            onPress={() => setViewMode('acheteur')}
          >
            <Text style={[styles.tabText, viewMode === 'acheteur' && styles.tabTextActive]}>
              {t.materiel.buyerView} {nbNonAchetes > 0 ? `(${nbNonAchetes})` : ''}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Barre de recherche */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un article ou chantier..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} style={styles.searchClear}>
            <Text style={{ color: '#999', fontSize: 16 }}>&#10005;</Text>
          </Pressable>
        )}
      </View>

      {viewMode === 'mes_listes' ? renderMesListes() : renderVueAcheteur()}

      <ConfirmModal />

      {/* Modal d'ajout d'article */}
      <Modal visible={!!addModal} transparent animationType="slide" onRequestClose={() => setAddModal(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setAddModal(null)}>
          <Pressable style={styles.modalContent} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t.materiel.addItem}</Text>
            <Text style={styles.modalSubtitle}>{addModal?.chantierNom}</Text>

            <Text style={styles.inputLabel}>{t.materiel.article} *</Text>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={t.materiel.articlePlaceholder}
              value={newArticle}
              onChangeText={setNewArticle}
              onSubmitEditing={handleAddArticle}
              returnKeyType="next"
              autoFocus
            />

            <Text style={styles.inputLabel}>{t.materiel.quantity} ({t.common.optional})</Text>
            <TextInput
              style={styles.input}
              placeholder={t.materiel.quantityPlaceholder}
              value={newQuantite}
              onChangeText={setNewQuantite}
              returnKeyType="next"
            />

            <Text style={styles.inputLabel}>{t.common.comment} ({t.common.optional})</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Ex: Marque Leroy Merlin, ref. 12345, couleur RAL 9010..."
              value={newCommentaire}
              onChangeText={setNewCommentaire}
              multiline
              numberOfLines={2}
              returnKeyType="done"
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.btnCancel} onPress={() => setAddModal(null)}>
                <Text style={styles.btnCancelText}>{t.common.close}</Text>
              </Pressable>
              <Pressable
                style={[styles.btnSave, !newArticle.trim() && styles.btnDisabled]}
                onPress={handleAddArticle}
                disabled={!newArticle.trim()}
              >
                <Text style={styles.btnSaveText}>+ {t.common.add}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  title: { fontSize: 20, fontWeight: '700', color: '#1A3A6B', flex: 1 },
  badge: { backgroundColor: '#E74C3C', borderRadius: 12, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  searchBar: { flexDirection: 'row' as const, alignItems: 'center' as const, marginHorizontal: 16, marginBottom: 8, backgroundColor: '#F2F4F7', borderRadius: 10, borderWidth: 1, borderColor: '#E2E6EA' },
  searchInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#11181C' },
  searchClear: { paddingHorizontal: 12, paddingVertical: 10 },
  tabBar: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, backgroundColor: '#F0F4FF', borderRadius: 8, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, color: '#666', fontWeight: '500' },
  tabTextActive: { color: '#1A3A6B', fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyStateText: { color: '#999', fontSize: 15 },
  chantierSection: { marginBottom: 20 },
  chantierHeader: { borderLeftWidth: 4, paddingLeft: 12, marginBottom: 8 },
  chantierNom: { fontSize: 16, fontWeight: '700', color: '#1A3A6B' },
  chantierAdresse: { fontSize: 12, color: '#888', marginTop: 2 },
  chantierStats: { marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chantierStatsText: { fontSize: 12, color: '#555', fontStyle: 'italic' },
  listeCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  listeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  employeHeader: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  employeAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  employeAvatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  employeNom: { fontSize: 14, fontWeight: '600', color: '#333' },
  deleteListeBtn: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#FFF5F5', borderRadius: 6, borderWidth: 1, borderColor: '#FED7D7' },
  deleteListeBtnText: { color: '#C53030', fontSize: 11, fontWeight: '600' },
  emptyText: { color: '#aaa', fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F8F8F8' },
  itemAchete: { opacity: 0.6 },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#CCC', alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 1, flexShrink: 0 },
  checkboxAcheteur: { borderColor: '#1A3A6B' },
  checkboxInner: { fontSize: 14 },
  checkboxChecked: { backgroundColor: '#27AE60', borderColor: '#27AE60' },
  checkboxCheckedInner: { color: '#fff', fontSize: 13, fontWeight: '700' },
  itemContent: { flex: 1, flexDirection: 'column', gap: 3 },
  itemTexte: { fontSize: 14, color: '#333' },
  itemTexteBarre: { textDecorationLine: 'line-through', color: '#999' },
  itemQuantite: { fontSize: 12, color: '#888', backgroundColor: '#F0F0F0', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, fontWeight: '600', alignSelf: 'flex-start' },
  itemCommentaire: { fontSize: 12, color: '#666', fontStyle: 'italic', backgroundColor: '#FFFBF0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderLeftWidth: 2, borderLeftColor: '#FFB800' },
  achetePar: { fontSize: 11, color: '#27AE60', marginTop: 2 },
  deleteBtn: { padding: 6, marginLeft: 4, flexShrink: 0 },
  deleteBtnText: { color: '#E74C3C', fontSize: 14, fontWeight: '700' },
  archiveSection: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E8F5E9' },
  archiveTitle: { fontSize: 12, color: '#27AE60', fontWeight: '600', marginBottom: 6 },
  archiveToggleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: '#F0FFF4', borderRadius: 8,
    borderWidth: 1, borderColor: '#C6F6D5',
  },
  archiveToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  archiveToggleIcon: { fontSize: 13, color: '#276749', fontWeight: '700', width: 14 },
  archiveToggleText: { fontSize: 13, color: '#276749', fontWeight: '600' },
  archiveBadge: {
    backgroundColor: '#C6F6D5', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  archiveBadgeText: { fontSize: 11, color: '#276749', fontWeight: '700' },
  archiveContent: {
    marginTop: 6, paddingTop: 6,
    borderTopWidth: 1, borderTopColor: '#E8F5E9',
  },
  // Vue acheteur
  acheteurCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  acheteurCardTitle: { fontSize: 13, fontWeight: '700', color: '#1A3A6B', marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#EEF2F8' },
  acheteurItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F8F8F8' },
  archiveCard: { backgroundColor: '#F0FFF4', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#C6F6D5' },
  archiveCardTitle: { fontSize: 13, fontWeight: '700', color: '#276749', marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#C6F6D5' },
  employeTag: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  employeTagText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  statsBadgeRed: { backgroundColor: '#FFF5F5', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginRight: 6, borderWidth: 1, borderColor: '#FED7D7' },
  statsBadgeRedText: { color: '#C53030', fontSize: 11, fontWeight: '700' },
  statsBadgeGreen: { backgroundColor: '#F0FFF4', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: '#C6F6D5' },
  statsBadgeGreenText: { color: '#276749', fontSize: 11, fontWeight: '700' },
  allDoneRow: { backgroundColor: '#F0FFF4', borderRadius: 10, padding: 12, marginBottom: 8, alignItems: 'center' },
  allDoneText: { color: '#276749', fontSize: 13, fontWeight: '600' },
  addItemBtn: { marginTop: 10, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#1A3A6B', borderRadius: 6, borderStyle: 'dashed' },
  addItemBtnText: { color: '#1A3A6B', fontSize: 13, fontWeight: '600' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1A3A6B', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#888', marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 12, backgroundColor: '#FAFAFA' },
  inputMultiline: { height: 64, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btnCancel: { flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#DDD', borderRadius: 8 },
  btnCancelText: { color: '#666', fontSize: 15 },
  btnSave: { flex: 2, paddingVertical: 12, alignItems: 'center', backgroundColor: '#1A3A6B', borderRadius: 8 },
  btnSaveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
});
