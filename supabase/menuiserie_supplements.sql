-- Suppléments de devis Menuiserie (appliqué en prod le 05/10/2026, migration « mn_supplements »)
-- Table mn_supplements : admin tout ; client lecture sur ses chantiers.
-- RPC mn_supplement_repondre(p_id, p_ok, p_commentaire) : le client accepte ou refuse un supplément proposé.

-- 05/10/2026 « Devis / Facture » (appliqué en prod) :
-- mn_montants : colonnes montant_ttc numeric, document_id uuid ; types facture_client, facture_usine, reglement_usine ;
--   politique usine_ecriture : l'usine peut saisir facture_usine, jamais reglement_usine.
-- mn_supplements : colonnes cote ('client'|'usine'), usine_id, montant_ttc, document_id ;
--   politiques usine_lecture / usine_proposer / usine_retirer ; client_lecture limitée à cote = 'client'.
-- mn_supplement_repondre : le client ne répond qu'aux suppléments côté client.
