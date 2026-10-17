import { createContext, useContext } from 'react';

// The shell lets a page's own header draw the section tabs (right under the title). A page that has no
// header keeps the strip the shell draws above it, so no section ever loses its tabs.

export interface SectionTabsValue {
  pathname: string;
  isAdmin: boolean;
  pendingApprovals: number;
  /** A header calls this with true while it shows the tabs itself, and false when it goes away. */
  claim: (owned: boolean) => void;
}

export const SectionTabsContext = createContext<SectionTabsValue | null>(null);

export const useSectionTabs = () => useContext(SectionTabsContext);
