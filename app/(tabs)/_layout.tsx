import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';

import { HapticTab } from '@/components/haptic-tab';

const activeColor = '#6DDEFF';
const inactiveColor = '#666D87';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarButton: HapticTab,
        tabBarLabelStyle: { fontSize: 9, fontWeight: '700', marginTop: 2 },
        tabBarStyle: {
          position: 'absolute',
          height: 70,
          paddingTop: 8,
          paddingBottom: 8,
          backgroundColor: '#090C18',
          borderTopColor: '#20253B',
          borderTopWidth: 1,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="view-dashboard" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="quests"
        options={{
          title: 'Quests',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="sword-cross" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="dungeon"
        options={{
          title: 'Dungeon',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name="gate"
              size={focused ? 29 : 26}
              color={focused ? '#AA8AFF' : color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="treasure-chest" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="account-circle" size={24} color={color} />,
        }}
      />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
