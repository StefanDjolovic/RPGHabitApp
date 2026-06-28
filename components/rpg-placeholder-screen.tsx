import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
  eyebrow: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent?: string;
};

export function RpgPlaceholderScreen({
  title,
  eyebrow,
  description,
  icon,
  accent = '#63DFFF',
}: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.glow} />
      <View style={styles.content}>
        <Text style={[styles.eyebrow, { color: accent }]}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <LinearGradient colors={['#17162E', '#0B1222']} style={styles.card}>
          <View style={[styles.iconWrap, { borderColor: `${accent}66` }]}>
            <MaterialCommunityIcons name={icon} size={44} color={accent} />
          </View>
          <Text style={styles.cardTitle}>System module locked</Text>
          <Text style={styles.description}>{description}</Text>
          <View style={[styles.statusPill, { borderColor: `${accent}55` }]}>
            <View style={[styles.statusDot, { backgroundColor: accent }]} />
            <Text style={[styles.statusText, { color: accent }]}>COMING IN NEXT PHASE</Text>
          </View>
        </LinearGradient>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050711' },
  glow: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#5E2B97',
    opacity: 0.12,
  },
  content: { flex: 1, paddingHorizontal: 22, paddingTop: 34 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#F3F0FF', fontSize: 32, fontWeight: '900', marginTop: 5 },
  card: {
    marginTop: 30,
    padding: 28,
    borderRadius: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#303052',
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0D1C',
    borderWidth: 1,
  },
  cardTitle: { color: '#ECEAFF', fontSize: 18, fontWeight: '800', marginTop: 24 },
  description: {
    color: '#858CA8',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
  },
  statusPill: {
    marginTop: 24,
    height: 30,
    paddingHorizontal: 13,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
});
