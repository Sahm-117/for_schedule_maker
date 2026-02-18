import type { PendingChange, Week } from '../types';

export interface ChangeSnapshot {
  time?: string;
  period?: string;
  description?: string;
  labels: string[];
}

export interface PendingChangePreview {
  id: string;
  type: PendingChange['changeType'];
  requesterName: string;
  submittedAt: string;
  weekNumber?: number;
  dayName?: string;
  scopeWeeks: number[];
  isMultiWeek: boolean;
  before?: ChangeSnapshot;
  after?: ChangeSnapshot;
}

type AnyRecord = Record<string, unknown>;

const toObject = (value: unknown): AnyRecord | null => {
  if (!value || typeof value !== 'object') return null;
  return value as AnyRecord;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (typeof item === 'number') return String(item);
      const obj = toObject(item);
      if (obj && typeof obj.name === 'string') return obj.name.trim();
      return '';
    })
    .filter(Boolean);
};

const toNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'number') return item;
      if (typeof item === 'string') {
        const parsed = Number.parseInt(item, 10);
        return Number.isInteger(parsed) ? parsed : null;
      }
      return null;
    })
    .filter((item): item is number => typeof item === 'number');
};

const getStringValue = (obj: AnyRecord | null, key: string): string | undefined => {
  if (!obj) return undefined;
  const value = obj[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

const getLabelNames = (data: AnyRecord | null, baseKey: 'label' | 'oldLabel'): string[] => {
  if (!data) return [];
  const names = toStringArray(data[`${baseKey}Names`]);
  if (names.length > 0) return names;
  const labels = toStringArray(data[`${baseKey}s`]);
  if (labels.length > 0) return labels;

  const ids = toStringArray(data[`${baseKey}Ids`]);
  if (ids.length > 0) {
    return ids.map((id) => `Label ${id.slice(0, 8)}`);
  }
  return [];
};

const buildSnapshot = (
  data: AnyRecord | null,
  options: {
    timeKey: string;
    periodKey: string;
    descriptionKey: string;
    labelBaseKey: 'label' | 'oldLabel';
  }
): ChangeSnapshot | undefined => {
  const time = getStringValue(data, options.timeKey);
  const period = getStringValue(data, options.periodKey);
  const description = getStringValue(data, options.descriptionKey);
  const labels = getLabelNames(data, options.labelBaseKey);

  if (!time && !period && !description && labels.length === 0) return undefined;
  return { time, period, description, labels };
};

export const buildPendingChangePreview = (
  change: PendingChange,
  weeks: Week[]
): PendingChangePreview => {
  const changeData = toObject(change.changeData);
  const scopeWeeks = toNumberArray(changeData?.applyToWeeks);
  const weekNumber = weeks.find((week) => week.id === change.weekId)?.weekNumber;
  const dayName = getStringValue(changeData, 'dayName');

  let before: ChangeSnapshot | undefined;
  let after: ChangeSnapshot | undefined;

  if (change.changeType === 'ADD') {
    after = buildSnapshot(changeData, {
      timeKey: 'time',
      periodKey: 'period',
      descriptionKey: 'description',
      labelBaseKey: 'label',
    });
  }

  if (change.changeType === 'EDIT') {
    before = buildSnapshot(changeData, {
      timeKey: 'oldTime',
      periodKey: 'oldPeriod',
      descriptionKey: 'oldDescription',
      labelBaseKey: 'oldLabel',
    });
    after = buildSnapshot(changeData, {
      timeKey: 'time',
      periodKey: 'period',
      descriptionKey: 'description',
      labelBaseKey: 'label',
    });
  }

  if (change.changeType === 'DELETE') {
    before = buildSnapshot(changeData, {
      timeKey: 'time',
      periodKey: 'period',
      descriptionKey: 'description',
      labelBaseKey: 'label',
    });
  }

  return {
    id: change.id,
    type: change.changeType,
    requesterName: change.user?.name ?? 'Unknown user',
    submittedAt: change.createdAt,
    weekNumber,
    dayName,
    scopeWeeks,
    isMultiWeek: scopeWeeks.length > 0,
    before,
    after,
  };
};
