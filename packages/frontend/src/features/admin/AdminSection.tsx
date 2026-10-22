import { useState } from 'react';
import { Segmented } from '@/features/shell/Page';
import { AdminAuditLogPage } from './AdminAuditLogPage';
import { AdminOverviewPage } from './AdminOverviewPage';
import { AdminUsersPage } from './AdminUsersPage';

type Tab = 'overview' | 'users' | 'audit-log';

export function AdminSection() {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <>
      <Segmented
        label="Administration"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'users', label: 'Users' },
          { value: 'audit-log', label: 'Audit log' },
        ]}
      />
      {tab === 'overview' && <AdminOverviewPage />}
      {tab === 'users' && <AdminUsersPage />}
      {tab === 'audit-log' && <AdminAuditLogPage />}
    </>
  );
}
