/**
 * DateInput — champ de saisie de date au format français JJ/MM/AAAA.
 * `value` et `onChangeDate` restent en `YYYY-MM-DD` (format de stockage) :
 * il remplace un <TextInput> de date sans rien changer d'autre dans l'écran.
 */
import React, { useEffect, useRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { formatDateFR, masqueDateFR, parseDateFR } from '@/lib/date/format';

export interface DateInputProps extends Omit<TextInputProps, 'value' | 'onChangeText' | 'onChange'> {
  /** Date au format de stockage `YYYY-MM-DD` (ou chaîne vide). */
  value: string;
  /** Reçoit `YYYY-MM-DD` dès que la saisie est une date valide, ou `''` si le champ est vidé. */
  onChangeDate: (ymd: string) => void;
}

export function DateInput({ value, onChangeDate, placeholder = 'JJ/MM/AAAA', onBlur, ...rest }: DateInputProps) {
  const [texte, setTexte] = useState(() => formatDateFR(value));
  const dernierEmis = useRef(value || '');

  // Valeur changée de l'extérieur (auto-remplissage, réinitialisation du formulaire…)
  useEffect(() => {
    if ((value || '') !== dernierEmis.current) {
      dernierEmis.current = value || '';
      setTexte(formatDateFR(value));
    }
  }, [value]);

  return (
    <TextInput
      {...rest}
      value={texte}
      placeholder={placeholder}
      keyboardType="numbers-and-punctuation"
      autoCapitalize="none"
      autoCorrect={false}
      maxLength={10}
      onChangeText={saisie => {
        const t = masqueDateFR(saisie);
        setTexte(t);
        if (t === '') { dernierEmis.current = ''; onChangeDate(''); return; }
        const ymd = parseDateFR(t);
        if (ymd && t.length >= 8) { dernierEmis.current = ymd; onChangeDate(ymd); }
      }}
      onBlur={e => {
        // À la sortie du champ : on remet en forme, ou on revient à la dernière date valide.
        const ymd = parseDateFR(texte);
        if (ymd) { dernierEmis.current = ymd; onChangeDate(ymd); setTexte(formatDateFR(ymd)); }
        else setTexte(formatDateFR(dernierEmis.current));
        onBlur?.(e);
      }}
    />
  );
}
