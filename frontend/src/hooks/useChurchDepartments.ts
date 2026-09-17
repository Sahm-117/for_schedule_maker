import { useEffect, useState } from 'react';
import { DEFAULT_CHURCH_DEPARTMENTS, type ChurchDepartment } from '../constants/departments';
import { settingsApi } from '../services/api';

// The church department list admins manage in Settings. Loaded once and shared
// across screens; Settings calls setChurchDepartmentsCache after saving.

let cache: ChurchDepartment[] | null = null;
let pending: Promise<ChurchDepartment[]> | null = null;
const listeners = new Set<(list: ChurchDepartment[]) => void>();

export const setChurchDepartmentsCache = (list: ChurchDepartment[]) => {
  cache = list;
  listeners.forEach((listener) => listener(list));
};

export const useChurchDepartments = (): ChurchDepartment[] => {
  const [list, setList] = useState<ChurchDepartment[]>(cache ?? DEFAULT_CHURCH_DEPARTMENTS);

  useEffect(() => {
    listeners.add(setList);
    if (!cache) {
      pending = pending ?? settingsApi.getChurchDepartments().catch(() => DEFAULT_CHURCH_DEPARTMENTS);
      void pending.then((loaded) => { pending = null; setChurchDepartmentsCache(loaded); });
    }
    return () => { listeners.delete(setList); };
  }, []);

  return list;
};

/** Options for AppSelect / AppMultiSelect. Keeps any saved value that's no longer on the list. */
export const departmentOptions = (list: ChurchDepartment[], keep: string[] = []) => {
  const names = new Set(list.map((d) => d.name.toLowerCase()));
  const extra = keep.filter((name) => name && !names.has(name.toLowerCase())).map((name) => ({ value: name, label: name, meta: 'Not on the current list' }));
  return [...list.map((d) => ({ value: d.name, label: d.name, meta: d.description })), ...extra];
};
