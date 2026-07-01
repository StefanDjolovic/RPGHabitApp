import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';

import type { HabitAttribute } from '@/src/database/habit-repository';
import type { AttributeProgression } from '@/src/progression/attribute-progression';
import {
  getRadarPoints,
  RADAR_ATTRIBUTES,
  type RadarPoint,
} from '@/src/progression/attribute-radar';

const CHART_SIZE = 320;
const CHART_CENTER = CHART_SIZE / 2;
const CHART_RADIUS = 108;

const attributeLabels: Record<HabitAttribute, string> = {
  strength: 'STR',
  intelligence: 'INT',
  discipline: 'DIS',
  vitality: 'VIT',
  creativity: 'CRE',
};

function getRingPoints(ratio: number) {
  return getRadarPoints(
    RADAR_ATTRIBUTES.map(() => ratio),
    CHART_RADIUS,
    CHART_CENTER,
    1,
  );
}

function toSvgPoints(points: RadarPoint[]) {
  return points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

type AttributeRadarChartProps = {
  attributeProgression: Record<HabitAttribute, AttributeProgression>;
  manualStatPoints: Record<HabitAttribute, number>;
};

export function AttributeRadarChart({
  attributeProgression,
  manualStatPoints,
}: AttributeRadarChartProps) {
  const naturalValues = RADAR_ATTRIBUTES.map((attribute) => {
    const progression = attributeProgression[attribute];
    return progression.naturalPoints + progression.progressRatio;
  });
  const manualValues = RADAR_ATTRIBUTES.map((attribute) => manualStatPoints[attribute]);
  const naturalPoints = getRadarPoints(naturalValues, CHART_RADIUS, CHART_CENTER);
  const manualPoints = getRadarPoints(manualValues, CHART_RADIUS, CHART_CENTER);
  const naturalPointTotal = RADAR_ATTRIBUTES.reduce(
    (total, attribute) => total + attributeProgression[attribute].naturalPoints,
    0,
  );
  const naturalXpTotal = RADAR_ATTRIBUTES.reduce(
    (total, attribute) => total + attributeProgression[attribute].totalXp,
    0,
  );
  const manualTotal = manualValues.reduce((total, value) => total + value, 0);
  const axes = getRingPoints(1);
  const labels = getRadarPoints(RADAR_ATTRIBUTES.map(() => 1), CHART_RADIUS + 27, CHART_CENTER, 1);
  const accessibilitySummary = RADAR_ATTRIBUTES.map(
    (attribute) => {
      const progression = attributeProgression[attribute];
      return `${attributeLabels[attribute]} ${progression.naturalPoints} natural points from ${progression.totalXp} XP and ${manualStatPoints[attribute]} allocated points`;
    },
  ).join(', ');

  return (
    <View
      accessibilityLabel={`Attribute balance. ${accessibilitySummary}`}
      accessible
      style={styles.container}>
      <View style={styles.chartWrap}>
        <Svg
          height="100%"
          viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`}
          width="100%">
          {[0.25, 0.5, 0.75, 1].map((ratio) => (
            <Polygon
              key={ratio}
              fill={ratio === 1 ? '#10172A' : 'transparent'}
              points={toSvgPoints(getRingPoints(ratio))}
              stroke={ratio === 1 ? '#3A4463' : '#29314C'}
              strokeWidth={ratio === 1 ? 1.5 : 1}
            />
          ))}

          {axes.map((point, index) => (
            <Line
              key={RADAR_ATTRIBUTES[index]}
              stroke="#29314C"
              strokeWidth={1}
              x1={CHART_CENTER}
              x2={point.x}
              y1={CHART_CENTER}
              y2={point.y}
            />
          ))}

          <Polygon
            fill="#67D7FF"
            fillOpacity={0.18}
            points={toSvgPoints(naturalPoints)}
            stroke="#67D7FF"
            strokeWidth={2.5}
          />
          {naturalPoints.map((point, index) => (
            <Circle
              key={`natural-${RADAR_ATTRIBUTES[index]}`}
              cx={point.x}
              cy={point.y}
              fill="#07131E"
              r={3.5}
              stroke="#8EE8FF"
              strokeWidth={2}
            />
          ))}

          <Polygon
            fill="#F08ABD"
            fillOpacity={manualTotal > 0 ? 0.14 : 0}
            points={toSvgPoints(manualPoints)}
            stroke="#F08ABD"
            strokeDasharray="5 4"
            strokeWidth={2.5}
          />
          {manualPoints.map((point, index) => (
            <Circle
              key={`manual-${RADAR_ATTRIBUTES[index]}`}
              cx={point.x}
              cy={point.y}
              fill="#F08ABD"
              r={manualValues[index] > 0 ? 3.5 : 2}
            />
          ))}

          {labels.map((point, index) => (
            <SvgText
              key={`label-${RADAR_ATTRIBUTES[index]}`}
              fill="#AEB8D2"
              fontSize={10}
              fontWeight="800"
              textAnchor="middle"
              x={point.x}
              y={point.y + 4}>
              {attributeLabels[RADAR_ATTRIBUTES[index]]}
            </SvgText>
          ))}
        </Svg>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.naturalSwatch]} />
          <View>
            <Text style={styles.legendLabel}>NATURAL</Text>
            <Text style={styles.legendValue}>
              {naturalPointTotal.toLocaleString()} PTS | {naturalXpTotal.toLocaleString()} XP
            </Text>
          </View>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.manualSwatch]} />
          <View>
            <Text style={styles.legendLabel}>ALLOCATED</Text>
            <Text style={styles.legendValue}>{manualTotal.toLocaleString()} PTS</Text>
          </View>
        </View>
      </View>
      <Text style={styles.caption}>Shapes compare distribution, while totals keep both scales clear.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#28304A',
    backgroundColor: 'rgba(10, 14, 28, 0.94)',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    marginBottom: 12,
  },
  chartWrap: {
    width: '100%',
    maxWidth: 340,
    aspectRatio: 1,
    alignSelf: 'center',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    columnGap: 24,
    rowGap: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', minWidth: 120 },
  legendSwatch: { width: 18, height: 3, marginRight: 9 },
  naturalSwatch: { backgroundColor: '#67D7FF' },
  manualSwatch: { backgroundColor: '#F08ABD' },
  legendLabel: { color: '#7E88A4', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  legendValue: { color: '#EDF2FF', fontSize: 12, fontWeight: '900', marginTop: 2 },
  caption: {
    color: '#69738E',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 12,
  },
});
