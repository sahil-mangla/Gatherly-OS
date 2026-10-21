/**
 * @file tenant-auth-badge.js
 * @description Multi-tenant RBAC indicator and role switcher component.
 */

import { api, setAuthToken } from '../api.js';

export async function initTenantAuthBadge(showToast) {
  const badge = document.getElementById('enterprise-auth-badge');
  if (!badge) return;

  const tenantLabel = document.getElementById('enterprise-tenant-label');
  const roleLabel = document.getElementById('enterprise-role-label');

  async function refreshProfile() {
    try {
      const me = await api.getMe();
      if (tenantLabel) tenantLabel.innerText = me.tenant_name || 'Gatherly Studio';
      if (roleLabel) roleLabel.innerText = (me.role || 'owner').toUpperCase();
    } catch {
      if (tenantLabel) tenantLabel.innerText = 'Gatherly Studio';
      if (roleLabel) roleLabel.innerText = 'OWNER';
    }
  }

  badge.addEventListener('click', async () => {
    const roles = ['owner', 'planner', 'vendor'];
    const currentRole = (roleLabel?.innerText || 'OWNER').toLowerCase();
    const nextRole = roles[(roles.indexOf(currentRole) + 1) % roles.length];

    try {
      const data = await api.getDemoToken(nextRole);
      setAuthToken(data.access_token);
      if (roleLabel) roleLabel.innerText = nextRole.toUpperCase();
      if (showToast) {
        showToast(
          'RBAC Role Switched',
          `Active context: ${nextRole.toUpperCase()} (Tenant: ${data.tenant_id})`
        );
      }
    } catch (err) {
      console.warn('Could not switch demo token:', err);
    }
  });

  refreshProfile();
}
