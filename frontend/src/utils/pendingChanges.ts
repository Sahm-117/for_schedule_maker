import type { PendingChange, User } from '../types';

type UnknownRecord = Record<string, unknown>;

const UNKNOWN_USER: Pick<User, 'id' | 'name' | 'email'> = {
  id: 'unknown',
  name: 'Unknown user',
  email: 'unknown@email.com',
};

const toObject = (value: unknown): UnknownRecord | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as UnknownRecord;
};

const toUser = (value: unknown, fallbackUserId?: string): Pick<User, 'id' | 'name' | 'email'> => {
  const valueAsArray = Array.isArray(value) ? value : [value];
  const candidate = toObject(valueAsArray.find(Boolean));

  return {
    id: (candidate?.id as string | undefined) ?? fallbackUserId ?? UNKNOWN_USER.id,
    name: (candidate?.name as string | undefined) ?? UNKNOWN_USER.name,
    email: (candidate?.email as string | undefined) ?? UNKNOWN_USER.email,
  };
};

export const normalizePendingChange = (change: unknown): PendingChange => {
  const changeObject = toObject(change) ?? {};

  const user = toUser(
    changeObject.user ?? changeObject.User,
    changeObject.userId as string | undefined
  );

  return {
    id: (changeObject.id as string | undefined) ?? `pending_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    weekId: Number(changeObject.weekId ?? 0),
    changeType: (changeObject.changeType as PendingChange['changeType'] | undefined) ?? 'ADD',
    changeData: (changeObject.changeData as Record<string, unknown> | undefined) ?? {},
    userId: (changeObject.userId as string | undefined) ?? user.id,
    user,
    createdAt: (changeObject.createdAt as string | undefined) ?? new Date().toISOString(),
  };
};

export const normalizePendingChanges = (changes: unknown[]): PendingChange[] => {
  return changes.map(normalizePendingChange);
};
