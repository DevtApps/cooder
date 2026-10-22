import assert from 'node:assert/strict';
import { DEFAULT_ANALYTICS_HIDDEN_LIMIT_METRICS } from '@plum-code-webui/shared';
import { parseAnalyticsSettings, updateSettingsSchema } from '../src/routes/settings.js';

assert.deepEqual(DEFAULT_ANALYTICS_HIDDEN_LIMIT_METRICS, {
  codex: ['additional_gpt_5_3_codex_spark'],
  kimi: ['additional_parallel_sessions'],
  zai: ['additional_web_search'],
});

assert.deepEqual(parseAnalyticsSettings(undefined), {
  hiddenLimitMetrics: DEFAULT_ANALYTICS_HIDDEN_LIMIT_METRICS,
});
assert.deepEqual(parseAnalyticsSettings({ hiddenLimitMetrics: {} }), {
  hiddenLimitMetrics: {},
});
assert.deepEqual(
  parseAnalyticsSettings({
    hiddenLimitMetrics: {
      codex: ['seven_day', 'seven_day'],
      kimi: ['additional_parallel_sessions'],
      invalid: ['ignored'],
    },
  }),
  {
    hiddenLimitMetrics: {
      codex: ['seven_day'],
      kimi: ['additional_parallel_sessions'],
    },
  }
);

assert.equal(
  updateSettingsSchema.safeParse({
    analytics: { hiddenLimitMetrics: { zai: ['additional_web_search'] } },
  }).success,
  true
);
assert.equal(
  updateSettingsSchema.safeParse({
    analytics: { hiddenLimitMetrics: { zai: ['x'.repeat(161)] } },
  }).success,
  false
);

console.log('Analytics settings regression tests passed.');
