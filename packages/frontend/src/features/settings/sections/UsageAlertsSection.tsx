import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/services/api';
import { toast } from '@/hooks/use-toast';
import { disableWebPush, enableWebPush, getWebPushState } from '@/services/webPush';
import { SettingGroup, SettingRow, SwitchRow } from '../primitives';
import { useUserSettings } from '../useUserSettings';

const numberInput =
  'h-9 w-24 rounded-lg border border-input bg-transparent px-2 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function UsageAlertsSection() {
  const { settings, update } = useUserSettings();
  const alerts = settings?.usageAlerts;
  const [sending, setSending] = useState(false);
  const [push, setPush] = useState<'unsupported' | 'unconfigured' | 'on' | 'off' | null>(null);
  useEffect(() => {
    void getWebPushState()
      .then(setPush)
      .catch(() => setPush('unsupported'));
  }, []);

  // Thresholds live on the account, so the app and the web UI never drift.
  const sendTest = async () => {
    setSending(true);
    try {
      await api.post('/api/workspace/notifications/test', {});
      toast({ title: 'Test alert sent' });
    } catch (error) {
      toast({
        title: 'Could not send the test alert',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <SettingGroup
      title="Alerts"
      description="Notify your devices when a quota or the day's spend passes a limit."
    >
      <SwitchRow
        title="Enable alerts"
        checked={alerts?.enabled ?? true}
        onChange={(enabled) => update.mutate({ usageAlerts: { enabled } })}
      />
      <SettingRow title="Quota warning" description="Percent of a quota window used.">
        <input
          type="number"
          min={1}
          max={100}
          aria-label="Quota warning percent"
          key={alerts?.quotaPercent}
          defaultValue={alerts?.quotaPercent ?? 80}
          className={numberInput}
          onBlur={(event) => {
            const value = Number(event.target.value);
            if (value >= 1 && value <= 100) {
              update.mutate({ usageAlerts: { quotaPercent: Math.round(value) } });
            }
          }}
        />
      </SettingRow>
      <SettingRow title="Daily spend limit" description="API-equivalent dollars per day.">
        <input
          type="number"
          min={0}
          step="0.5"
          aria-label="Daily spend limit in dollars"
          key={alerts?.dailyCostUsd}
          defaultValue={alerts?.dailyCostUsd ?? 5}
          className={numberInput}
          onBlur={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value) && value >= 0) {
              update.mutate({ usageAlerts: { dailyCostUsd: value } });
            }
          }}
        />
      </SettingRow>
      {push && push !== 'unsupported' && (
        <SwitchRow
          title="Browser notifications"
          description={
            push === 'unconfigured'
              ? 'The server has no push keys configured.'
              : 'Get alerts and approval requests even when this tab is closed.'
          }
          checked={push === 'on'}
          disabled={push === 'unconfigured'}
          onChange={async (on) => {
            if (on) setPush((await enableWebPush()) ? 'on' : 'off');
            else {
              await disableWebPush();
              setPush('off');
            }
          }}
        />
      )}
      <SettingRow title="Try it" description="Sends one sample notification to your devices.">
        <Button variant="outline" size="sm" disabled={sending} onClick={() => void sendTest()}>
          Send test alert
        </Button>
      </SettingRow>
    </SettingGroup>
  );
}
