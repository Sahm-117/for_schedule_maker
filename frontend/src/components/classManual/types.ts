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
  /** Show the reference above the verse instead of below it. */
  refFirst?: boolean;
  /** Export marker: the reference was already quoted in the caption above. Not rendered. */
  dupRef?: boolean;
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

// Faith Project Guide item types.
export interface ManualSmartItem {
  type: 'smart';
  letter: string;
  rest: string;
  text: string;
  exLabel: string;
  who?: ManualSpeaker;
  example: string;
}

export interface ManualExampleItem {
  type: 'example';
  tone: 'good' | 'bad';
  label: string;
  text: string;
}

export interface ManualNumListItem {
  type: 'numlist';
  steps: Array<{ num: string; text: string; lead?: string }>;
}

export interface ManualTableItem {
  type: 'table';
  /** [row label heading, column A, column B, column C] */
  head: string[];
  rows: string[][];
}

export interface ManualConfessionItem {
  type: 'confession';
  paras: string[];
}

export interface ManualShoutItem {
  type: 'shout';
  text: string;
}

export type ManualItem =
  | ManualHeadingItem
  | ManualCaptionItem
  | ManualSpeechItem
  | ManualScriptureItem
  | ManualCalloutItem
  | ManualListItem
  | ManualRefListItem
  | ManualSmartItem
  | ManualExampleItem
  | ManualNumListItem
  | ManualTableItem
  | ManualConfessionItem
  | ManualShoutItem;

export interface ManualPanel {
  /** A ManualSceneName for Class 1; later manuals name scenes in their own `art.scenes`. */
  scene?: string;
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
  /** Chapter this entry opens, when it isn't simply the entry's position. */
  chapter?: number;
}

export interface ManualCover {
  org: string;
  series: string;
  title: string;
  subtitle?: string;
  objectiveLabel?: string;
  objective?: string;
  /** e.g. "Main Text: (Luke 11: 1-13)", shown under the objective. */
  mainText?: string;
  /** A short tilted banner line between the cover and the outline. */
  tagline?: string;
  outlineLabel: string;
  outline: ManualOutlineEntry[];
}

/** A manual's own illustrations. Class 1 has none and uses ClassManualArt.ts. */
export interface ManualArt {
  defs: string;
  cover: string;
  endCard: string;
  scenes: Record<string, string>;
}

export interface ManualContent {
  id: string;
  classLabel: string;
  cover: ManualCover;
  /** Closing card after the last chapter. */
  closing?: { text: string; signoff: string };
  chapters: ManualChapter[];
  art?: ManualArt;
}
