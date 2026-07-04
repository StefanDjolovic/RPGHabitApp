import { Directory, File, Paths } from 'expo-file-system';

function getAvatarDirectory() {
  return new Directory(Paths.document, 'profile-avatars');
}

function getImageExtension(uri: string) {
  const extension = /\.(jpe?g|png|webp|heic)$/i.exec(uri.split('?')[0])?.[0].toLowerCase();
  return extension ?? '.jpg';
}

export function persistProfileAvatar(sourceUri: string) {
  if (process.env.EXPO_OS === 'web') return sourceUri;
  const avatarDirectory = getAvatarDirectory();
  avatarDirectory.create({ idempotent: true, intermediates: true });
  const source = new File(sourceUri);
  const destination = new File(
    avatarDirectory,
    `avatar-${Date.now()}${getImageExtension(sourceUri)}`,
  );
  source.copy(destination);
  return destination.uri;
}

export function deleteStoredProfileAvatar(uri: string | null) {
  if (process.env.EXPO_OS === 'web') return;
  const avatarDirectory = getAvatarDirectory();
  if (!uri || !uri.startsWith(avatarDirectory.uri)) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}
