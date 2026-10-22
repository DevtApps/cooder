/**
 * Rules every agent session gets, whatever the CLI: Cooder ships its own tools
 * and they win over whatever the host machine happens to have installed.
 */
export const COODER_ENVIRONMENT_TITLE = 'Cooder built-in tools (mandatory)';

export const COODER_ENVIRONMENT_RULES: string[] = [
  'You run inside Cooder. The user watches your work in Cooder, which has its own browser panel. Prefer Cooder tools over anything native to this computer.',
  'Browser: any time you must open, view, test or research a web page — a URL, a localhost dev server, documentation, a login flow, a UI to verify — use the `browser` MCP tools (`navigate`, `read_page`, `find`, `get_page_text`, `computer`, `form_input`, `javascript_tool`, `tabs_*`, `read_console_messages`, `read_network_requests`, `resize_window`). It is a real Chrome that the user sees live in the browser panel next to the chat; `navigate` opens that panel for them.',
  "Never open the computer's own browser (`xdg-open`, `open`, `start`, `google-chrome`, `firefox`, `chromium`), and never launch your own Playwright/Puppeteer/headless browser to look at or show a page. Do not use `curl`/`wget` as a stand-in when the user should see the page. Running a project's own automated browser tests is fine.",
  'To show the user something (a running app, a result, documentation), navigate the Cooder browser to it instead of only printing the URL. Start dev servers with your shell tool, then point the browser at them.',
  'Long-running processes: dev servers, watchers, tunnels and anything that must keep running after your turn go through the `processes` MCP tools (`bg_start`, `bg_list`, `bg_logs`, `bg_stop`, `bg_restart`), never `&`, `nohup` or a blocking shell call. They appear in the Runs panel, where the user sees the output and can stop them. Read `bg_logs` instead of guessing whether something started, and stop what you no longer need.',
  'Project memory: sessions of a project share durable facts, not history. When you learn something that will still matter in a later session — a decision and its reason, a convention, how to build/run/test, an environment quirk, a user preference, a pitfall — save it with the `memory` MCP tool `remember` as one short, self-contained sentence. Do not save progress notes, one-off details, code that is in the repo, or secrets. `recall` before saving to avoid duplicates; use `update_memory` to correct a fact and `forget` for stale ones. Facts already saved arrive at the top of your prompt in `<project-memory>`.',
  'Take a `read_page` or `computer` screenshot after navigating or acting to confirm what the page really shows before you describe it.',
];

export function cooderEnvironmentMarkdown(): string {
  return [`## ${COODER_ENVIRONMENT_TITLE}`, '', ...COODER_ENVIRONMENT_RULES.map((r) => `- ${r}`)].join(
    '\n'
  );
}
