/**
 * Système de messagerie privée entre employés/sous-traitants et admin
 */

export interface MessagePrive {
  id: string;
  conversationId: string;  // ID de la conversation (= employeId ou soustraitantId)
  expediteurRole: 'admin' | 'employe' | 'soustraitant';
  expediteurId: string;    // employeId ou soustraitantId ou 'admin'
  expediteurNom: string;   // Nom affiché
  contenu: string;         // Texte du message
  fichiers?: string[];     // Photos/vidéos en base64 ou URL
  createdAt: string;       // ISO datetime
  lu: boolean;             // Lu par le destinataire
  archive: boolean;        // Archivé (mais toujours accessible)
}

export interface ConversationMeta {
  id: string;              // = employeId ou soustraitantId
  type: 'employe' | 'soustraitant';
  nom: string;             // Nom de l'interlocuteur
  dernierMessage?: string; // Extrait du dernier message
  dernierMessageAt?: string;
  nbNonLus: number;        // Messages non lus par l'admin
}
