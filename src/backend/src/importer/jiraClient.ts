import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { logger } from '@/utils/logger';

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    issuetype: { name: string };
    assignee: { accountId: string; displayName: string; emailAddress?: string } | null;
    priority: { name: string } | null;
    project: { key: string; name: string };
    created: string;
    updated: string;
    resolutiondate: string | null;
    timeoriginalestimate: number | null; // seconds
    timespent: number | null; // seconds
    subtasks: Array<{ id: string; key: string }>;
    parent?: { id: string; key: string };
    labels: string[];
    [key: string]: unknown; // custom fields
  };
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  issueTypes?: Array<{ name: string }>;
}

export interface JiraSearchResponse {
  issues: JiraIssue[];
  nextPageToken?: string;
  total?: number;
}

export interface JiraWorklogEntry {
  id: string;
  author: { accountId: string; displayName: string; emailAddress?: string };
  timeSpentSeconds: number;
  started: string; // "2026-01-15T10:00:00.000+0000"
}

export interface JiraUserInfo {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

interface JiraUserWithGroupsResponse {
  groups?: {
    items?: Array<{ name?: string }>;
  };
}

export interface JiraProjectMember {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  active?: boolean;
}

export interface JiraFieldInfo {
  id: string;
  name: string;
  custom: boolean;
  schema?: { type: string; custom?: string; items?: string };
  allowedValues?: Array<{ id: string; value?: string; name?: string }>;
}

/**
 * Client JIRA Cloud REST API v3.
 * Paginated search with JQL — implémente DA-003 (import by page).
 */
export class JiraClient {
  private client: AxiosInstance;
  private pageSize: number;

  /**
   * If the token looks like a base64-encoded "email:ATATT..." string, extract the raw API token.
   * Otherwise return the token as-is.
   */
  static extractRawToken(token: string): string {
    // Raw JIRA API tokens start with ATATT
    if (token.startsWith('ATATT')) return token;
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const colonIdx = decoded.indexOf(':');
      if (colonIdx > 0) {
        const candidate = decoded.slice(colonIdx + 1);
        if (candidate.startsWith('ATATT')) {
          logger.info('Auto-detected base64-encoded token, extracting raw API token');
          return candidate;
        }
      }
    } catch {
      // Not valid base64 — use as-is
    }
    return token;
  }

