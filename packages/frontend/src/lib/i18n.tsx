import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Language } from '@plum-code-webui/shared';

export const LANGUAGE_STORAGE_KEY = 'cooder-language';
export const DEFAULT_LANGUAGE: Language = 'en';

export type TranslationKey =
  | 'common.loading'
  | 'common.settings'
  | 'common.analytics'
  | 'common.signOut'
  | 'common.refresh'
  | 'common.update'
  | 'common.updateNow'
  | 'common.ready'
  | 'common.needsAttention'
  | 'navigation.sessions'
  | 'navigation.newSession'
  | 'navigation.noSessions'
  | 'navigation.openNavigation'
  | 'settings.title'
  | 'settings.appearance'
  | 'settings.appearanceDescription'
  | 'settings.workspace'
  | 'settings.workspaceDescription'
  | 'settings.agents'
  | 'settings.agentsDescription'
  | 'settings.browser'
  | 'settings.browserDescription'
  | 'settings.extensions'
  | 'settings.extensionsDescription'
  | 'settings.integrations'
  | 'settings.integrationsDescription'
  | 'settings.usage'
  | 'settings.usageDescription'
  | 'settings.security'
  | 'settings.securityDescription'
  | 'settings.system'
  | 'settings.systemDescription'
  | 'settings.administration'
  | 'settings.administrationDescription'
  | 'settings.general'
  | 'settings.services'
  | 'settings.access'
  | 'settings.section'
  | 'appearance.theme'
  | 'appearance.light'
  | 'appearance.dark'
  | 'appearance.system'
  | 'appearance.language'
  | 'appearance.languageDescription'
  | 'appearance.english'
  | 'appearance.portuguese'
  | 'appearance.sync'
  | 'appearance.syncDescription'
  | 'system.agentDiagnostics'
  | 'system.agentDiagnosticsDescription'
  | 'system.updates'
  | 'system.updateAgents'
  | 'system.updateAgentsDescription'
  | 'system.notInstalled'
  | 'system.binary'
  | 'system.credentials'
  | 'system.models'
  | 'system.default'
  | 'system.mcpServers'
  | 'system.updating'
  | 'system.updateFailed'
  | 'errors.couldNotSave'
  | 'auth.signInTitle'
  | 'auth.tagline'
  | 'auth.username'
  | 'auth.password'
  | 'auth.hidePassword'
  | 'auth.showPassword'
  | 'auth.signingIn'
  | 'auth.continue'
  | 'auth.loginFailed'
  | 'home.projects'
  | 'home.openFolder'
  | 'home.cloneFromGitHub'
  | 'home.newProject'
  | 'home.prompt'
  | 'home.placeholder'
  | 'home.couldNotStart'
  | 'session.browser'
  | 'session.terminal'
  | 'session.runs'
  | 'session.changes'
  | 'session.files'
  | 'session.context'
  | 'session.memory'
  | 'session.progress'
  | 'session.workspace'
  | 'session.couldNotLoad'
  | 'session.tryAgain'
  | 'session.showingEarlier'
  | 'session.scrollLatest'
  | 'composer.commands'
  | 'composer.message'
  | 'composer.attachFiles'
  | 'composer.removeAttachment'
  | 'composer.stop'
  | 'composer.stopWithShortcut'
  | 'composer.dictate'
  | 'composer.stopDictation'
  | 'composer.queued'
  | 'composer.queueMessage'
  | 'composer.interruptAndSend'
  | 'composer.sendMessage'
  | 'composer.send'
  | 'analytics.title'
  | 'analytics.description'
  | 'analytics.previousPeriod'
  | 'analytics.nextPeriod'
  | 'analytics.period'
  | 'analytics.hours24'
  | 'analytics.week'
  | 'analytics.month'
  | 'analytics.days90'
  | 'analytics.all'
  | 'analytics.previous24h'
  | 'analytics.sameTimeLastWeek'
  | 'analytics.sameTimeLastMonth'
  | 'analytics.previous90days'
  | 'analytics.allRecordedUsage'
  | 'analytics.usageCouldNotLoad'
  | 'analytics.spend'
  | 'analytics.tokens'
  | 'analytics.requests'
  | 'analytics.cacheHitRate'
  | 'analytics.usageOverTime'
  | 'analytics.metric'
  | 'analytics.loading'
  | 'analytics.noUsagePeriod'
  | 'analytics.byModel'
  | 'analytics.topSessions'
  | 'analytics.noUsageYet'
  | 'analytics.noSessionsYet'
  | 'analytics.limits'
  | 'analytics.limitsDescription'
  | 'analytics.noQuotaWindows'
  | 'analytics.resets'
  | 'analytics.unpricedTokens'
  | 'picker.agentAndModel'
  | 'picker.agent'
  | 'picker.installAgents'
  | 'picker.model'
  | 'picker.default'
  | 'picker.effort'
  | 'picker.fastMode'
  | 'mode.permissionMode'
  | 'mode.plan'
  | 'mode.planDescription'
  | 'mode.auto'
  | 'mode.autoDescription'
  | 'mode.ask'
  | 'mode.askDescription'
  | 'mode.yolo'
  | 'mode.yoloDescription'
  | 'dialog.renameSession'
  | 'dialog.sessionName'
  | 'dialog.cancel'
  | 'dialog.save'
  | 'dialog.deleteSession'
  | 'dialog.deleteSessionDescription'
  | 'dialog.delete'
  | 'folder.open'
  | 'folder.path'
  | 'folder.loading'
  | 'folder.cannotOpen'
  | 'folder.noSubfolders'
  | 'folder.hidden'
  | 'folder.use';

