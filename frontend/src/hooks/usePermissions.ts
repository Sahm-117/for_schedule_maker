import { useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import { can as canDo, canOpenPath, firstAllowedPath, type ModuleKey, type PermissionAction } from '../utils/permissions';

/**
 * What the signed-in staff member may see and do. `can('participants', 'edit')` for buttons,
 * `canOpen('/users')` for pages. Real admins can do everything; so can a Support in the Support view (its screens are fixed).
 */
export const usePermissions = () => {
  const { user, permissions, permissionsStatus, isRealAdmin } = useAuth();
  const isSupport = user?.role === 'SUPPORT';

  // Pages shared with the support screens (Community, Group view, ...) must not lose any button for a Support,
  // so in the Support view this answers yes; the grid only limits Team members.
  const can = useCallback(
    (key: ModuleKey, action: PermissionAction = 'view') => isSupport || canDo(permissions, key, action),
    [permissions, isSupport],
  );
  const canOpen = useCallback((pathname: string) => canOpenPath(permissions, pathname, isSupport), [permissions, isSupport]);
  const landingPath = useMemo(() => firstAllowedPath(permissions), [permissions]);

  return { permissions, status: permissionsStatus, isRealAdmin, can, canOpen, landingPath };
};
