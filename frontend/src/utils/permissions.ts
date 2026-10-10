// Roles and permissions (phase 1: hides menus, pages and buttons; the database does not enforce it yet).
// The module keys below are the same list as perm_module_keys() in
// supabase/migrations/20261013090100_roles_and_permissions.sql. Keep the two in step.

export type ModuleKey =
  | 'dashboard' | 'schedule' | 'planner'
  | 'participants' | 'groups' | 'supports' | 'hubs' | 'cohorts'
  | 'follow_ups' | 'feedback' | 'surveys' | 'corporate_prayers' | 'birthdays' | 'community'
  | 'users' | 'announcements' | 'notifications' | 'practice' | 'resources' | 'website' | 'settings';

export type PermissionAction = 'view' | 'add' | 'edit' | 'delete';

export type ModulePermission = Record<PermissionAction, boolean>;

export interface MyPermissions {
  isAdmin: boolean;
  modules: Partial<Record<ModuleKey, ModulePermission>>;
}

/** One custom role as the Roles screen sees it. `modules` lists only the modules with at least one tick. */
export interface PermissionRole {
  id: string;
  name: string;
  description: string | null;
  /** The built-in Support role: its name and existence are fixed. */
  isSystem: boolean;
  memberCount: number;
  modules: Array<{ module: ModuleKey } & ModulePermission>;
}

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  group: string;
  /** The pages this module covers. The first is where someone lands. */
  paths: string[];
}

// Same order and groups as the admin menu (AppShell adminNavGroups).
export const MODULES: ModuleDef[] = [
  { key: 'dashboard', label: 'Dashboard', group: 'Overview', paths: ['/dashboard'] },
  { key: 'schedule', label: 'Schedule', group: 'Programme', paths: ['/schedule', '/approvals', '/rota', '/activity-overview'] },
  { key: 'planner', label: 'Planner', group: 'Programme', paths: ['/planner'] },
  { key: 'participants', label: 'Participants', group: 'People & groups', paths: ['/participants', '/attendance', '/faith-projects', '/onboarding'] },
  { key: 'groups', label: 'Groups', group: 'People & groups', paths: ['/groups', '/allocation', '/group-prayers', '/group-view'] },
  { key: 'supports', label: 'Supports', group: 'People & groups', paths: ['/supports'] },
  { key: 'hubs', label: 'Hubs', group: 'People & groups', paths: ['/hubs'] },
  { key: 'cohorts', label: 'Cohorts', group: 'People & groups', paths: ['/cohorts'] },
  { key: 'follow_ups', label: 'Follow-ups', group: 'Engagement', paths: ['/follow-ups'] },
  { key: 'feedback', label: 'Feedback', group: 'Engagement', paths: ['/feedback'] },
  { key: 'surveys', label: 'Surveys', group: 'Engagement', paths: ['/surveys'] },
  { key: 'corporate_prayers', label: 'Corporate prayers', group: 'Engagement', paths: ['/corporate-prayers'] },
  { key: 'birthdays', label: 'Birthdays', group: 'Engagement', paths: ['/birthdays'] },
  { key: 'community', label: 'Community', group: 'Engagement', paths: ['/community'] },
  { key: 'users', label: 'Users', group: 'Administration', paths: ['/users'] },
  { key: 'announcements', label: 'Announcements', group: 'Administration', paths: ['/announcements'] },
  { key: 'notifications', label: 'Notifications', group: 'Administration', paths: ['/notifications'] },
  { key: 'practice', label: 'Practice', group: 'Administration', paths: ['/practice'] },
  { key: 'resources', label: 'Resources', group: 'Administration', paths: ['/resources', '/scriptures'] },
  { key: 'website', label: 'Website', group: 'Administration', paths: ['/website'] },
  { key: 'settings', label: 'Settings', group: 'Administration', paths: ['/settings'] },
];

/** The Roles screen is not a grid module: only a real admin can open it. */
export const ROLES_PATH = '/roles';

/** Open to every signed-in staff member, whatever their role. */
const OPEN_PATHS = ['/team-announcements', '/sop-download', '/support'];

/**
 * Admin pages the support screens already link into (group view, group prayers, faith projects, schedule,
 * community, resources, team announcements). A Support keeps these exactly as they have today.
 */
const SUPPORT_KEPT_PATHS = ['/group-view', '/group-prayers', '/faith-projects', '/schedule', '/community', '/resources', '/team-announcements'];

const matchesPath = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

export const moduleForPath = (pathname: string): ModuleKey | null => {
  for (const def of MODULES) {
    if (def.paths.some((base) => matchesPath(pathname, base))) return def.key;
  }
  return null;
};

export const can = (perms: MyPermissions | null | undefined, key: ModuleKey, action: PermissionAction = 'view'): boolean =>
  !!perms && (perms.isAdmin || !!perms.modules[key]?.[action]);

/** Whether this person may open `pathname`. `isSupport` keeps the support screens' own links working. */
export const canOpenPath = (perms: MyPermissions | null | undefined, pathname: string, isSupport: boolean): boolean => {
  if (OPEN_PATHS.some((base) => matchesPath(pathname, base))) return true;
  if (matchesPath(pathname, ROLES_PATH)) return !!perms?.isAdmin;
  const key = moduleForPath(pathname);
  if (!key) return true; // not a module page (login, 404, redirects): the route table decides
  if (can(perms, key, 'view')) return true;
  return isSupport && SUPPORT_KEPT_PATHS.some((base) => matchesPath(pathname, base));
};

/** Where to send someone who has just logged in (or hit a page they cannot open). */
export const firstAllowedPath = (perms: MyPermissions | null | undefined): string | null => {
  for (const def of MODULES) {
    if (can(perms, def.key, 'view')) return def.paths[0];
  }
  return null;
};

export const ADMIN_PERMISSIONS: MyPermissions = { isAdmin: true, modules: {} };

/** No admin modules: what a support has in the Support view. */
export const NO_MODULES: MyPermissions = { isAdmin: false, modules: {} };
