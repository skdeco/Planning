import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal, Platform, Alert } from 'react-native';
import * as XLSX from 'xlsx';
import { useApp } from '@/app/context/AppContext';
import { EMPLOYE_COLORS, type Employe, type ArticleCatalogue, type CategorieArticle } from '@/app/types';

function genId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`; }

type ImportType = 'employes' | 'articles' | 'chantiers';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const TEMPLATES: Record<ImportType, { label: string; description: string; colonnes: string[]; exemple: string[][] }> = {
  employes: {
    label: '👷 Employés',
    description: 'Importer des employés avec leurs informations',
    colonnes: ['Prénom', 'Nom', 'Métier', 'Identifiant', 'Mot de passe', 'Téléphone', 'Email', 'Tarif journalier'],
    exemple: [
      ['Jean', 'Dupont', 'electricien', 'jean', '1234', '0612345678', 'jean@mail.com', '180'],
      ['Marie', 'Martin', 'peintre', 'marie', '1234', '0698765432', '', '160'],
    ],
  },
  articles: {
    label: '📦 Articles catalogue',
    description: 'Importer des articles avec prix et fournisseur',
    colonnes: ['Nom', 'Catégorie', 'Description', 'Référence', 'Prix unitaire', 'Unité', 'Fournisseur', 'Lien fournisseur'],
    exemple: [
      ['Disjoncteur 20A', 'electricite', 'Disjoncteur modulaire', 'LEG-04886', '12.50', 'pièce', 'Leroy Merlin', 'https://leroymerlin.fr/...'],
      ['Tube PER 16', 'plomberie', 'Tube multicouche', 'PER-16-50', '45', 'rouleau 50m', 'Cedeo', ''],
    ],
  },
  chantiers: {
    label: '🏗 Chantiers',
    description: 'Importer des chantiers avec adresse et dates',
    colonnes: ['Nom', 'Adresse', 'Date début (JJ/MM/AAAA)', 'Date fin (JJ/MM/AAAA)', 'Statut (actif/en_attente)'],
    exemple: [
      ['Résidence Molière', '15 rue Molière, 75001 Paris', '01/04/2026', '30/06/2026', 'actif'],
      ['Villa Beausoleil', '8 av. des Roses, 92100 Boulogne', '15/04/2026', '15/09/2026', 'actif'],
    ],
  },
};

export function ImportExcel({ visible, onClose }: Props) {
  const { data, addEmploye, addArticleCatalogue, addChantier } = useApp();
  const [importType, setImportType] = useState<ImportType>('employes');
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handlePickFile = () => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
        setPreview(jsonData);
        setResult(null);
      };
      reader.readAsBinaryString(file);
    };
    input.click(); setTimeout(() => input.remove(), 60000);
  };

  const handleDownloadTemplate = () => {
    if (Platform.OS !== 'web') return;
    const tpl = TEMPLATES[importType];
    const ws = XLSX.utils.aoa_to_sheet([tpl.colonnes, ...tpl.exemple]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import');
    XLSX.writeFile(wb, `modele_${importType}.xlsx`);
  };

  const parseDateFR = (str: string): string => {
    if (!str) return '';
    // JJ/MM/AAAA → YYYY-MM-DD
    const parts = str.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    return str;
  };

  const handleImport = () => {
    if (!preview || preview.length === 0) return;
    setImporting(true);
    let count = 0;

    try {
      if (importType === 'employes') {
        preview.forEach((row, idx) => {
          const prenom = row['Prénom'] || row['prenom'] || row['Prenom'] || '';
          const nom = row['Nom'] || row['nom'] || '';
          if (!prenom.trim() || !nom.trim()) return;
          const employe: Employe = {
            id: genId('e'),
            prenom: prenom.trim(),
            nom: nom.trim(),
            metier: (row['Métier'] || row['metier'] || row['Metier'] || 'autre') as any,
            role: 'employe',
            identifiant: (row['Identifiant'] || row['identifiant'] || prenom.toLowerCase().trim()).toLowerCase(),
            motDePasse: row['Mot de passe'] || row['motDePasse'] || row['password'] || '1234',
            couleur: EMPLOYE_COLORS[idx % EMPLOYE_COLORS.length],
            telephone: row['Téléphone'] || row['telephone'] || row['Tel'] || undefined,
            email: row['Email'] || row['email'] || undefined,
            tarifJournalier: (() => { const v = parseFloat(row['Tarif journalier'] || row['tarif'] || ''); return isNaN(v) ? undefined : v; })(),
            modeSalaire: row['Tarif journalier'] ? 'journalier' : undefined,
            doitPointer: true,
          };
          addEmploye(employe);
          count++;
        });
      } else if (importType === 'articles') {
        const now = new Date().toISOString();
        preview.forEach(row => {
          const nom = row['Nom'] || row['nom'] || row['Article'] || '';
          if (!nom.trim()) return;
          const article: ArticleCatalogue = {
            id: genId('art'),
            nom: nom.trim(),
            categorie: (row['Catégorie'] || row['categorie'] || row['Categorie'] || 'autre') as CategorieArticle,
            description: row['Description'] || row['description'] || undefined,
            reference: row['Référence'] || row['reference'] || row['Ref'] || undefined,
            prixUnitaire: (() => { const v = parseFloat(row['Prix unitaire'] || row['prix'] || row['Prix'] || ''); return isNaN(v) ? undefined : v; })(),
            unite: row['Unité'] || row['unite'] || row['Unite'] || undefined,
            fournisseur: row['Fournisseur'] || row['fournisseur'] || undefined,
            lienFournisseur: row['Lien fournisseur'] || row['lien'] || row['URL'] || undefined,
            createdAt: now,
            updatedAt: now,
          };
          addArticleCatalogue(article);
          count++;
        });
      } else if (importType === 'chantiers') {
        preview.forEach(row => {
          const nom = row['Nom'] || row['nom'] || row['Chantier'] || '';
          if (!nom.trim()) return;
          addChantier({
            id: genId('c'),
            nom: nom.trim(),
            adresse: row['Adresse'] || row['adresse'] || '',
            dateDebut: parseDateFR(row['Date début'] || row['dateDebut'] || row['Date debut'] || ''),
            dateFin: parseDateFR(row['Date fin'] || row['dateFin'] || ''),
            statut: (row['Statut'] || row['statut'] || 'actif') as any,
            visibleSurPlanning: true,
            employeIds: [],
            couleur: '#2C2C2C',
          });
          count++;
        });
      }
      setResult(`✓ ${count} ${importType === 'employes' ? 'employé(s)' : importType === 'articles' ? 'article(s)' : 'chantier(s)'} importé(s)`);
    } catch (err) {
      setResult('❌ Erreur lors de l\'import');
    }
    setImporting(false);
  };

  const tpl = TEMPLATES[importType];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%', flex: 1, padding: 16 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#11181C' }}>📥 Import Excel</Text>
            <Pressable style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' }} onPress={() => { onClose(); setPreview(null); setResult(null); }}>
              <Text style={{ fontSize: 14, color: '#687076', fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>

          {/* Type d'import */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
            {(['employes', 'articles', 'chantiers'] as ImportType[]).map(t => (
              <Pressable key={t}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: importType === t ? '#2C2C2C' : '#F5EDE3', borderWidth: 1, borderColor: importType === t ? '#2C2C2C' : '#E2E6EA' }}
                onPress={() => { setImportType(t); setPreview(null); setResult(null); }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: importType === t ? '#fff' : '#687076' }}>{TEMPLATES[t].label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={{ fontSize: 12, color: '#687076', marginBottom: 8 }}>{tpl.description}</Text>

          {/* Colonnes attendues */}
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#2C2C2C', marginBottom: 4 }}>Colonnes attendues :</Text>
          <Text style={{ fontSize: 11, color: '#687076', marginBottom: 10 }}>{tpl.colonnes.join(' | ')}</Text>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <Pressable style={{ flex: 1, backgroundColor: '#EBF0FF', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
              onPress={handleDownloadTemplate}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C2C2C' }}>⬇ Télécharger modèle</Text>
            </Pressable>
            <Pressable style={{ flex: 1, backgroundColor: '#2C2C2C', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
              onPress={handlePickFile}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>📂 Charger un fichier</Text>
            </Pressable>
          </View>

          {/* Résultat */}
          {result && (
            <View style={{ backgroundColor: result.startsWith('✓') ? '#D4EDDA' : '#F8D7DA', padding: 10, borderRadius: 8, marginBottom: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: result.startsWith('✓') ? '#155724' : '#721C24' }}>{result}</Text>
            </View>
          )}

          {/* Preview */}
          {preview && preview.length > 0 && (
            <>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#11181C', marginBottom: 6 }}>Aperçu ({preview.length} lignes)</Text>
              <ScrollView style={{ maxHeight: 200, marginBottom: 10 }}>
                <ScrollView horizontal>
                  <View>
                    {/* Header */}
                    <View style={{ flexDirection: 'row', backgroundColor: '#2C2C2C', borderRadius: 4 }}>
                      {Object.keys(preview[0]).map(key => (
                        <Text key={key} style={{ width: 100, paddingHorizontal: 6, paddingVertical: 4, fontSize: 10, fontWeight: '700', color: '#fff' }} numberOfLines={1}>{key}</Text>
                      ))}
                    </View>
                    {/* Rows */}
                    {preview.slice(0, 10).map((row, i) => (
                      <View key={i} style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#E2E6EA', backgroundColor: i % 2 === 0 ? '#FAFBFC' : '#fff' }}>
                        {Object.values(row).map((val, j) => (
                          <Text key={j} style={{ width: 100, paddingHorizontal: 6, paddingVertical: 4, fontSize: 10, color: '#11181C' }} numberOfLines={1}>{String(val)}</Text>
                        ))}
                      </View>
                    ))}
                    {preview.length > 10 && (
                      <Text style={{ fontSize: 10, color: '#687076', padding: 6 }}>... et {preview.length - 10} autres lignes</Text>
                    )}
                  </View>
                </ScrollView>
              </ScrollView>

              <Pressable
                style={{ backgroundColor: '#27AE60', paddingVertical: 12, borderRadius: 10, alignItems: 'center', opacity: importing ? 0.5 : 1 }}
                onPress={handleImport}
                disabled={importing}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>
                  {importing ? 'Import en cours...' : `Importer ${preview.length} ${tpl.label.split(' ')[1] || 'éléments'}`}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
