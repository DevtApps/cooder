import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApiResponse } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { Segmented } from '@/features/shell/Page';
import { CapabilityCatalogSections } from './CapabilityCatalogSections';
import type { AgentInfo, SkillInfo } from './capabilityCatalog';
import { McpServers } from './McpServers';
import { Plugins } from './Plugins';

type Tab = 'mcp' | 'skills' | 'plugins';

const PROVIDER = 'claude';

export function ExtensionsSection() {
  const [tab, setTab] = useState<Tab>('mcp');

  const agents = useQuery({
    queryKey: ['claude-agents', PROVIDER],
    queryFn: async () =>
      (await api.get<ApiResponse<AgentInfo[]>>(`/api/claude-config/agents?provider=${PROVIDER}`))
        .data.data ?? [],
    enabled: tab === 'skills',
  });
  const skills = useQuery({
    queryKey: ['claude-skills', PROVIDER],
    queryFn: async () =>
      (
        await api.get<ApiResponse<SkillInfo[]>>(
          `/api/claude-config/skills?library=all&provider=${PROVIDER}`
        )
      ).data.data ?? [],
    enabled: tab === 'skills',
  });

  return (
    <>
      <Segmented
        label="Extension type"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'mcp', label: 'MCP servers' },
          { value: 'skills', label: 'Skills & agents' },
          { value: 'plugins', label: 'Plugins' },
        ]}
      />
      {tab === 'mcp' && <McpServers />}
      {tab === 'skills' && (
        <CapabilityCatalogSections
          agents={agents.data}
          skills={skills.data}
          configProvider={PROVIDER}
        />
      )}
      {tab === 'plugins' && <Plugins />}
    </>
  );
}
