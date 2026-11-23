/**
 * 设备身份 + 本地档案备份。
 *
 * 为什么需要：服务端以前按"谁还没建档"分配 A/B，结果同一台手机重连后
 * 可能被分到另一个角色——那份档案是空的，于是「建档」弹窗又冒出来，
 * 本地已建好的档案还被服务端的空档案盖掉（真实事故）。
 *
 * 现在这台设备有自己的 clientId，服务端按 clientId 认人；角色跟着设备走。
 * 另外把"最后一次建好的档案"单独存一份，即使服务端丢了也能一键推回去。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Gender, Role } from './types';

const CLIENT_ID_KEY = 'twospace::client-id';
const ROLE_KEY = 'twospace::device-role';
const PROFILE_KEY = 'twospace::profile-backup';

export interface DeviceIdentity {
  /** 这台设备的稳定 ID（首次启动生成，之后一直用它认人） */
  clientId: string;
  /** 上次分配到的角色（可能为 null：第一次连服务器之前） */
  role: Role | null;
}

export interface ProfileBackup {
  name: string;
  birthDate: string | null;
  gender: Gender | null;
  avatarUri: string | null;
  savedAt: number;
}

function newClientId(): string {
  return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadDeviceIdentity(): Promise<DeviceIdentity> {
  try {
    const [id, role] = await Promise.all([
      AsyncStorage.getItem(CLIENT_ID_KEY),
      AsyncStorage.getItem(ROLE_KEY),
    ]);
    let clientId = id && id.trim() ? id.trim() : '';
    if (!clientId) {
      clientId = newClientId();
      await AsyncStorage.setItem(CLIENT_ID_KEY, clientId);
    }
    return { clientId, role: role === 'A' || role === 'B' ? (role as Role) : null };
  } catch {
    // 存不进去也要能用：这次会话用临时 ID
    return { clientId: newClientId(), role: null };
  }
}

export async function saveDeviceRole(role: Role): Promise<void> {
  try {
    await AsyncStorage.setItem(ROLE_KEY, role);
  } catch {
    // 忽略
  }
}

export async function loadProfileBackup(): Promise<ProfileBackup | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProfileBackup>;
    if (!parsed || typeof parsed.name !== 'string' || !parsed.name.trim()) return null;
    return {
      name: parsed.name,
      birthDate: typeof parsed.birthDate === 'string' ? parsed.birthDate : null,
      gender:
        parsed.gender === 'female' || parsed.gender === 'male' || parsed.gender === 'other'
          ? parsed.gender
          : null,
      avatarUri: typeof parsed.avatarUri === 'string' ? parsed.avatarUri : null,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export async function saveProfileBackup(profile: Omit<ProfileBackup, 'savedAt'>): Promise<void> {
  try {
    if (!profile.name.trim()) return;
    const payload: ProfileBackup = { ...profile, savedAt: Date.now() };
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(payload));
  } catch {
    // 忽略
  }
}

export async function clearProfileBackup(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PROFILE_KEY);
  } catch {
    // 忽略
  }
}