const translations: Record<Language, Record<TranslationKey, string>> = {
  en: {
    'common.loading': 'Loading',
    'common.settings': 'Settings',
    'common.analytics': 'Analytics',
    'common.signOut': 'Sign out',
    'common.refresh': 'Refresh',
    'common.update': 'Update',
    'common.updateNow': 'Update now',
    'common.ready': 'Ready',
    'common.needsAttention': 'Needs attention',
    'navigation.sessions': 'Sessions',
    'navigation.newSession': 'New session',
    'navigation.noSessions': 'No sessions yet.',
    'navigation.openNavigation': 'Open navigation',
    'settings.title': 'Settings',
    'settings.appearance': 'Appearance',
    'settings.appearanceDescription': 'Theme, language and device sync',
    'settings.workspace': 'Workspace',
    'settings.workspaceDescription': 'Where new sessions start',
    'settings.agents': 'Agents',
    'settings.agentsDescription': 'Install, sign in and configure agents',
    'settings.browser': 'Browser',
    'settings.browserDescription': 'The Chrome behind the browser panel',
    'settings.extensions': 'Extensions',
    'settings.extensionsDescription': 'MCP servers, skills, agents and plugins',
    'settings.integrations': 'Integrations',
    'settings.integrationsDescription': 'Accounts and services your agents can use',
    'settings.usage': 'Usage alerts',
    'settings.usageDescription': 'Quota and spend warnings',
    'settings.security': 'Security',
    'settings.securityDescription': 'Password gate, API tokens and browser control',
    'settings.system': 'System',
    'settings.systemDescription': 'Agent diagnostics and updates',
    'settings.administration': 'Administration',
    'settings.administrationDescription': 'Users, instance health and audit log',
    'settings.general': 'General',
    'settings.services': 'Services',
    'settings.access': 'Access',
    'settings.section': 'Settings section',
    'appearance.theme': 'Theme',
    'appearance.light': 'Light',
    'appearance.dark': 'Dark',
    'appearance.system': 'System',
    'appearance.language': 'Language',
    'appearance.languageDescription': 'Choose the language used by the Cooder interface.',
    'appearance.english': 'English',
    'appearance.portuguese': 'Português (Brasil)',
    'appearance.sync': 'Sync across devices',
    'appearance.syncDescription':
      'Use this theme on the Android app and every other browser you sign in from.',
    'system.agentDiagnostics': 'Agent diagnostics',
    'system.agentDiagnosticsDescription': 'Binary, sign-in, models and tool wiring of each agent.',
    'system.updates': 'Updates',
    'system.updateAgents': 'Update agent CLIs',
    'system.updateAgentsDescription': 'Installs the latest version of every installed agent.',
    'system.notInstalled': 'Not installed',
    'system.binary': 'Binary',
    'system.credentials': 'Credentials',
    'system.models': 'Models',
    'system.default': 'default',
    'system.mcpServers': 'MCP servers',
    'system.updating': 'Updating…',
    'system.updateFailed': 'Update failed',
    'errors.couldNotSave': 'Could not save',
    'auth.signInTitle': 'Sign in to Cooder',
    'auth.tagline': 'One workspace for every coding agent.',
    'auth.username': 'Username',
    'auth.password': 'Password',
    'auth.hidePassword': 'Hide password',
    'auth.showPassword': 'Show password',
    'auth.signingIn': 'Signing in…',
    'auth.continue': 'Continue',
    'auth.loginFailed': 'Login failed',
    'home.projects': 'Projects',
    'home.openFolder': 'Open folder…',
    'home.cloneFromGitHub': 'Clone from GitHub…',
    'home.newProject': 'New project',
    'home.prompt': 'What should we work on?',
    'home.placeholder': 'Describe a task, ask a question…',
    'home.couldNotStart': 'Could not start the session',
    'session.browser': 'Browser',
    'session.terminal': 'Terminal',
    'session.runs': 'Runs',
    'session.changes': 'Changes',
    'session.files': 'Files',
    'session.context': 'Context',
    'session.memory': 'Project memory',
    'session.progress': 'Progress',
    'session.workspace': 'Workspace',
    'session.couldNotLoad': 'This session could not be loaded.',
    'session.tryAgain': 'Try again',
    'session.showingEarlier': 'Showing earlier messages · back to latest',
    'session.scrollLatest': 'Scroll to latest',
    'composer.commands': 'Commands',
    'composer.message': 'Message',
    'composer.attachFiles': 'Attach files',
    'composer.removeAttachment': 'Remove attachment',
    'composer.stop': 'Stop',
    'composer.stopWithShortcut': 'Stop (Esc)',
    'composer.dictate': 'Dictate',
    'composer.stopDictation': 'Stop dictation',
    'composer.queued': 'queued',
    'composer.queueMessage': 'Queue message',
    'composer.interruptAndSend': 'Interrupt current turn and send',
    'composer.sendMessage': 'Send message',
    'composer.send': 'Send',
    'analytics.title': 'Analytics',
    'analytics.description': 'Usage and spend across your agents',
    'analytics.previousPeriod': 'Previous period',
    'analytics.nextPeriod': 'Next period',
    'analytics.period': 'Period',
    'analytics.hours24': '24h',
    'analytics.week': 'Week',
    'analytics.month': 'Month',
    'analytics.days90': '90 days',
    'analytics.all': 'All',
    'analytics.previous24h': 'vs previous 24h',
    'analytics.sameTimeLastWeek': 'vs same time last week',
    'analytics.sameTimeLastMonth': 'vs same time last month',
    'analytics.previous90days': 'vs previous 90 days',
    'analytics.allRecordedUsage': 'all recorded usage',
    'analytics.usageCouldNotLoad': 'Usage could not be loaded.',
    'analytics.spend': 'Spend (API equivalent)',
    'analytics.tokens': 'Tokens',
    'analytics.requests': 'Requests',
    'analytics.cacheHitRate': 'Cache hit rate',
    'analytics.usageOverTime': 'Usage over time',
    'analytics.metric': 'Metric',
    'analytics.loading': 'Loading…',
    'analytics.noUsagePeriod': 'No usage in this period.',
    'analytics.byModel': 'By model',
    'analytics.topSessions': 'Top sessions',
    'analytics.noUsageYet': 'No usage yet.',
    'analytics.noSessionsYet': 'No sessions yet.',
    'analytics.limits': 'Limits',
    'analytics.limitsDescription': "Quota windows reported by each agent's account",
    'analytics.noQuotaWindows': 'No quota windows reported.',
    'analytics.resets': 'Resets',
    'analytics.unpricedTokens': 'tokens come from models without a price',
    'picker.agentAndModel': 'Agent and model',
    'picker.agent': 'Agent',
    'picker.installAgents': 'Install agents…',
    'picker.model': 'Model',
    'picker.default': 'Default',
    'picker.effort': 'Effort',
    'picker.fastMode': 'Fast mode',
    'mode.permissionMode': 'Permission mode',
    'mode.plan': 'Plan',
    'mode.planDescription': 'Plans first and asks before acting',
    'mode.auto': 'Auto',
    'mode.autoDescription': 'Approves safe operations on its own',
    'mode.ask': 'Ask',
    'mode.askDescription': 'Asks before each operation',
    'mode.yolo': 'YOLO',
    'mode.yoloDescription': 'No confirmations at all',
    'dialog.renameSession': 'Rename session',
    'dialog.sessionName': 'Session name',
    'dialog.cancel': 'Cancel',
    'dialog.save': 'Save',
    'dialog.deleteSession': 'Delete this session?',
    'dialog.deleteSessionDescription':
      'and its conversation are removed. Files in the project folder are not touched.',
    'dialog.delete': 'Delete',
    'folder.open': 'Open a folder',
    'folder.path': 'Path',
    'folder.loading': 'Loading',
    'folder.cannotOpen': 'This folder cannot be opened here. Cooder can only use folders under',
    'folder.noSubfolders': 'No subfolders.',
    'folder.hidden': 'Hidden folders',
    'folder.use': 'Use this folder',
  },
  'pt-BR': {
    'common.loading': 'Carregando',
    'common.settings': 'Configurações',
    'common.analytics': 'Análises',
    'common.signOut': 'Sair',
    'common.refresh': 'Atualizar',
    'common.update': 'Atualizar',
    'common.updateNow': 'Atualizar agora',
    'common.ready': 'Pronto',
    'common.needsAttention': 'Requer atenção',
    'navigation.sessions': 'Sessões',
    'navigation.newSession': 'Nova sessão',
    'navigation.noSessions': 'Nenhuma sessão ainda.',
    'navigation.openNavigation': 'Abrir navegação',
    'settings.title': 'Configurações',
    'settings.appearance': 'Aparência',
    'settings.appearanceDescription': 'Tema, idioma e sincronização entre dispositivos',
    'settings.workspace': 'Workspace',
    'settings.workspaceDescription': 'Onde novas sessões começam',
    'settings.agents': 'Agentes',
    'settings.agentsDescription': 'Instale, conecte e configure os agentes',
    'settings.browser': 'Navegador',
    'settings.browserDescription': 'O Chrome usado pelo painel do navegador',
    'settings.extensions': 'Extensões',
    'settings.extensionsDescription': 'Servidores MCP, skills, agentes e plugins',
    'settings.integrations': 'Integrações',
    'settings.integrationsDescription': 'Contas e serviços que seus agentes podem usar',
    'settings.usage': 'Alertas de uso',
    'settings.usageDescription': 'Avisos de cota e gastos',
    'settings.security': 'Segurança',
    'settings.securityDescription': 'Senha, tokens de API e controle do navegador',
    'settings.system': 'Sistema',
    'settings.systemDescription': 'Diagnóstico e atualizações dos agentes',
    'settings.administration': 'Administração',
    'settings.administrationDescription': 'Usuários, saúde da instância e auditoria',
    'settings.general': 'Geral',
    'settings.services': 'Serviços',
    'settings.access': 'Acesso',
    'settings.section': 'Seção de configurações',
    'appearance.theme': 'Tema',
    'appearance.light': 'Claro',
    'appearance.dark': 'Escuro',
    'appearance.system': 'Sistema',
    'appearance.language': 'Idioma',
    'appearance.languageDescription': 'Escolha o idioma usado pela interface do Cooder.',
    'appearance.english': 'English',
    'appearance.portuguese': 'Português (Brasil)',
    'appearance.sync': 'Sincronizar entre dispositivos',
    'appearance.syncDescription':
      'Use este tema no Android e em todos os navegadores onde você entrar.',
    'system.agentDiagnostics': 'Diagnóstico dos agentes',
    'system.agentDiagnosticsDescription': 'Binário, login, modelos e ferramentas de cada agente.',
    'system.updates': 'Atualizações',
    'system.updateAgents': 'Atualizar CLIs dos agentes',
    'system.updateAgentsDescription': 'Instala a versão mais recente de cada agente instalado.',
    'system.notInstalled': 'Não instalado',
    'system.binary': 'Binário',
    'system.credentials': 'Credenciais',
    'system.models': 'Modelos',
    'system.default': 'padrão',
    'system.mcpServers': 'Servidores MCP',
    'system.updating': 'Atualizando…',
    'system.updateFailed': 'Falha ao atualizar',
    'errors.couldNotSave': 'Não foi possível salvar',
    'auth.signInTitle': 'Entrar no Cooder',
    'auth.tagline': 'Um workspace para todos os seus agentes de código.',
    'auth.username': 'Usuário',
    'auth.password': 'Senha',
    'auth.hidePassword': 'Ocultar senha',
    'auth.showPassword': 'Mostrar senha',
    'auth.signingIn': 'Entrando…',
    'auth.continue': 'Continuar',
    'auth.loginFailed': 'Falha ao entrar',
    'home.projects': 'Projetos',
    'home.openFolder': 'Abrir pasta…',
    'home.cloneFromGitHub': 'Clonar do GitHub…',
    'home.newProject': 'Novo projeto',
    'home.prompt': 'No que vamos trabalhar?',
    'home.placeholder': 'Descreva uma tarefa ou faça uma pergunta…',
    'home.couldNotStart': 'Não foi possível iniciar a sessão',
    'session.browser': 'Navegador',
    'session.terminal': 'Terminal',
    'session.runs': 'Execuções',
    'session.changes': 'Alterações',
    'session.files': 'Arquivos',
    'session.context': 'Contexto',
    'session.memory': 'Memória do projeto',
    'session.progress': 'Progresso',
    'session.workspace': 'Workspace',
    'session.couldNotLoad': 'Não foi possível carregar esta sessão.',
    'session.tryAgain': 'Tentar novamente',
    'session.showingEarlier': 'Mensagens anteriores · voltar às mais recentes',
    'session.scrollLatest': 'Rolar para a mensagem mais recente',
    'composer.commands': 'Comandos',
    'composer.message': 'Mensagem',
    'composer.attachFiles': 'Anexar arquivos',
    'composer.removeAttachment': 'Remover anexo',
    'composer.stop': 'Parar',
    'composer.stopWithShortcut': 'Parar (Esc)',
    'composer.dictate': 'Ditado',
    'composer.stopDictation': 'Parar ditado',
    'composer.queued': 'na fila',
    'composer.queueMessage': 'Enfileirar mensagem',
    'composer.interruptAndSend': 'Interromper turno atual e enviar',
    'composer.sendMessage': 'Enviar mensagem',
    'composer.send': 'Enviar',
    'analytics.title': 'Análises',
    'analytics.description': 'Uso e gastos dos seus agentes',
    'analytics.previousPeriod': 'Período anterior',
    'analytics.nextPeriod': 'Próximo período',
    'analytics.period': 'Período',
    'analytics.hours24': '24h',
    'analytics.week': 'Semana',
    'analytics.month': 'Mês',
    'analytics.days90': '90 dias',
    'analytics.all': 'Tudo',
    'analytics.previous24h': 'vs. 24h anteriores',
    'analytics.sameTimeLastWeek': 'vs. mesmo período da semana passada',
    'analytics.sameTimeLastMonth': 'vs. mesmo período do mês passado',
    'analytics.previous90days': 'vs. 90 dias anteriores',
    'analytics.allRecordedUsage': 'todo o uso registrado',
    'analytics.usageCouldNotLoad': 'Não foi possível carregar o uso.',
    'analytics.spend': 'Gastos (equivalente de API)',
    'analytics.tokens': 'Tokens',
    'analytics.requests': 'Requisições',
    'analytics.cacheHitRate': 'Taxa de cache',
    'analytics.usageOverTime': 'Uso ao longo do tempo',
    'analytics.metric': 'Métrica',
    'analytics.loading': 'Carregando…',
    'analytics.noUsagePeriod': 'Nenhum uso neste período.',
    'analytics.byModel': 'Por modelo',
    'analytics.topSessions': 'Principais sessões',
    'analytics.noUsageYet': 'Nenhum uso ainda.',
    'analytics.noSessionsYet': 'Nenhuma sessão ainda.',
    'analytics.limits': 'Limites',
    'analytics.limitsDescription': 'Janelas de cota informadas pela conta de cada agente',
    'analytics.noQuotaWindows': 'Nenhuma janela de cota informada.',
    'analytics.resets': 'Redefine',
    'analytics.unpricedTokens': 'tokens vêm de modelos sem preço',
    'picker.agentAndModel': 'Agente e modelo',
    'picker.agent': 'Agente',
    'picker.installAgents': 'Instalar agentes…',
    'picker.model': 'Modelo',
    'picker.default': 'Padrão',
    'picker.effort': 'Esforço',
    'picker.fastMode': 'Modo rápido',
    'mode.permissionMode': 'Modo de permissão',
    'mode.plan': 'Planejar',
    'mode.planDescription': 'Planeja primeiro e pergunta antes de agir',
    'mode.auto': 'Automático',
    'mode.autoDescription': 'Aprova operações seguras automaticamente',
    'mode.ask': 'Perguntar',
    'mode.askDescription': 'Pergunta antes de cada operação',
    'mode.yolo': 'YOLO',
    'mode.yoloDescription': 'Sem confirmações',
    'dialog.renameSession': 'Renomear sessão',
    'dialog.sessionName': 'Nome da sessão',
    'dialog.cancel': 'Cancelar',
    'dialog.save': 'Salvar',
    'dialog.deleteSession': 'Excluir esta sessão?',
    'dialog.deleteSessionDescription':
      'e sua conversa serão removidas. Os arquivos da pasta do projeto não serão alterados.',
    'dialog.delete': 'Excluir',
    'folder.open': 'Abrir uma pasta',
    'folder.path': 'Caminho',
    'folder.loading': 'Carregando',
    'folder.cannotOpen':
      'Esta pasta não pode ser aberta aqui. O Cooder só pode usar pastas dentro de',
    'folder.noSubfolders': 'Nenhuma subpasta.',
    'folder.hidden': 'Pastas ocultas',
    'folder.use': 'Usar esta pasta',
  },
};

function normalizeLanguage(value: unknown): Language {
  return value === 'pt-BR' ? 'pt-BR' : DEFAULT_LANGUAGE;
}

export function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
}

export function setStoredLanguage(language: Language): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
}

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getStoredLanguage);
  const setLanguage = useCallback((next: Language) => {
    const normalized = normalizeLanguage(next);
    setStoredLanguage(normalized);
    setLanguageState(normalized);
  }, []);
  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key: TranslationKey) => translations[language][key] ?? translations.en[key],
    }),
    [language, setLanguage]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}

export function LanguageSync({ language }: { language?: Language }) {
  const { language: current, setLanguage } = useI18n();
  useEffect(() => {
    if (language && language !== current) setLanguage(language);
  }, [current, language, setLanguage]);
  return null;
}
