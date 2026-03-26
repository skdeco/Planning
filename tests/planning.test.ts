import { describe, it, expect } from 'vitest';
import { METIER_COLORS, STATUT_LABELS, STATUT_COLORS } from '../app/types';

// ─── Fonctions utilitaires (copiées depuis planning.tsx) ──────────────────────
function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toYMD(date: Date): string {
  return date.toISOString().split('T')[0];
}

function dateInRange(date: Date, start: string, end: string): boolean {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const s = new Date(start); s.setHours(0, 0, 0, 0);
  const e = new Date(end); e.setHours(0, 0, 0, 0);
  return d.getTime() >= s.getTime() && d.getTime() <= e.getTime();
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('dateInRange', () => {
  it('retourne true pour une date dans la plage', () => {
    const d = new Date('2026-03-20');
    expect(dateInRange(d, '2026-03-19', '2026-03-22')).toBe(true);
  });

  it('retourne true pour la date de début', () => {
    const d = new Date('2026-03-19');
    expect(dateInRange(d, '2026-03-19', '2026-03-22')).toBe(true);
  });

  it('retourne true pour la date de fin', () => {
    const d = new Date('2026-03-22');
    expect(dateInRange(d, '2026-03-19', '2026-03-22')).toBe(true);
  });

  it('retourne false pour une date avant la plage', () => {
    const d = new Date('2026-03-18');
    expect(dateInRange(d, '2026-03-19', '2026-03-22')).toBe(false);
  });

  it('retourne false pour une date après la plage', () => {
    const d = new Date('2026-03-23');
    expect(dateInRange(d, '2026-03-19', '2026-03-22')).toBe(false);
  });
});

describe('addDays', () => {
  it('ajoute correctement des jours', () => {
    const d = new Date('2026-03-16');
    expect(toYMD(addDays(d, 6))).toBe('2026-03-22');
  });

  it('soustrait correctement des jours', () => {
    const d = new Date('2026-03-22');
    expect(toYMD(addDays(d, -6))).toBe('2026-03-16');
  });
});

describe('METIER_COLORS', () => {
  it('contient toutes les couleurs de métiers', () => {
    const metiers = ['electricien', 'plombier', 'macon', 'peintre', 'menuisier', 'plaquiste', 'carreleur', 'chef_chantier', 'autre'];
    metiers.forEach(m => {
      expect(METIER_COLORS).toHaveProperty(m);
      expect(METIER_COLORS[m as keyof typeof METIER_COLORS]).toHaveProperty('color');
      expect(METIER_COLORS[m as keyof typeof METIER_COLORS]).toHaveProperty('label');
    });
  });
});

describe('STATUT_LABELS', () => {
  it('contient tous les statuts', () => {
    expect(STATUT_LABELS.actif).toBe('Actif');
    expect(STATUT_LABELS.en_attente).toBe('En attente');
    expect(STATUT_LABELS.termine).toBe('Terminé');
    expect(STATUT_LABELS.en_pause).toBe('En pause');
  });
});

describe('STATUT_COLORS', () => {
  it('contient des couleurs pour chaque statut', () => {
    const statuts = ['actif', 'en_attente', 'termine', 'en_pause'];
    statuts.forEach(s => {
      expect(STATUT_COLORS).toHaveProperty(s);
      expect(STATUT_COLORS[s as keyof typeof STATUT_COLORS]).toHaveProperty('bg');
      expect(STATUT_COLORS[s as keyof typeof STATUT_COLORS]).toHaveProperty('text');
    });
  });
});
