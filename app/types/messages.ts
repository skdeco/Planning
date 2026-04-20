/**
 * Système de messagerie privée entre employés/sous-traitants et admin
 */

export interface MessagePrive {
  id: string;
  conversationId: string;  // ID de la conversation (= employeId ou soustraitantId, ou 'groupe_*')
  expediteurRole: 'admin' | 'employe' | 'soustraitant';
  expediteurId: string;    // employeId ou soustraitantId ou 'admin'
  expediteurNom: string;   // Nom affiché
  contenu: string;         // Texte du message
  chantierId?: string;     // Chantier lié au message (contexte)
  fichiers?: string[];     // Photos/vidéos en base64 ou URL
  createdAt: string;       // ISO datetime
  scheduledAt?: string;    // ISO datetime — message différé (visible à partir de cette date)
  lu: boolean;             // Lu par le destinataire
  archive: boolean;        // Archivé (mais toujours accessible)
  // Réponse à un message (citation)
  replyToId?: string;      // ID du message cité
  replyToContenu?: string; // Extrait du message cité
  replyToNom?: string;     // Nom de l'auteur du message cité
  // Accusé de lecture
  luAt?: string;           // ISO datetime — horodatage de la lecture
  luPar?: string[];        // IDs des personnes ayant lu (pour messages de groupe)
  // Messages vocaux
  audioUri?: string;       // base64 URI ou URL de l'enregistrement vocal
  audioDuration?: number;  // durée en secondes
  // Messages de groupe
  isGroupe?: boolean;      // true = message diffusé à un groupe
  groupeType?: 'equipe' | 'chantier'; // type de groupe
  groupeChantierId?: string; // chantier concerné (si groupeType === 'chantier')
  destinataireIds?: string[]; // IDs des destinataires du message de groupe
}

export interface ConversationMeta {
  id: string;              // = employeId ou soustraitantId ou 'groupe_*'
  type: 'employe' | 'soustraitant' | 'groupe';
  nom: string;             // Nom de l'interlocuteur ou du groupe
  dernierMessage?: string; // Extrait du dernier message
  dernierMessageAt?: string;
  nbNonLus: number;        // Messages non lus par l'admin
}