  constructor(
    baseUrl: string,
    email: string,
    apiToken: string,
    pageSize = 100,
  ) {
    this.pageSize = pageSize;

    // Auto-detect if the token is a base64-encoded "email:token" string and extract the real token
    const resolvedToken = JiraClient.extractRawToken(apiToken);

    this.client = axios.create({
      baseURL: `${baseUrl}/rest/api/3`,
      auth: { username: email, password: resolvedToken },
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });

    if (process.env.LOG_VERBOSE === 'true') {
      this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
        logger.info('JIRA outgoing request', {
          method: config.method?.toUpperCase(),
          url: `${config.baseURL}${config.url}`,
          body: typeof config.data === 'string' ? config.data : JSON.stringify(config.data),
        });
        return config;
      });
    }
  }

  /**
   * Récupère toutes les issues correspondant au JQL, en paginant automatiquement.
   */
  async *searchIssues(
    jql: string,
    fields: string[],
  ): AsyncGenerator<JiraIssue> {
    let nextPageToken: string | undefined = undefined;
    let page = 0;

    while (true) {
      const body: Record<string, unknown> = { jql, maxResults: this.pageSize, fieldsByKeys: false, fields };
      if (nextPageToken) body.nextPageToken = nextPageToken;

      const response = await this.client.post<JiraSearchResponse>('/search/jql', body);
      const data = response.data;

      logger.debug('JIRA search/jql page fetched', {
        jql: jql.slice(0, 80),
        page,
        count: data.issues.length,
        hasMore: !!data.nextPageToken,
      });

      for (const issue of data.issues) {
        yield issue;
      }

      if (!data.nextPageToken || data.issues.length === 0) break;
      nextPageToken = data.nextPageToken;
      page++;
    }
  }

  /**
   * Appel GET générique sur l'API JIRA.
   */
  async get<T>(path: string): Promise<T> {
    const resp = await this.client.get<T>(path);
    return resp.data;
  }

  /**
   * Retourne tous les champs déclarés sur l'instance JIRA.
   */
  async getAllFields(): Promise<JiraFieldInfo[]> {
    const resp = await this.client.get<JiraFieldInfo[]>('/field');
    return resp.data;
  }

  /**
   * Retourne les champs JIRA utilisés dans un projet donné.
   * Stratégie : 1 issue par type d'issue → couvre tous les types de tickets (Epic, Story, Bug…).
   */
  async getProjectFields(projectKey: string): Promise<JiraFieldInfo[]> {
    // 1. Tous les champs déclarés sur l'instance (nom + ID)
    const [fieldsResp, projectResp] = await Promise.all([
      this.client.get<JiraFieldInfo[]>('/field'),
      this.client.get<{ issueTypes: Array<{ name: string }> }>(`/project/${projectKey}`),
    ]);

    const allFields: JiraFieldInfo[] = fieldsResp.data;
    const issueTypes: string[] = projectResp.data.issueTypes?.map((t: { name: string }) => t.name) ?? [];

    // 2. Pour chaque type d'issue, récupérer 1 issue avec tous les champs
    const usedFieldIds = new Set<string>();

    await Promise.all(
      issueTypes.map(async (issueType) => {
        try {
          const resp = await this.client.post<JiraSearchResponse>('/search/jql', {
            jql: `project = "${projectKey}" AND issuetype = "${issueType}" ORDER BY updated DESC`,
            maxResults: 1,
            fields: ['*all'],
            fieldsByKeys: false,
          });
          for (const issue of resp.data.issues ?? []) {
            if (!issue.fields) continue;
            for (const [key, value] of Object.entries(issue.fields)) {
              if (value !== null && value !== undefined) usedFieldIds.add(key);
            }
          }
        } catch {
          // Type sans issues dans ce projet — on ignore silencieusement
        }
      }),
    );

    // 3. Retourner uniquement les champs effectivement utilisés, triés : standard d'abord
    return allFields
      .filter((f: JiraFieldInfo) => usedFieldIds.has(f.id))
      .sort((a: JiraFieldInfo, b: JiraFieldInfo) => {
        if (a.custom !== b.custom) return a.custom ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
  }

  /**
   * Récupère les projets accessibles avec le token.
   */
  async getProjects(): Promise<JiraProject[]> {
    const response = await this.client.get<{ values: JiraProject[] }>(
      '/project/search',
      { params: { maxResults: 200 } },
    );
    return response.data.values;
  }

  /**
   * Retourne les types d'issues activés sur un projet JIRA.
   */
  async getProjectIssueTypes(projectKey: string): Promise<string[]> {
    try {
      const project = await this.client.get<{ id: string; issueTypes?: Array<{ name?: string }> }>(`/project/${projectKey}`);
      const response = await this.client.get<Array<{ name?: string }>>('/issuetype/project', {
        params: { projectId: project.data.id },
      });

      const projectIssueTypes = (project.data.issueTypes ?? [])
        .map((t) => t.name?.trim())
        .filter((name): name is string => !!name);

      const endpointIssueTypes = (response.data ?? [])
        .map((t) => t.name?.trim())
        .filter((name): name is string => !!name);

      const projectOnly = projectIssueTypes.filter((t) => !endpointIssueTypes.includes(t));
      const endpointOnly = endpointIssueTypes.filter((t) => !projectIssueTypes.includes(t));

      logger.info('JIRA issue types comparison', {
        projectKey,
        projectId: project.data.id,
        projectIssueTypesCount: projectIssueTypes.length,
        endpointIssueTypesCount: endpointIssueTypes.length,
        projectOnlyCount: projectOnly.length,
        endpointOnlyCount: endpointOnly.length,
        projectIssueTypesSample: projectIssueTypes.slice(0, 20),
        endpointIssueTypesSample: endpointIssueTypes.slice(0, 20),
        projectOnlySample: projectOnly.slice(0, 20),
        endpointOnlySample: endpointOnly.slice(0, 20),
      });

      return endpointIssueTypes;
    } catch {
      // Fallback de compatibilite si l'endpoint dedie n'est pas disponible.
      const response = await this.client.get<{ issueTypes?: Array<{ name?: string }> }>(`/project/${projectKey}`);
      const fallbackIssueTypes = (response.data.issueTypes ?? [])
        .map((t) => t.name?.trim())
        .filter((name): name is string => !!name);

      logger.warn('JIRA issue types fallback used', {
        projectKey,
        issueTypesCount: fallbackIssueTypes.length,
        issueTypesSample: fallbackIssueTypes.slice(0, 20),
      });

      return fallbackIssueTypes;
    }
  }

  /**
   * Récupère une issue unique par clé.
   */
  async getIssue(issueKey: string, fields: string[]): Promise<JiraIssue> {
    const response = await this.client.get<JiraIssue>(`/issue/${issueKey}`, {
      params: { fields: fields.join(',') },
    });
    return response.data;
  }

  /**
   * Récupère le profil d'un utilisateur JIRA par accountId.
   */
  async getUser(accountId: string): Promise<JiraUserInfo | null> {
    try {
      const resp = await this.client.get<JiraUserInfo>('/user', { params: { accountId } });
      return resp.data;
    } catch {
      return null;
    }
  }

  /**
   * Récupère les groupes Jira d'un utilisateur.
   * Retourne [] si l'instance ne permet pas de lire les groupes.
   */
  async getUserGroups(accountId: string): Promise<string[]> {
    try {
      const resp = await this.client.get<JiraUserWithGroupsResponse>('/user', {
        params: { accountId, expand: 'groups' },
      });
      return (resp.data.groups?.items ?? [])
        .map((g) => g.name?.trim())
        .filter((name): name is string => !!name)
        .sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  /**
   * Récupère en bulk les profils JIRA pour une liste d'accountIds (max 10 par appel).
   * GET /rest/api/3/user/bulk?accountId=X&accountId=Y
   */
  async getUserBulk(accountIds: string[]): Promise<JiraUserInfo[]> {
    if (accountIds.length === 0) return [];

    const results: JiraUserInfo[] = [];
    // Atlassian limite à 10 accountIds par requête
    const CHUNK = 10;

    for (let i = 0; i < accountIds.length; i += CHUNK) {
      const chunk = accountIds.slice(i, i + CHUNK);
      try {
        const params = new URLSearchParams();
        for (const id of chunk) params.append('accountId', id);

        const resp = await this.client.get<{ values: JiraUserInfo[] }>(
          `/user/bulk?${params.toString()}`,
        );
        results.push(...(resp.data.values ?? []));
      } catch {
        // Si le bulk échoue, on tente les appels individuels
        for (const id of chunk) {
          const u = await this.getUser(id);
          if (u) results.push(u);
        }
      }
    }

    return results;
  }

  /**
   * Récupère les membres affectés à un projet JIRA via les rôles projet.
   * Cela évite les faux positifs des utilisateurs simplement assignables.
   */
  async getProjectMembers(projectKey: string): Promise<JiraProjectMember[]> {
    const membersMap = new Map<string, JiraProjectMember>();

    const rolesResp = await this.client.get<Record<string, string>>(`/project/${projectKey}/role`);
    const roleUrls = Object.values(rolesResp.data ?? {});

    for (const roleUrl of roleUrls) {
      try {
        const roleResp = await this.client.get<{
          actors?: Array<{
            displayName?: string;
            name?: string;
            actorUser?: {
              accountId?: string;
              displayName?: string;
              emailAddress?: string;
              active?: boolean;
            };
          }>;
        }>(roleUrl);

        for (const actor of roleResp.data.actors ?? []) {
          const user = actor.actorUser;
          if (!user?.accountId) continue;
          const resolvedDisplayName = actor.displayName?.trim()
            || user.displayName?.trim()
            || actor.name?.trim()
            || user.accountId;

          if (!membersMap.has(user.accountId)) {
            membersMap.set(user.accountId, {
              accountId: user.accountId,
              displayName: resolvedDisplayName,
              emailAddress: user.emailAddress,
              active: user.active,
            });
          } else {
            const existing = membersMap.get(user.accountId)!;
            // Si on avait seulement un fallback technique, on le remplace par un vrai nom.
            if (existing.displayName === existing.accountId && resolvedDisplayName !== user.accountId) {
              existing.displayName = resolvedDisplayName;
            }
          }
        }
      } catch {
        // Un rôle peut être inaccessible selon les permissions; on continue.
      }
    }

    logger.info('JIRA project members resolved from roles', {
      projectKey,
      rolesCount: roleUrls.length,
      uniqueMembers: membersMap.size,
    });

    return [...membersMap.values()];
  }

  /**
   * Récupère les worklogs natifs JIRA d'une issue, paginés.
   */
  async *getIssueWorklogs(issueIdOrKey: string): AsyncGenerator<JiraWorklogEntry> {
    let startAt = 0;
    const maxResults = 100;

    while (true) {
      const resp = await this.client.get<{
        startAt: number;
        maxResults: number;
        total: number;
        worklogs: JiraWorklogEntry[];
      }>(`/issue/${issueIdOrKey}/worklog`, { params: { startAt, maxResults } });

      const { worklogs, total } = resp.data;
      for (const w of worklogs) yield w;

      startAt += worklogs.length;
      if (startAt >= total || worklogs.length === 0) break;
    }
  }

  /**
   * Vérifie la connectivité avec le serveur JIRA (DA-001).
   */
  async testConnection(): Promise<{ ok: boolean; serverInfo?: unknown; user?: string; error?: string }> {
    try {
      // /myself requires authentication — validates credentials, not just connectivity
      const userResp = await this.client.get('/myself');
      const displayName = userResp.data?.displayName ?? userResp.data?.emailAddress ?? 'Unknown';

      // Also fetch server info for metadata
      const serverResp = await this.client.get('/serverInfo');

      return { ok: true, serverInfo: serverResp.data, user: displayName };
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const status = err.response.status;
        const body = err.response.data;
        const detail = body?.message || body?.errorMessages?.[0] || '';
        if (status === 401) return { ok: false, error: `Authentification refusée (401). Vérifiez l'email et le token API.${detail ? ' ' + detail : ''}` };
        if (status === 403) return { ok: false, error: `Accès interdit (403). Le compte n'a pas les permissions nécessaires.${detail ? ' ' + detail : ''}` };
        return { ok: false, error: `Erreur HTTP ${status}${detail ? ' : ' + detail : ''}` };
      }
      const message = err instanceof Error ? err.message : String(err);
      // Simplify common network errors
      if (message.includes('ENOTFOUND')) return { ok: false, error: 'URL introuvable. Vérifiez l\'adresse de l\'instance JIRA.' };
      if (message.includes('ECONNREFUSED')) return { ok: false, error: 'Connexion refusée. Le serveur JIRA est inaccessible.' };
      if (message.includes('timeout')) return { ok: false, error: 'Délai d\'attente dépassé. Le serveur JIRA ne répond pas.' };
      return { ok: false, error: message };
    }
  }
}
