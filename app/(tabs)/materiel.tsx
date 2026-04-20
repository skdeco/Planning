import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal,
  Platform, LayoutAnimation, UIManager, ActivityIndicator, Linking, Alert,
} from 'react-native';
import { ModalKeyboard } from '@/components/ModalKeyboard';
import { useConfirm } from '@/hooks/useConfirm';

// Activer LayoutAnimation sur Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { ScreenContainer } from '@/components/screen-container';
import type { ListeMateriau, MateriauItem } from '@/app/types';
import { CatalogueArticles } from '@/components/CatalogueArticles';
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

// ─── Vérification disponibilité ──────────────────────────────────────────────
type DispoResult = { status: 'en_stock' | 'stock_limite' | 'rupture' | 'inconnu' | 'erreur'; label: string; magasin?: string; lien?: string };

async function checkDisponibilite(lienFournisseur: string, magasin?: string): Promise<DispoResult> {
  if (!lienFournisseur) return { status: 'inconnu', label: 'Pas de lien fournisseur' };

  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(lienFournisseur)}`;
    const res = await fetch(proxyUrl, { headers: { 'Accept': 'text/html' } });
    const html = await res.text();

    const domain = new URL(lienFournisseur).hostname.replace('www.', '').toLowerCase();

    // ─── Leroy Merlin ───
    if (domain.includes('leroymerlin')) {
      // Chercher la dispo dans le HTML/JSON-LD
      const stockMatch = html.match(/["']availability["']\s*:\s*["'](https?:\/\/schema\.org\/([^"']+))["']/i);
      if (stockMatch) {
        const availability = stockMatch[2]?.toLowerCase() || '';
        if (availability.includes('instock')) return { status: 'en_stock', label: `En stock${magasin ? ` (${magasin})` : ''}`, magasin, lien: lienFournisseur };
        if (availability.includes('limitedavailability')) return { status: 'stock_limite', label: `Stock limité${magasin ? ` (${magasin})` : ''}`, magasin, lien: lienFournisseur };
        if (availability.includes('outofstock')) return { status: 'rupture', label: `Rupture${magasin ? ` (${magasin})` : ''}`, magasin, lien: lienFournisseur };
      }
      // Fallback : chercher texte brut
      if (/en stock|disponible|livr/i.test(html)) return { status: 'en_stock', label: `Disponible${magasin ? ` (${magasin})` : ''}`, magasin, lien: lienFournisseur };
      if (/rupture|indisponible/i.test(html)) return { status: 'rupture', label: `Rupture${magasin ? ` (${magasin})` : ''}`, magasin, lien: lienFournisseur };
    }

    // ─── Générique (ManoMano, Amazon, Castorama, etc.) ───
    const schemaMatch = html.match(/["']availability["']\s*:\s*["'](https?:\/\/schema\.org\/([^"']+))["']/i);
    if (schemaMatch) {
      const avail = schemaMatch[2]?.toLowerCase() || '';
      if (avail.includes('instock')) return { status: 'en_stock', label: 'En stock', lien: lienFournisseur };
      if (avail.includes('limited')) return { status: 'stock_limite', label: 'Stock limité', lien: lienFournisseur };
      if (avail.includes('outofstock') || avail.includes('discontinued')) return { status: 'rupture', label: 'Rupture de stock', lien: lienFournisseur };
    }

    // Fallback texte
    if (/ajouter au panier|add to cart|en stock|in stock|disponible immédiatement/i.test(html)) {
      return { status: 'en_stock', label: 'Probablement en stock', lien: lienFournisseur };
    }
    if (/rupture|out of stock|indisponible|actuellement indisponible/i.test(html)) {
      return { status: 'rupture', label: 'Probablement en rupture', lien: lienFournisseur };
    }

    return { status: 'inconnu', label: 'Dispo non détectée', lien: lienFournisseur };
  } catch {
    return { status: 'erreur', label: 'Erreur de vérification', lien: lienFournisseur };
  }
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function MaterielScreen() {
  const {
    data, currentUser, isHydrated,
    upsertListeMateriau, deleteListeMateriau,
    toggleMateriau, addMateriauItem, deleteMateriauItem,
    addFournisseur, deleteFournisseur,
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

  // Disponibilité articles
  const [dispoResults, setDispoResults] = useState<Record<string, DispoResult>>({});
  const [dispoLoading, setDispoLoading] = useState<Record<string, boolean>>({});

  const handleCheckDispo = async (itemId: string, articleNom: string) => {
    // Chercher l'article dans le catalogue par nom ou par catalogueArticleId
    const catalogue = data.catalogueArticles || [];
    const allListes = data.listesMateriaux || [];
    let item: MateriauItem | undefined;
    for (const l of allListes) {
      const found = l.items.find(i => i.id === itemId);
      if (found) { item = found; break; }
    }
    const catalogueArticle = item?.catalogueArticleId
      ? catalogue.find(a => a.id === item?.catalogueArticleId)
      : catalogue.find(a => a.nom.toLowerCase() === articleNom.toLowerCase());

    if (!catalogueArticle?.lienFournisseur) {
      setDispoResults(p => ({ ...p, [itemId]: { status: 'inconnu', label: 'Pas de lien fournisseur dans le catalogue' } }));
      return;
    }

    setDispoLoading(p => ({ ...p, [itemId]: true }));
    const result = await checkDisponibilite(catalogueArticle.lienFournisseur, data.magasinPrefere);
    setDispoResults(p => ({ ...p, [itemId]: result }));
    setDispoLoading(p => ({ ...p, [itemId]: false }));
  };

  // Mode vue
  const [viewMode, setViewMode] = useState<'mes_listes' | 'acheteur'>(
    isAcheteur && !isEmploye ? 'acheteur' : 'mes_listes'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showCatalogue, setShowCatalogue] = useState(false);

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
  const [newFournisseur, setNewFournisseur] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Fournisseurs prédéfinis + ceux utilisés dans les articles
  const fournisseursList = [...new Set([
    ...(data.fournisseurs || []),
    ...(data.listesMateriaux || []).flatMap(l => l.items.map(i => i.fournisseur).filter(Boolean) as string[]),
  ])].sort();

  // Groupement par fournisseur dans la vue acheteur
  const [groupByFournisseur, setGroupByFournisseur] = useState(false);

  // Modal gestion fournisseurs
  const [showFournisseurModal, setShowFournisseurModal] = useState(false);
  const [newFournisseurName, setNewFournisseurName] = useState('');

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
    const myEmployeId = currentUser?.employeId || (isAdmin ? 'admin' : '');
    const existingListe = (data.listesMateriaux || []).find(
      l => l.chantierId === chantierId && l.employeId === myEmployeId
    );
    setAddModal({
      listeId: existingListe?.id || null,
      chantierId,
      chantierNom,
    });
    setNewArticle('');
    setNewQuantite('');
    setNewCommentaire('');
    setNewFournisseur('');
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  // ── Ajouter un article ──
  const handleAddArticle = () => {
    if (!newArticle.trim() || !addModal) return;
    const now = new Date().toISOString();
    const ajouteParNom = currentEmploye ? `${currentEmploye.prenom} ${currentEmploye.nom}` : 'Admin';
    const item: MateriauItem = {
      id: genId(),
      texte: newArticle.trim(),
      quantite: newQuantite.trim() || undefined,
      commentaire: newCommentaire.trim() || undefined,
      fournisseur: newFournisseur.trim() || undefined,
      achete: false,
      ajoutePar: ajouteParNom,
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

    setToastMsg(`✓ "${item.texte}" ajouté`);
    setTimeout(() => setToastMsg(null), 3000);
    setNewArticle('');
    setNewQuantite('');
    setNewCommentaire('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // ── Modal fournisseur (modifier fournisseur d'un article existant) ──
  const [fournisseurPickerModal, setFournisseurPickerModal] = useState<{ listeId: string; itemId: string; nom: string; currentFournisseur: string } | null>(null);

  const handleChangeFournisseur = (listeId: string, itemId: string, fournisseur: string) => {
    const liste = (data.listesMateriaux || []).find(l => l.id === listeId);
    if (!liste) return;
    const updatedItems = liste.items.map(i =>
      i.id === itemId ? { ...i, fournisseur: fournisseur || undefined } : i
    );
    upsertListeMateriau({ ...liste, items: updatedItems, updatedAt: new Date().toISOString() });
    setFournisseurPickerModal(null);
    setToastMsg(`Fournisseur mis a jour`);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // ── Modal achat (prix réel) ──
  const [achatModal, setAchatModal] = useState<{ listeId: string; itemId: string; nom: string } | null>(null);
  const [achatPrix, setAchatPrix] = useState('');
  const [achatFournisseur, setAchatFournisseur] = useState('');

  // ── Modal achat partiel ──
  const [partielModal, setPartielModal] = useState<{
    listeId: string;
    itemId: string;
    nom: string;
    quantiteTotale: number;
    quantiteUnite: string; // suffixe non numérique (ex: "rouleaux")
  } | null>(null);
  const [partielQty, setPartielQty] = useState('');

  // Extrait le nombre initial d'une string quantité ("3 rouleaux" → { num: 3, unite: "rouleaux" })
  const parseQuantite = (q?: string): { num: number | null; unite: string } => {
    if (!q) return { num: null, unite: '' };
    const trimmed = q.trim();
    const match = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (!match) return { num: null, unite: trimmed };
    const num = parseFloat(match[1].replace(',', '.'));
    if (isNaN(num)) return { num: null, unite: trimmed };
    return { num, unite: match[2] || '' };
  };

  // ── Cocher/décocher un article (acheteur) ──
  const handleToggle = (listeId: string, itemId: string) => {
    const acheteurNom = isAdmin ? 'Admin' : currentEmploye ? `${currentEmploye.prenom} ${currentEmploye.nom}` : 'Acheteur';
    // Retrouver l'item pour savoir si on propose un achat partiel
    const liste = (data.listesMateriaux || []).find(l => l.id === listeId);
    const item = liste?.items.find(i => i.id === itemId);
    // Si l'article est déjà acheté, on désarchive (décocher)
    if (item && item.achete) {
      // Cas spécial : si cet item provient d'un achat partiel (splitFromItemId défini),
      // on merge les 2 lignes (bought + remaining) en une seule pour revenir à l'état d'origine.
      if (liste && item.splitFromItemId) {
        const original = liste.items.find(i => i.id === item.splitFromItemId && !i.achete);
        if (original) {
          const { num: numAch, unite: uniteAch } = parseQuantite(item.quantite);
          const { num: numRest, unite: uniteRest } = parseQuantite(original.quantite);
          if (numAch !== null && numRest !== null) {
            const total = numAch + numRest;
            const uniteStr = uniteRest || uniteAch || '';
            const mergedQty = uniteStr ? `${total} ${uniteStr}`.trim() : `${total}`;
            const updatedItems = liste.items
              .filter(i => i.id !== item.id) // supprimer la ligne "acheté"
              .map(i => i.id === original.id ? { ...i, quantite: mergedQty } : i);
            upsertListeMateriau({ ...liste, items: updatedItems, updatedAt: new Date().toISOString() });
            return;
          }
        }
      }
      // Fallback : simple décocher
      toggleMateriau(listeId, itemId, acheteurNom);
      return;
    }
    if (!item) {
      toggleMateriau(listeId, itemId, acheteurNom);
      return;
    }
    // Si pas de quantité numérique → comportement historique
    const { num, unite } = parseQuantite(item.quantite);
    if (num === null || num <= 1) {
      toggleMateriau(listeId, itemId, acheteurNom);
      return;
    }
    // Proposer Tout acheté / Partiellement / Annuler
    const onTout = () => toggleMateriau(listeId, itemId, acheteurNom);
    const onPartiel = () => {
      setPartielQty(String(num));
      setPartielModal({ listeId, itemId, nom: item.texte, quantiteTotale: num, quantiteUnite: unite });
    };
    if (Platform.OS === 'web') {
      // Sur le web Alert.alert avec 3 boutons n'affiche pas toujours tout : utiliser window.confirm + window.prompt
      const choix = window.confirm(`Avez-vous acheté la totalité (${item.quantite}) ?\n\nOK = Tout acheté\nAnnuler = Achat partiel`);
      if (choix) onTout();
      else onPartiel();
      return;
    }
    Alert.alert(
      item.texte,
      `Quantité demandée : ${item.quantite}\nCombien avez-vous acheté ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Partiellement', onPress: onPartiel },
        { text: 'Tout acheté', onPress: onTout },
      ]
    );
  };

  // Valider un achat partiel : met à jour l'article original (quantité restante) et crée un nouvel item acheté
  const handleConfirmPartiel = () => {
    if (!partielModal) return;
    const qtyAchete = parseFloat(partielQty.replace(',', '.'));
    if (isNaN(qtyAchete) || qtyAchete <= 0) {
      Alert.alert('Quantité invalide', 'Veuillez saisir un nombre supérieur à 0.');
      return;
    }
    const { listeId, itemId, quantiteTotale, quantiteUnite } = partielModal;
    if (qtyAchete >= quantiteTotale) {
      // Traiter comme un "tout acheté"
      const acheteurNom = isAdmin ? 'Admin' : currentEmploye ? `${currentEmploye.prenom} ${currentEmploye.nom}` : 'Acheteur';
      toggleMateriau(listeId, itemId, acheteurNom);
      setPartielModal(null);
      setPartielQty('');
      return;
    }
    const liste = (data.listesMateriaux || []).find(l => l.id === listeId);
    if (!liste) { setPartielModal(null); return; }
    const original = liste.items.find(i => i.id === itemId);
    if (!original) { setPartielModal(null); return; }

    const reste = quantiteTotale - qtyAchete;
    const acheteurNom = isAdmin ? 'Admin' : currentEmploye ? `${currentEmploye.prenom} ${currentEmploye.nom}` : 'Acheteur';
    const now = new Date().toISOString();
    const uniteStr = quantiteUnite ? ` ${quantiteUnite}` : '';

    // Nouvel item "acheté" (copie de l'original avec la quantité achetée)
    // splitFromItemId permet de retrouver l'item d'origine pour merger les 2 lignes au désarchivage
    const nouveau: MateriauItem = {
      ...original,
      id: genId(),
      quantite: `${qtyAchete}${uniteStr} (acheté)`,
      achete: true,
      achetePar: acheteurNom,
      acheteAt: now,
      splitFromItemId: original.id,
      createdAt: now,
    };

    // Mettre à jour la liste en une seule opération (modifier original + ajouter nouveau)
    const updatedItems = liste.items.map(i =>
      i.id === itemId ? { ...i, quantite: `${reste}${uniteStr}` } : i
    );
    updatedItems.push(nouveau);
    upsertListeMateriau({ ...liste, items: updatedItems, updatedAt: now });

    setPartielModal(null);
    setPartielQty('');
    setToastMsg(`✓ ${qtyAchete}${uniteStr} acheté, ${reste}${uniteStr} restant`);
    setTimeout(() => setToastMsg(null), 3000);
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
              <View style={[styles.employeAvatar, { backgroundColor: employe.couleur || '#2C2C2C' }]}>
                <Text style={styles.employeAvatarText}>
                  {employe.prenom?.[0] || '?'}{employe.nom?.[0] || '?'}
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {item.quantite ? (
                  <Text style={styles.itemQuantite}>{item.quantite}</Text>
                ) : null}
                <Text style={styles.itemTexte} numberOfLines={2}>{item.texte}</Text>
              </View>
              {/* Fournisseur masqué dans la vue employé — visible uniquement pour l'acheteur */}
              {item.commentaire ? (
                <Text style={styles.itemCommentaire}>💬 {item.commentaire}</Text>
              ) : null}
              {/* Badge disponibilité */}
              {isAcheteur && (() => {
                const dispo = dispoResults[item.id];
                const loading = dispoLoading[item.id];
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    {!dispo && !loading && (
                      <Pressable
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2F8', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}
                        onPress={() => handleCheckDispo(item.id, item.texte)}
                      >
                        <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>🔍 Vérifier dispo</Text>
                      </Pressable>
                    )}
                    {loading && <ActivityIndicator size="small" color="#2C2C2C" />}
                    {dispo && !loading && (
                      <Pressable
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                          backgroundColor: dispo.status === 'en_stock' ? '#D4EDDA' : dispo.status === 'stock_limite' ? '#FFF3CD' : dispo.status === 'rupture' ? '#FDECEA' : '#F5EDE3'
                        }}
                        onPress={() => {
                          if (dispo.lien) {
                            if (Platform.OS === 'web') window.open(dispo.lien, '_blank');
                            else Linking.openURL(dispo.lien);
                          }
                        }}
                        onLongPress={() => handleCheckDispo(item.id, item.texte)}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '600',
                          color: dispo.status === 'en_stock' ? '#155724' : dispo.status === 'stock_limite' ? '#856404' : dispo.status === 'rupture' ? '#B71C1C' : '#687076'
                        }}>
                          {dispo.status === 'en_stock' ? '🟢' : dispo.status === 'stock_limite' ? '🟡' : dispo.status === 'rupture' ? '🔴' : '⚪'} {dispo.label}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })()}
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {item.quantite ? (
                          <Text style={[styles.itemQuantite, styles.itemTexteBarre]}>{item.quantite}</Text>
                        ) : null}
                        <Text style={[styles.itemTexte, styles.itemTexteBarre]} numberOfLines={2}>{item.texte}</Text>
                      </View>
                      {item.commentaire ? (
                        <Text style={[styles.itemCommentaire, styles.itemTexteBarre]}>💬 {item.commentaire}</Text>
                      ) : null}
                      {item.achetePar && (
                        <Text style={styles.achetePar}>✓ {item.achetePar}{item.prixReel != null ? ` · ${item.prixReel}€` : ''}{item.fournisseurReel ? ` · ${item.fournisseurReel}` : ''}</Text>
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

  // ── Vue employé : tous les articles du chantier (peu importe qui les a ajoutés) ──
  const renderMesListes = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      {chantiersVisibles.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{t.materiel.noActiveProject}</Text>
        </View>
      )}
      {chantiersVisibles.map(chantier => {
        // Toutes les listes du chantier (de tous les employés)
        const listes = (data.listesMateriaux || []).filter(l => l.chantierId === chantier.id);
        const allItems = listes.flatMap(l => l.items.map(i => ({ ...i, listeId: l.id, employeId: l.employeId })));
        const itemsActifs = allItems.filter(i => !i.achete);
        const itemsAchetes = allItems.filter(i => i.achete);
        const archiveKey = `mes_${chantier.id}`;
        return (
          <View key={chantier.id} style={styles.chantierSection}>
            <View style={[styles.chantierHeader, { borderLeftColor: chantier.couleur }]}>
              <Text style={styles.chantierNom}>{chantier.nom}</Text>
              <Text style={styles.chantierAdresse}>{chantier.adresse}</Text>
            </View>
            <View style={styles.listeCard}>
              {itemsActifs.length === 0 && itemsAchetes.length === 0 && (
                <Text style={styles.emptyText}>{t.materiel.noItemsForProject}</Text>
              )}
              {/* Vue employé : articles en vrac, sans fournisseur visible */}
              {itemsActifs.map(item => {
                const emp = data.employes.find(e => e.id === item.employeId);
                const isMine = item.employeId === currentUser?.employeId || (item.employeId === 'admin' && isAdmin);
                return (
                  <View key={item.id} style={styles.itemRow}>
                    <Pressable
                      style={[styles.checkbox, isAcheteur && styles.checkboxAcheteur]}
                      onPress={() => isAcheteur ? handleToggle(item.listeId, item.id) : undefined}
                    >
                      <Text style={styles.checkboxInner}> </Text>
                    </Pressable>
                    <View style={styles.itemContent}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {item.quantite ? <Text style={styles.itemQuantite}>{item.quantite}</Text> : null}
                        <Text style={styles.itemTexte} numberOfLines={1}>{item.texte}</Text>
                        <Text style={{ fontSize: 10, color: '#999' }}>({item.ajoutePar || emp?.prenom || 'Admin'})</Text>
                      </View>
                      {/* Fournisseur masqué dans la vue employé */}
                      {item.commentaire ? <Text style={styles.itemCommentaire}>💬 {item.commentaire}</Text> : null}
                    </View>
                    {isMine && (
                      <Pressable onPress={() => handleDeleteItem(item.listeId, item.id)} style={styles.deleteBtn}>
                        <Text style={styles.deleteBtnText}>✕</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
              {itemsAchetes.length > 0 && (
                <View style={styles.archiveSection}>
                  <Pressable style={styles.archiveToggleBtn} onPress={() => toggleArchive(archiveKey)}>
                    <View style={styles.archiveToggleLeft}>
                      <Text style={styles.archiveToggleIcon}>{openArchives[archiveKey] ? '▾' : '▸'}</Text>
                      <Text style={styles.archiveToggleText}>{t.materiel.archived} ({itemsAchetes.length})</Text>
                    </View>
                  </Pressable>
                  {openArchives[archiveKey] && itemsAchetes.map(item => (
                    <View key={item.id} style={[styles.itemRow, styles.itemAchete]}>
                      <View style={[styles.checkbox, styles.checkboxChecked]}>
                        <Text style={styles.checkboxCheckedInner}>✓</Text>
                      </View>
                      <View style={styles.itemContent}>
                        <Text style={[styles.itemTexte, styles.itemTexteBarre]} numberOfLines={1}>{item.quantite ? `${item.quantite} · ` : ''}{item.texte}</Text>
                        {item.achetePar && <Text style={styles.achetePar}>✓ {item.achetePar}</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              )}
              <Pressable style={styles.addItemBtn} onPress={() => openAddModal(chantier.id, chantier.nom)}>
                <Text style={styles.addItemBtnText}>+ {t.materiel.addItem}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );

  // ── Vue acheteur : toutes les listes fusionnées par chantier ──
  const renderVueAcheteur = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      {listesParChantier.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{t.materiel.noLists}</Text>
        </View>
      )}
      {listesParChantier.map(({ chantier, listes }) => {
        // Fusionner tous les items de toutes les listes du chantier
        const allItems = listes.flatMap(l => l.items.map(i => ({ ...i, listeId: l.id, employeId: l.employeId })));
        const itemsActifs = allItems.filter(i => !i.achete);
        const itemsAchetes = allItems.filter(i => i.achete);
        const archiveKey = `chantier_${chantier.id}`;

        return (
          <View key={chantier.id} style={styles.chantierSection}>
            <View style={[styles.chantierHeader, { borderLeftColor: chantier.couleur }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.chantierNom}>{chantier.nom}</Text>
                  <Text style={styles.chantierAdresse}>{chantier.adresse}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {itemsActifs.length > 0 && (
                    <View style={styles.statsBadgeRed}>
                      <Text style={styles.statsBadgeRedText}>{itemsActifs.length}</Text>
                    </View>
                  )}
                  {itemsAchetes.length > 0 && (
                    <View style={styles.statsBadgeGreen}>
                      <Text style={styles.statsBadgeGreenText}>✓{itemsAchetes.length}</Text>
                    </View>
                  )}
                </View>
              </View>
              {isAdmin && listes.length > 0 && (
                <Pressable onPress={async () => { if (await confirm('Supprimer cette liste ?')) listes.forEach(l => deleteListeMateriau(l.id)); }} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
                  <Text style={{ fontSize: 11, color: '#E74C3C' }}>🗑 Supprimer cette liste</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.listeCard}>
              {/* Articles à acheter — groupés par fournisseur */}
              {(() => {
                const parFournisseur: Record<string, typeof itemsActifs> = {};
                const sansFournisseur: typeof itemsActifs = [];
                itemsActifs.forEach(item => {
                  if (item.fournisseur) {
                    if (!parFournisseur[item.fournisseur]) parFournisseur[item.fournisseur] = [];
                    parFournisseur[item.fournisseur].push(item);
                  } else {
                    sansFournisseur.push(item);
                  }
                });
                const fournisseurs = Object.keys(parFournisseur).sort();
                const renderItemAcheteur = (item: typeof itemsActifs[0]) => {
                  const emp = data.employes.find(e => e.id === item.employeId);
                  return (
                    <View key={item.id} style={styles.itemRow}>
                      <Pressable
                        style={[styles.checkbox, styles.checkboxAcheteur]}
                        onPress={() => handleToggle(item.listeId, item.id)}
                      >
                        <Text style={styles.checkboxInner}> </Text>
                      </Pressable>
                      <View style={styles.itemContent}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {item.quantite ? <Text style={styles.itemQuantite}>{item.quantite}</Text> : null}
                          <Text style={styles.itemTexte} numberOfLines={1}>{item.texte}</Text>
                          <Text style={{ fontSize: 10, color: '#999' }}>({item.ajoutePar || emp?.prenom || 'Admin'})</Text>
                        </View>
                        <Pressable onPress={() => setFournisseurPickerModal({ listeId: item.listeId, itemId: item.id, nom: item.texte, currentFournisseur: item.fournisseur || '' })}>
                          <Text style={{ fontSize: 10, color: '#2C2C2C', fontWeight: '600' }}>{item.fournisseur ? `🏪 ${item.fournisseur}` : '🏪 Assigner fournisseur'}</Text>
                        </Pressable>
                        {item.commentaire ? <Text style={styles.itemCommentaire}>💬 {item.commentaire}</Text> : null}
                      </View>
                      {(isAdmin || isAcheteur) && (
                        <Pressable onPress={() => handleDeleteItem(item.listeId, item.id)} style={styles.deleteBtn}>
                          <Text style={styles.deleteBtnText}>✕</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                };
                return (
                  <>
                    {fournisseurs.map(f => (
                      <View key={f} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 4, backgroundColor: '#F5EDE3', borderRadius: 6, marginBottom: 4 }}>
                          <Text style={{ fontSize: 12 }}>🏪</Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#2C2C2C' }}>{f}</Text>
                          <Text style={{ fontSize: 10, color: '#8C8077' }}>({parFournisseur[f].length})</Text>
                        </View>
                        {parFournisseur[f].map(renderItemAcheteur)}
                      </View>
                    ))}
                    {sansFournisseur.length > 0 && fournisseurs.length > 0 && (
                      <View style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 4, backgroundColor: '#F5EDE3', borderRadius: 6, marginBottom: 4 }}>
                          <Text style={{ fontSize: 12 }}>📦</Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#8C8077' }}>Sans fournisseur</Text>
                          <Text style={{ fontSize: 10, color: '#8C8077' }}>({sansFournisseur.length})</Text>
                        </View>
                      </View>
                    )}
                    {sansFournisseur.map(renderItemAcheteur)}
                  </>
                );
              })()}

              {/* Articles achetés — repliable */}
              {itemsAchetes.length > 0 && (
                <View style={styles.archiveSection}>
                  <Pressable style={styles.archiveToggleBtn} onPress={() => toggleArchive(archiveKey)}>
                    <View style={styles.archiveToggleLeft}>
                      <Text style={styles.archiveToggleIcon}>{openArchives[archiveKey] ? '▾' : '▸'}</Text>
                      <Text style={styles.archiveToggleText}>{t.materiel.archived} ({itemsAchetes.length})</Text>
                    </View>
                  </Pressable>
                  {openArchives[archiveKey] && (
                    <View style={styles.archiveContent}>
                      {itemsAchetes.map(item => (
                        <View key={item.id} style={[styles.itemRow, styles.itemAchete]}>
                          <Pressable style={[styles.checkbox, styles.checkboxChecked, styles.checkboxAcheteur]} onPress={() => handleToggle(item.listeId, item.id)}>
                            <Text style={styles.checkboxCheckedInner}>✓</Text>
                          </Pressable>
                          <View style={styles.itemContent}>
                            <Text style={[styles.itemTexte, styles.itemTexteBarre]} numberOfLines={1}>{item.quantite ? `${item.quantite} · ` : ''}{item.texte}</Text>
                            {item.achetePar && <Text style={styles.achetePar}>✓ {item.achetePar}</Text>}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {itemsActifs.length === 0 && itemsAchetes.length === 0 && (
                <Text style={styles.emptyText}>{t.materiel.noItems}</Text>
              )}

              {/* Un seul bouton ajouter par chantier */}
              <Pressable style={styles.addItemBtn} onPress={() => openAddModal(chantier.id, chantier.nom)}>
                <Text style={styles.addItemBtnText}>+ {t.materiel.addItem}</Text>
              </Pressable>
            </View>
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
        {toastMsg && (
          <View style={{ backgroundColor: '#D4EDDA', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
            <Text style={{ color: '#155724', fontSize: 12, fontWeight: '600' }}>{toastMsg}</Text>
          </View>
        )}
        {nbNonAchetes > 0 && isAcheteur && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{nbNonAchetes}</Text>
          </View>
        )}
      </View>

      {/* Bouton catalogue — admin/acheteur */}
      {isAcheteur && (
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 12, marginBottom: 6, backgroundColor: '#EBF0FF', paddingVertical: 8, borderRadius: 8 }}
          onPress={() => setShowCatalogue(true)}>
          <Text style={{ fontSize: 14 }}>📦</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C2C2C' }}>Gérer le catalogue ({(data.catalogueArticles || []).length} articles)</Text>
        </Pressable>
      )}

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

      {/* Bouton gérer fournisseurs (admin) */}
      {viewMode === 'acheteur' && isAdmin && (
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, backgroundColor: '#F5EDE3', borderRadius: 8, alignSelf: 'flex-start' }} onPress={() => setShowFournisseurModal(true)}>
            <Text style={{ fontSize: 12, color: '#8C8077' }}>⚙️ Gérer les fournisseurs</Text>
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

      <CatalogueArticles visible={showCatalogue} onClose={() => setShowCatalogue(false)} />

      {/* Modal d'ajout d'article */}
      <ModalKeyboard visible={!!addModal} transparent animationType="slide" onRequestClose={() => setAddModal(null)}>
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
            {/* Suggestions du catalogue */}
            {newArticle.trim().length >= 2 && (() => {
              const q = newArticle.toLowerCase().trim();
              const suggestions = (data.catalogueArticles || []).filter(a =>
                a.nom.toLowerCase().includes(q) || (a.reference || '').toLowerCase().includes(q)
              ).slice(0, 5);
              if (suggestions.length === 0) return null;
              return (
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E6EA', borderRadius: 8, marginBottom: 6 }}>
                  {suggestions.map(a => (
                    <Pressable key={a.id} style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#F5EDE3' }}
                      onPress={() => { setNewArticle(a.nom + (a.reference ? ` (${a.reference})` : '')); if (a.fournisseur) setNewFournisseur(a.fournisseur); }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C' }}>{a.nom}</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {a.reference && <Text style={{ fontSize: 10, color: '#687076' }}>Réf: {a.reference}</Text>}
                        {a.description && <Text style={{ fontSize: 10, color: '#B0BEC5' }}>{a.description}</Text>}
                      </View>
                    </Pressable>
                  ))}
                </View>
              );
            })()}

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

            {/* Fournisseur — visible uniquement pour l'acheteur/admin */}
            {isAcheteur && (
              <>
                <Text style={styles.inputLabel}>Fournisseur ({t.common.optional})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 6 }}>
                  <Pressable
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: !newFournisseur ? '#2C2C2C' : '#F5EDE3', borderWidth: 1, borderColor: !newFournisseur ? '#2C2C2C' : '#E2E6EA' }}
                    onPress={() => setNewFournisseur('')}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: !newFournisseur ? '#fff' : '#687076' }}>Aucun</Text>
                  </Pressable>
                  {fournisseursList.map(f => (
                    <Pressable key={f}
                      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: newFournisseur === f ? '#2C2C2C' : '#F5EDE3', borderWidth: 1, borderColor: newFournisseur === f ? '#2C2C2C' : '#E2E6EA' }}
                      onPress={() => setNewFournisseur(f)}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: newFournisseur === f ? '#fff' : '#11181C' }}>🏪 {f}</Text>
                    </Pressable>
                  ))}
                  {isAdmin && (
                    <Pressable
                      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#E2E6EA', borderStyle: 'dashed' }}
                      onPress={() => setShowFournisseurModal(true)}>
                      <Text style={{ fontSize: 12, color: '#687076' }}>+ Ajouter</Text>
                    </Pressable>
                  )}
                </ScrollView>
              </>
            )}

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
      </ModalKeyboard>

      {/* ── Modal Gestion Fournisseurs ── */}
      <ModalKeyboard visible={showFournisseurModal} transparent animationType="fade" onRequestClose={() => setShowFournisseurModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowFournisseurModal(false)}>
          <Pressable style={[styles.modalContent, { maxHeight: '70%' }]} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Fournisseurs</Text>
            <Text style={{ fontSize: 12, color: '#687076', marginBottom: 12 }}>Gérez votre liste de fournisseurs prédéfinis.</Text>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Ex: Leroy Merlin, Point P, Rexel..."
                placeholderTextColor="#B0BEC5"
                value={newFournisseurName}
                onChangeText={setNewFournisseurName}
                onSubmitEditing={() => {
                  if (newFournisseurName.trim()) { addFournisseur(newFournisseurName.trim()); setNewFournisseurName(''); }
                }}
              />
              <Pressable
                style={{ backgroundColor: newFournisseurName.trim() ? '#2C2C2C' : '#E2E6EA', borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' }}
                onPress={() => { if (newFournisseurName.trim()) { addFournisseur(newFournisseurName.trim()); setNewFournisseurName(''); } }}
                disabled={!newFournisseurName.trim()}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: newFournisseurName.trim() ? '#fff' : '#B0BEC5' }}>+</Text>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              {(data.fournisseurs || []).length === 0 ? (
                <Text style={{ fontSize: 12, color: '#B0BEC5', textAlign: 'center', padding: 20 }}>Aucun fournisseur. Ajoutez-en un ci-dessus.</Text>
              ) : (
                (data.fournisseurs || []).map(f => (
                  <View key={f} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#F5EDE3' }}>
                    <Text style={{ fontSize: 14, color: '#11181C' }}>🏪 {f}</Text>
                    <Pressable onPress={() => {
                      if (Platform.OS === 'web') {
                        if (window.confirm(`Supprimer "${f}" ?`)) deleteFournisseur(f);
                      } else {
                        Alert.alert('Supprimer', `Supprimer "${f}" ?`, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: () => deleteFournisseur(f) }]);
                      }
                    }}>
                      <Text style={{ fontSize: 14, color: '#E74C3C' }}>✕</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>

            <Pressable style={[styles.btnSave, { marginTop: 12 }]} onPress={() => setShowFournisseurModal(false)}>
              <Text style={styles.btnSaveText}>Fermer</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </ModalKeyboard>

      {/* ── Modal Picker Fournisseur (modifier fournisseur article existant) ── */}
      <Modal visible={!!fournisseurPickerModal} transparent animationType="fade" onRequestClose={() => setFournisseurPickerModal(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setFournisseurPickerModal(null)}>
          <Pressable style={[styles.modalContent, { maxHeight: '60%' }]} onPress={e => e.stopPropagation()}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={styles.modalTitle}>Fournisseur</Text>
              <Pressable onPress={() => setFournisseurPickerModal(null)}>
                <Text style={{ fontSize: 18, color: '#687076' }}>✕</Text>
              </Pressable>
            </View>
            <Text style={{ fontSize: 12, color: '#687076', marginBottom: 16 }}>
              Article : <Text style={{ fontWeight: '700', color: '#11181C' }}>{fournisseurPickerModal?.nom}</Text>
            </Text>
            <ScrollView style={{ maxHeight: 300 }}>
              <Pressable
                style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8, marginBottom: 6, backgroundColor: !fournisseurPickerModal?.currentFournisseur ? '#2C2C2C' : '#F5EDE3' }}
                onPress={() => fournisseurPickerModal && handleChangeFournisseur(fournisseurPickerModal.listeId, fournisseurPickerModal.itemId, '')}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: !fournisseurPickerModal?.currentFournisseur ? '#fff' : '#687076' }}>Aucun</Text>
              </Pressable>
              {fournisseursList.map(f => (
                <Pressable key={f}
                  style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8, marginBottom: 6, backgroundColor: fournisseurPickerModal?.currentFournisseur === f ? '#2C2C2C' : '#F5EDE3' }}
                  onPress={() => fournisseurPickerModal && handleChangeFournisseur(fournisseurPickerModal.listeId, fournisseurPickerModal.itemId, f)}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: fournisseurPickerModal?.currentFournisseur === f ? '#fff' : '#11181C' }}>🏪 {f}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal Achat Partiel ── */}
      <ModalKeyboard visible={!!partielModal} transparent animationType="fade" onRequestClose={() => { setPartielModal(null); setPartielQty(''); }}>
        <Pressable style={styles.modalOverlay} onPress={() => { setPartielModal(null); setPartielQty(''); }}>
          <Pressable style={styles.modalContent} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Achat partiel</Text>
            <Text style={styles.modalSubtitle}>{partielModal?.nom}</Text>
            <Text style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>
              Quantité demandée : <Text style={{ fontWeight: '700', color: '#2C2C2C' }}>{partielModal?.quantiteTotale}{partielModal?.quantiteUnite ? ` ${partielModal.quantiteUnite}` : ''}</Text>
            </Text>

            <Text style={styles.inputLabel}>Nombre acheté *</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder={partielModal ? String(partielModal.quantiteTotale) : ''}
              value={partielQty}
              onChangeText={setPartielQty}
              autoFocus
              onSubmitEditing={handleConfirmPartiel}
            />
            <Text style={{ fontSize: 11, color: '#687076', marginBottom: 12, fontStyle: 'italic' }}>
              L'article restera à acheter avec la quantité restante, et un nouvel article "acheté" sera créé.
            </Text>

            <View style={styles.modalActions}>
              <Pressable style={styles.btnCancel} onPress={() => { setPartielModal(null); setPartielQty(''); }}>
                <Text style={styles.btnCancelText}>{t.common.cancel}</Text>
              </Pressable>
              <Pressable
                style={[styles.btnSave, !partielQty.trim() && styles.btnDisabled]}
                onPress={handleConfirmPartiel}
                disabled={!partielQty.trim()}
              >
                <Text style={styles.btnSaveText}>{t.common.validate}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </ModalKeyboard>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  title: { fontSize: 20, fontWeight: '700', color: '#2C2C2C', flex: 1 },
  badge: { backgroundColor: '#E74C3C', borderRadius: 12, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  searchBar: { flexDirection: 'row' as const, alignItems: 'center' as const, marginHorizontal: 16, marginBottom: 8, backgroundColor: '#F5EDE3', borderRadius: 10, borderWidth: 1, borderColor: '#E2E6EA' },
  searchInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#11181C' },
  searchClear: { paddingHorizontal: 12, paddingVertical: 10 },
  tabBar: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, backgroundColor: '#F0F4FF', borderRadius: 8, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, color: '#666', fontWeight: '500' },
  tabTextActive: { color: '#2C2C2C', fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyStateText: { color: '#999', fontSize: 15 },
  chantierSection: { marginBottom: 12 },
  chantierHeader: { borderLeftWidth: 4, paddingLeft: 10, marginBottom: 6 },
  chantierNom: { fontSize: 15, fontWeight: '700', color: '#2C2C2C' },
  chantierAdresse: { fontSize: 11, color: '#888' },
  chantierStats: { marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chantierStatsText: { fontSize: 12, color: '#555', fontStyle: 'italic' },
  listeCard: { backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 6, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  listeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  employeHeader: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  employeAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  employeAvatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  employeNom: { fontSize: 14, fontWeight: '600', color: '#333' },
  deleteListeBtn: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#FFF5F5', borderRadius: 6, borderWidth: 1, borderColor: '#FED7D7' },
  deleteListeBtnText: { color: '#C53030', fontSize: 11, fontWeight: '600' },
  emptyText: { color: '#aaa', fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#F8F8F8' },
  itemAchete: { opacity: 0.6 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#CCC', alignItems: 'center', justifyContent: 'center', marginRight: 8, flexShrink: 0 },
  checkboxAcheteur: { borderColor: '#2C2C2C' },
  checkboxInner: { fontSize: 14 },
  checkboxChecked: { backgroundColor: '#27AE60', borderColor: '#27AE60' },
  checkboxCheckedInner: { color: '#fff', fontSize: 13, fontWeight: '700' },
  itemContent: { flex: 1, flexDirection: 'column', gap: 1 },
  itemTexte: { fontSize: 13, color: '#333' },
  itemTexteBarre: { textDecorationLine: 'line-through', color: '#999' },
  itemQuantite: { fontSize: 12, color: '#2C2C2C', backgroundColor: '#EEF2F8', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  itemCommentaire: { fontSize: 11, color: '#666', fontStyle: 'italic', marginLeft: 30, marginTop: 1 },
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
  acheteurCardTitle: { fontSize: 13, fontWeight: '700', color: '#2C2C2C', marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#EEF2F8' },
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
  addItemBtn: { marginTop: 10, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#2C2C2C', borderRadius: 6, borderStyle: 'dashed' },
  addItemBtnText: { color: '#2C2C2C', fontSize: 13, fontWeight: '600' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#2C2C2C', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#888', marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#E8DDD0', borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 12, backgroundColor: '#FBF8F4', color: '#1A1A1A' },
  inputMultiline: { height: 64, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btnCancel: { flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#DDD', borderRadius: 8 },
  btnCancelText: { color: '#666', fontSize: 15 },
  btnSave: { flex: 2, paddingVertical: 12, alignItems: 'center', backgroundColor: '#2C2C2C', borderRadius: 8 },
  btnSaveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
});
