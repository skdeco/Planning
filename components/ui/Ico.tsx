/**
 * Ico — remplace un emoji utilisé comme icône par l'icône Lucide équivalente
 * (trait fin, couleur du thème). `e` est l'emoji d'origine : le remplacement a été fait
 * en masse, garder la correspondance ici évite de toucher à chaque écran.
 */
import React from 'react';
import {
  FileText, Trash2, Camera, Pencil, Ruler, StickyNote, CalendarDays, HardHat, Image as ImageIcon, IdCard,
  CircleCheck, TriangleAlert, Building2, Paperclip, Download, ChartBar, Eye, EyeOff, Folder, Zap, AlarmClock,
  ClipboardList, Handshake, ShoppingCart, User, Users, MessageCircle, Wrench, MapPin, Package, Video, Wallet,
  Target, Receipt, Siren, PenLine, Bell, Phone, Mail, Mic, Inbox, Euro, Store, Sun, Hospital, Square, SquareCheck,
  Send, Plus, ArrowDown, Circle, type LucideIcon,
} from 'lucide-react-native';
import { DS } from '@/constants/design';

const MAP: Record<string, LucideIcon> = {
  '📄': FileText, '🗑': Trash2, '📷': Camera, '📸': Camera, '✏': Pencil, '📐': Ruler, '📝': StickyNote, '📅': CalendarDays,
  '👷': HardHat, '🖼': ImageIcon, '🪪': IdCard, '✅': CircleCheck, '⚠': TriangleAlert, '🏗': Building2, '📎': Paperclip,
  '📥': Download, '📊': ChartBar, '👁': Eye, '🙈': EyeOff, '📁': Folder, '📂': Folder, '⚡': Zap, '⏰': AlarmClock,
  '📋': ClipboardList, '🤝': Handshake, '🛒': ShoppingCart, '👤': User, '👥': Users, '💬': MessageCircle, '🔧': Wrench,
  '📍': MapPin, '📦': Package, '🎥': Video, '💰': Wallet, '💶': Euro, '🎯': Target, '🧾': Receipt, '🚨': Siren, '✍': PenLine,
  '🔔': Bell, '📞': Phone, '✉': Mail, '🎤': Mic, '📭': Inbox, '🏪': Store, '🏖': Sun, '🏥': Hospital, '⬛': Square, '☑': SquareCheck,
  '➤': Send, '➕': Plus, '⬇': ArrowDown, '🔴': Circle,
};

export function Ico({ e, size = 16, color }: { e: string; size?: number; color?: string }) {
  const key = e.replace(/️/g, '');
  const Icon = MAP[key] ?? Circle;
  const c = color ?? (key === '🗑' || key === '🔴' || key === '🚨' ? DS.error : key === '⚠' ? DS.warning : key === '✅' ? DS.success : DS.primary);
  return <Icon size={size} color={c} strokeWidth={1.9} />;
}
