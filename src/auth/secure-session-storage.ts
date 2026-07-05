import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800;

function getWebStorage() {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

async function removeSecureItem(key: string) {
  if (process.env.EXPO_OS === 'web') {
    getWebStorage()?.removeItem(key);
    return;
  }

  const chunkCount = Number(await SecureStore.getItemAsync(`${key}.chunks`));
  if (Number.isInteger(chunkCount) && chunkCount > 0) {
    await Promise.all(
      Array.from({ length: chunkCount }, (_, index) =>
        SecureStore.deleteItemAsync(`${key}.${index}`),
      ),
    );
  }
  await Promise.all([
    SecureStore.deleteItemAsync(`${key}.chunks`),
    SecureStore.deleteItemAsync(key),
  ]);
}

export const secureSessionStorage = {
  async getItem(key: string) {
    if (process.env.EXPO_OS === 'web') return getWebStorage()?.getItem(key) ?? null;

    const chunkCount = Number(await SecureStore.getItemAsync(`${key}.chunks`));
    if (!Number.isInteger(chunkCount) || chunkCount <= 0) {
      return SecureStore.getItemAsync(key);
    }

    const chunks = await Promise.all(
      Array.from({ length: chunkCount }, (_, index) =>
        SecureStore.getItemAsync(`${key}.${index}`),
      ),
    );
    return chunks.every((chunk) => chunk !== null) ? chunks.join('') : null;
  },

  async setItem(key: string, value: string) {
    if (process.env.EXPO_OS === 'web') {
      getWebStorage()?.setItem(key, value);
      return;
    }

    await removeSecureItem(key);
    const chunks = Array.from(
      { length: Math.ceil(value.length / CHUNK_SIZE) },
      (_, index) => value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
    );
    await Promise.all(
      chunks.map((chunk, index) => SecureStore.setItemAsync(`${key}.${index}`, chunk)),
    );
    await SecureStore.setItemAsync(`${key}.chunks`, String(chunks.length));
  },

  async removeItem(key: string) {
    await removeSecureItem(key);
  },
};
