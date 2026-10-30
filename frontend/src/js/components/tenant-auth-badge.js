/**
 * @file tenant-auth-badge.js
 * @description Multi-tenant RBAC indicator and role switcher (a real button in the topbar).
 */

import { api, setAuthToken } from '../api.js';

const ROLES = ['owner', 'planner', 'vendor'];
const DEFAULT_TENANT = 'Gatherly Studio';

export async function initTenantAuthBadge(showToast) {
  const badge = document.getElementById('enterprise-auth-badge');
  if (!badge) return;

  const tenantLabel = document.getElementById('enterprise-tenant-label');
  const roleLabel = document.getElementById('enterprise-role-label');

  function showProfile(tenant, role) {
    if (tenantLabel) tenantLabel.textContent = tenant;
    if (roleLabel) roleLabel.textContent = role.toUpperCase();
  }

  async function refreshProfile() {
    try {
      const me = await api.getMe();
      showProfile(me.tenant_name || DEFAULT_TENANT, me.role || 'owner');
    } catch {
      showProfile(DEFAULT_TENANT, 'owner');
    }
  }

  badge.addEventListener('click', async () => {
    const currentRole = (roleLabel ? roleLabel.textContent : 'OWNER').trim().toLowerCase();
    const nextRole = ROLES[(ROLES.indexOf(currentRole) + 1) % ROLES.length];

    badge.setAttribute('aria-busy', 'true');
    try {
      const data = await api.getDemoToken(nextRole);
      setAuthToken(data.access_token);
      if (roleLabel) roleLabel.textContent = nextRole.toUpperCase();
      if (showToast) {
        showToast('RBAC Role Switched', `Active context: ${nextRole.toUpperCase()} (Tenant: ${data.tenant_id})`);
      }
    } catch (err) {
      console.warn('Could not switch demo token:', err);
    } finally {
      badge.removeAttribute('aria-busy');
    }
  });

  refreshProfile();
}
