// Shared content shape for the Class Manual reader. One ManualContent per class (Class 1-10),
// so the reader component (ClassManualReader.tsx) can stay generic.

export type ManualSpeaker = 'A' | 'B' | 'C' | 'D' | 'E';

export type ManualSceneName =
  | 'sin' | 'dead' | 'law' | 'rescue' | 'love' | 'mercy' | 'gift' | 'newcreation' | 'free'
  | 'family' | 'robe' | 'life' | 'spirit' | 'prayer' | 'mind' | 'heart' | 'seed' | 'walk'
  | 'victory' | 'book' | 'worship' | 'scroll';

export interface ManualHeadingItem {
  type: 'heading';
  text: string;
}

export interface ManualCaptionItem {
  type: 'caption';
  text: string;
}

export interface ManualSpeechItem {
  type: 'speech';
  who?: ManualSpeaker;
  text: string;
}

export interface ManualScriptureItem {
  type: 'scripture';
  text: string;
  ref: string;
}

export interface ManualCalloutItem {
  type: 'callout';
  text: string;
}

export interface ManualListItem {
  type: 'list';
  entries: string[];
}

export interface ManualRefListItem {
  type: 'reflist';
  label: string;
  text: string;
}

export type ManualItem =
  | ManualHeadingItem
  | ManualCaptionItem
  | ManualSpeechItem
  | ManualScriptureItem
  | ManualCalloutItem
  | ManualListItem
  | ManualRefListItem;

export interface ManualPanel {
  scene?: ManualSceneName;
  items: ManualItem[];
}

export interface ManualChapter {
  /** Short tab label shown in the chapter bar, e.g. "1", "S", "A". */
  tab: string;
  title: string;
  panels: ManualPanel[];
}

export interface ManualOutlineEntry {
  num: string;
  text: string;
}

export interface ManualCover {
  org: string;
  series: string;
  title: string;
  objectiveLabel: string;
  objective: string;
  outlineLabel: string;
  outline: ManualOutlineEntry[];
}

export interface ManualContent {
  id: string;
  classLabel: string;
  cover: ManualCover;
  chapters: ManualChapter[];
}
