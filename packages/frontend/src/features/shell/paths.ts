// Routes of the app. Everything lives at the root.
export const paths = {
  home: () => '/',
  newSession: (project?: string) => (project ? `/?project=${encodeURIComponent(project)}` : '/'),
  session: (id: string) => `/session/${id}`,
  settings: (section?: string) => `/settings${section ? `/${section}` : ''}`,
  analytics: () => '/analytics',
};
