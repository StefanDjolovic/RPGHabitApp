import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

type AccountActionRowProps = {
  accent: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
};

export function AccountActionRow({
  accent,
  icon,
  title,
  description,
  onPress,
  disabled = false,
  loading = false,
  destructive = false,
}: AccountActionRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        destructive && styles.destructiveRow,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.icon, { borderColor: `${accent}66` }]}>
        {loading ? (
          <ActivityIndicator color={accent} size="small" />
        ) : (
          <MaterialCommunityIcons color={accent} name={icon} size={21} />
        )}
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, destructive && styles.destructiveTitle]}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <MaterialCommunityIcons color="#778198" name="chevron-right" size={21} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 11,
    borderRadius: 8,
    backgroundColor: '#0D111D',
    borderWidth: 1,
    borderColor: '#293047',
  },
  destructiveRow: {
    backgroundColor: '#1A0E14',
    borderColor: '#59303A',
  },
  icon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
  },
  body: { flex: 1, minWidth: 0 },
  title: { color: '#ECEAF6', fontSize: 12, fontWeight: '900' },
  destructiveTitle: { color: '#FF9EAA' },
  description: { color: '#7E879E', fontSize: 9, fontWeight: '700', lineHeight: 13, marginTop: 3 },
  disabled: { opacity: 0.38 },
  pressed: { opacity: 0.72 },
});
