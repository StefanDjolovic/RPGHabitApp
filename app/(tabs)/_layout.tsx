import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Redirect, Tabs, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { getPlayerProfile } from '@/src/database/profile-repository';

const activeColor = '#6DDEFF';
const inactiveColor = '#666D87';

export default function TabLayout() {
  const db = useSQLiteContext();
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void getPlayerProfile(db).then((profile) => {
      if (active) setOnboardingCompleted(profile.onboardingCompleted);
    });
    return () => {
      active = false;
    };
  }, [db]);

  if (onboardingCompleted === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050711' }}>
        <ActivityIndicator color="#6DDEFF" />
      </View>
    );
  }

  if (!onboardingCompleted) {
    return <Redirect href={'/onboarding' as Href} />;
  }

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
