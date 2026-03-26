// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  // Planning
  "calendar": "calendar-today",
  "calendar.badge.clock": "event",
  // Chantiers
  "building.2.fill": "business",
  "hammer.fill": "construction",
  // Équipe
  "person.3.fill": "group",
  "person.2.fill": "people",
  // Actions
  "plus": "add",
  "pencil": "edit",
  "trash": "delete",
  "eye": "visibility",
  "chevron.left": "chevron-left",
  "xmark": "close",
  "checkmark": "check",
  "mappin": "location-on",
  "clock": "access-time",
  "clock.fill": "access-time",
  // Reporting
  "chart.bar.fill": "bar-chart",
  // Sous-traitants
  "wrench.and.screwdriver.fill": "handyman",
  // Finances
  "eurosign.circle.fill": "euro",
  // Matériel
  "cart.fill": "shopping-cart",
  // RH
  "person.badge.clock.fill": "badge",
  // Messagerie
  "message.fill": "chat",
  "bubble.left.fill": "chat-bubble",
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
