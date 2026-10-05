// Lit un devis ou une facture PDF déposé dans l'espace Menuiserie et renvoie ses montants HT et TTC.
//  - devis émis par SK DECO (français, « SKDECO » / « SKDECO M ») → vente client ;
//  - autre devis (usine, portugais ou autre format) → achat usine.
// L'accès au document est vérifié avec la session de l'appelant (RLS de mn_documents).
import { createClient } from "npm:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/** Analyse d'un devis (texte) : émetteur SK DECO ? montant total HT. */
function parseMontant(s) {
  let t = s.replace(/[\s\u00a0\u202f]/g, '');
  const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, '');
  } else if (lastComma > -1) {
    t = /,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
  } else if (lastDot > -1) {
    if (!/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
  }
  const n = parseFloat(t);
  return isFinite(n) ? n : null;
}
const NOMBRE = String.raw`(\d{1,3}(?:[ \u00a0\u202f.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
const LIBELLES = [
  // français
  String.raw`total\s*(?:g[ée]n[ée]ral\s*)?(?:net\s*)?h\.?\s*t\.?(?:\s*net)?`, String.raw`montant\s*(?:total\s*)?h\.?\s*t\.?`, String.raw`net\s*[àa]\s*payer\s*h\.?\s*t\.?`,
  // portugais
  String.raw`total\s*(?:s\s*\/\s*|sem\s*)iva`, String.raw`valor\s*(?:total\s*)?(?:s\s*\/\s*|sem\s*)iva`, String.raw`total\s*il[íi]quido`, String.raw`total\s*l[íi]quido`, String.raw`base\s*(?:de\s*)?incid[êe]ncia`, String.raw`total\s*mercadoria`,
  // anglais
  String.raw`total\s*(?:excl\.?|excluding|before)\s*(?:vat|tax)`, String.raw`net\s*total`,
];
const SECOURS = [String.raw`sub\s*-?\s*total`, String.raw`subtotal`];
const LIBELLES_TTC = [
  String.raw`total\s*(?:g[ée]n[ée]ral\s*)?t\.?\s*t\.?\s*c\.?`, String.raw`montant\s*(?:total\s*)?t\.?\s*t\.?\s*c\.?`, String.raw`net\s*[àa]\s*payer(?!\s*h\.?\s*t)`,
  String.raw`total\s*(?:c\s*\/\s*|com\s*)iva`, String.raw`total\s*a\s*pagar`, String.raw`valor\s*a\s*pagar`,
  String.raw`total\s*(?:incl\.?|including)\s*(?:vat|tax)`,
];
const LIBELLES_TVA = [String.raw`(?:total\s*)?t\.?\s*v\.?\s*a\.?(?:\s*[àa]?\s*\d{1,2}(?:[.,]\d{1,2})?\s*%)?`, String.raw`(?:total\s*)?iva(?:\s*\d{1,2}(?:[.,]\d{1,2})?\s*%)?`];
const dernier = (c) => { const e = c.filter(x => x.euro); const l = (e.length ? e : c).sort((a, b) => a.pos - b.pos); return l[l.length - 1] || null; };

function chercher(texte, libelles) {
  const res = [];
  for (const lib of libelles) {
    const re = new RegExp(String.raw`(?<![a-zà-ÿ\-])(?:${lib})\s*[:\-–]?\s*(€|eur)?\s*` + NOMBRE + String.raw`\s*(€|eur|euros)?`, 'gi');
    let m;
    while ((m = re.exec(texte))) {
      const avant = texte.slice(Math.max(0, m.index - 6), m.index).toLowerCase();
      if (/sous[\s-]*$/.test(avant)) continue; // « sous-total »
      const n = parseMontant(m[2]);
      if (n == null || n < 1) continue;
      res.push({ n, euro: !!(m[1] || m[3]), pos: m.index, extrait: m[0].trim() });
    }
  }
  return res;
}

function analyserDevis(texte) {
  const t = texte.replace(/\s+/g, ' ');
  const portugais = /\b(or[çc]amento|iva|quantidade|pre[çc]o|descri[çc][ãa]o)\b/i.test(t);
  // Émis par SK DECO : son RCS, ou un « devis SK DECO / SKDECO M » rédigé en français
  const skdeco = /813\s*532\s*876/.test(t)
    || (!portugais && /sk\s*-?\s*deco/i.test(t) && /devis\b.{0,80}sk\s*-?\s*deco|sk\s*-?\s*deco\s*m?\b.{0,40}devis|skdeco\s*m\b/i.test(t));
  let c = chercher(t, LIBELLES);
  if (!c.length) c = chercher(t, SECOURS);
  const choix = dernier(c);
  const ht = choix?.n ?? null;
  // TTC : écrit sur le devis, sinon HT + montant de TVA s'il est indiqué
  let ttc = dernier(chercher(t, LIBELLES_TTC))?.n ?? null;
  if (ttc != null && ht != null && ttc < ht) ttc = null;
  if (ttc == null && ht != null) {
    const tva = dernier(chercher(t, LIBELLES_TVA).filter(x => x.n > 0 && x.n <= ht * 0.25))?.n;
    if (tva) ttc = Math.round((ht + tva) * 100) / 100;
  }
  return { emetteur: skdeco ? 'skdeco' : 'autre', langue: portugais && !skdeco ? 'pt' : 'fr', montantHT: ht, montantTTC: ttc, extrait: choix?.extrait ?? null };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { chemin } = await req.json();
    if (!chemin || typeof chemin !== "string") return json({ erreur: "chemin manquant" }, 400);
    const url = Deno.env.get("SUPABASE_URL")!;
    const utilisateur = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { data: doc } = await utilisateur.from("mn_documents").select("id, mime").eq("chemin", chemin).maybeSingle();
    if (!doc) return json({ erreur: "document introuvable ou non autorisé" }, 403);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: fichier, error } = await admin.storage.from("menuiserie").download(chemin);
    if (error || !fichier) return json({ erreur: "lecture du fichier impossible" }, 500);
    const octets = new Uint8Array(await fichier.arrayBuffer());
    if (!(doc.mime || "").includes("pdf") && !chemin.toLowerCase().endsWith(".pdf")) return json({ montantHT: null, raison: "pas un PDF" });
    const pdf = await getDocumentProxy(octets);
    const { text } = await extractText(pdf, { mergePages: true });
    const texte = Array.isArray(text) ? text.join(" ") : text;
    if (!texte || texte.trim().length < 20) return json({ montantHT: null, raison: "PDF sans texte (scan)" });
    return json(analyserDevis(texte));
  } catch (e) {
    return json({ erreur: (e as Error).message }, 500);
  }
});
