export type PluginId = 'matters' | 'contracts' | 'payroll' | 'recurring' | 'projects'

export type PluginFlags = Record<PluginId, boolean>

export const PLUGIN_SETTING_KEYS: Record<PluginId, string> = {
  matters: 'plugin.matters',
  contracts: 'plugin.contracts',
  payroll: 'plugin.payroll',
  recurring: 'plugin.recurring',
  projects: 'plugin.projects',
}

export const DEFAULT_PLUGIN_FLAGS: PluginFlags = {
  matters: true,
  contracts: true,
  payroll: true,
  recurring: true,
  projects: true,
}

export const PLUGIN_META: Record<
  PluginId,
  { routePrefixes: string[]; zhLabel: string; enLabel: string }
> = {
  matters: {
    routePrefixes: ['/activities'],
    zhLabel: '事項',
    enLabel: 'Matters',
  },
  contracts: {
    routePrefixes: ['/contracts'],
    zhLabel: '合約',
    enLabel: 'Contracts',
  },
  payroll: {
    routePrefixes: ['/admin/payroll'],
    zhLabel: '薪金結算',
    enLabel: 'Payroll',
  },
  recurring: {
    routePrefixes: ['/recurring'],
    zhLabel: '恆常收支',
    enLabel: 'Recurring',
  },
  projects: {
    routePrefixes: ['/projects'],
    zhLabel: '項目',
    enLabel: 'Projects',
  },
}

export function isPluginRouteEnabled(pathname: string, flags: PluginFlags) {
  for (const id of Object.keys(PLUGIN_META) as PluginId[]) {
    const meta = PLUGIN_META[id]
    if (meta.routePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'))) {
      return flags[id]
    }
  }
  return true
}
