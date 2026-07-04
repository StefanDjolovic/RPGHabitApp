import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import type { StarterClassDefinition } from '@/src/classes/class-catalog';
import {
  getProfileInitials,
  type PlayerProfile,
} from '@/src/database/profile-repository';
import { getRankDefinition, type RankKey } from '@/src/progression/rank-catalog';

type PlayerAvatarProps = {
  activeClass?: StarterClassDefinition | null;
  profile: Pick<PlayerProfile, 'avatarMode' | 'customAvatarUri' | 'nickname'>;
  rankKey?: RankKey;
  size: number;
};

export function PlayerAvatar({
  activeClass = null,
  profile,
  rankKey = 'unawakened',
  size,
}: PlayerAvatarProps) {
  const rank = getRankDefinition(rankKey);
  const radius = Math.max(10, Math.round(size * 0.27));
  const badgeSize = Math.max(18, Math.round(size * 0.3));
  const iconSize = Math.max(11, Math.round(badgeSize * 0.55));

  return (
    <View
      accessibilityLabel={`${profile.nickname}, ${rank.label}${activeClass ? `, ${activeClass.name}` : ''}`}
      accessible
      style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          backgroundColor: `${activeClass?.accent ?? rank.accent}18`,
          borderWidth: 1,
          borderColor: `${activeClass?.accent ?? rank.accent}55`,
          transform: [{ rotate: '4deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          inset: 3,
          borderRadius: Math.max(8, radius - 2),
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backgroundColor: '#11162A',
          borderWidth: 2,
          borderColor: rank.accent,
        }}>
        {profile.avatarMode === 'custom' && profile.customAvatarUri ? (
          <Image
            accessibilityLabel={`${profile.nickname} custom avatar`}
            contentFit="cover"
            source={{ uri: profile.customAvatarUri }}
            style={{ width: '100%', height: '100%' }}
          />
        ) : profile.avatarMode === 'initials' ? (
          <Text
            style={{
              color: rank.accent,
              fontSize: Math.max(12, Math.round(size * 0.3)),
              fontWeight: '900',
            }}>
            {getProfileInitials(profile.nickname)}
          </Text>
        ) : (
          <MaterialCommunityIcons
            color={activeClass?.accent ?? rank.accent}
            name="account"
            size={Math.round(size * 0.55)}
          />
        )}
      </View>

      {activeClass ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: badgeSize,
            height: badgeSize,
            borderRadius: Math.max(6, Math.round(badgeSize * 0.35)),
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0A0E19',
            borderWidth: 1,
            borderColor: activeClass.accent,
          }}>
          <MaterialCommunityIcons color={activeClass.accent} name={activeClass.icon} size={iconSize} />
        </View>
      ) : null}

      <View
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          minWidth: badgeSize,
          height: badgeSize,
          paddingHorizontal: 3,
          borderRadius: Math.max(6, Math.round(badgeSize * 0.35)),
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0A0E19',
          borderWidth: 1,
          borderColor: rank.accent,
        }}>
        <Text style={{ color: rank.accent, fontSize: Math.max(8, Math.round(size * 0.13)), fontWeight: '900' }}>
          {rank.shortLabel}
        </Text>
      </View>
    </View>
  );
}
