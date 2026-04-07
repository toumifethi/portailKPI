import axios, { AxiosInstance } from 'axios';
import { logger } from '@/utils/logger';

export interface TempoWorklog {
  tempoWorklogId: number;
  jiraWorklogId: number;
  issue: { self: string; id: number };
  timeSpentSeconds: number;
  billableSeconds: number;
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM:SS
  description: string;
  createdAt: string;
  updatedAt: string;
  author: { accountId: string; displayName: string };
  attributes: Array<{ key: string; value: string }>;
}

export interface TempoWorklogPage {
  metadata: {
    count: number;
    offset: number;
    limit: number;
    next?: string;
  };
  results: TempoWorklog[];
}

/**
 * Client Tempo Cloud REST API v4.
 * Paginated worklogs for a date range (DA-003).
 */
export class TempoClient {
  private client: AxiosInstance;

  constructor(apiToken: string) {
    this.client = axios.create({
      baseURL: 'https://api.tempo.io/4',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    });
  }

  /**
   * Récupère tous les worklogs d'un projet sur une plage de dates, en paginant.
   */
  async *getWorklogsForProject(
    projectKey: string,
    from: string,
    to: string,
    limit = 1000,
  ): AsyncGenerator<TempoWorklog> {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await this.client.get<TempoWorklogPage>('/worklogs', {
        params: {
          projectKey,
          from,
          to,
          offset,
          limit,
        },
      });

      const { results, metadata } = response.data;

      logger.debug('Tempo worklogs page fetched', {
        projectKey,
        from,
        to,
        offset,
        count: results.length,
        total: metadata.count,
      });

      for (const worklog of results) {
        yield worklog;
      }

      offset += results.length;
      hasMore = !!metadata.next && results.length > 0;
    }
  }

  /**
   * Récupère les worklogs d'un utilisateur sur une plage de dates.
   */
  async *getWorklogsForUser(
    accountId: string,
    from: string,
    to: string,
    limit = 1000,
  ): AsyncGenerator<TempoWorklog> {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await this.client.get<TempoWorklogPage>(
        `/worklogs/user/${accountId}`,
        { params: { from, to, offset, limit } },
      );

      const { results, metadata } = response.data;

      for (const worklog of results) {
        yield worklog;
      }

      offset += results.length;
      hasMore = !!metadata.next && results.length > 0;
    }
  }

  /**
   * Vérifie la connectivité avec l'API Tempo.
   */
  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.get('/worklogs', {
        params: { from: '2020-01-01', to: '2020-01-01', limit: 1 },
      });
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }
}
