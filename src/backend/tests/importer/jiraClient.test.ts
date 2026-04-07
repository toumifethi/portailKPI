import axios from 'axios';
import { JiraClient } from '@/importer/jiraClient';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockGet = jest.fn();
mockedAxios.create.mockReturnValue({ get: mockGet } as unknown as ReturnType<typeof axios.create>);

describe('JiraClient', () => {
  let client: JiraClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new JiraClient('https://mycompany.atlassian.net', 'user@test.com', 'token123', 2);
  });

  describe('testConnection', () => {
    it('retourne ok:true si le serveur répond', async () => {
      mockGet.mockResolvedValueOnce({ data: { version: '8.0' } });

      const result = await client.testConnection();

      expect(result.ok).toBe(true);
      expect(result.serverInfo).toEqual({ version: '8.0' });
    });

    it('retourne ok:false en cas d\'erreur réseau', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network Error'));

      const result = await client.testConnection();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Network Error');
    });
  });

  describe('searchIssues', () => {
    it('pagine automatiquement jusqu\'à la fin', async () => {
      // Page 1: 2 issues (pageSize=2)
      mockGet.mockResolvedValueOnce({
        data: {
          total: 3,
          startAt: 0,
          maxResults: 2,
          issues: [
            { id: '1', key: 'PROJ-1', fields: { summary: 'Issue 1', status: { name: 'Done' }, issuetype: { name: 'Bug' }, assignee: null, priority: null, project: { key: 'PROJ', name: 'Project' }, created: '2025-01-01', updated: '2025-01-01', resolutiondate: null, timeoriginalestimate: null, timespent: null, subtasks: [], labels: [] } },
            { id: '2', key: 'PROJ-2', fields: { summary: 'Issue 2', status: { name: 'Open' }, issuetype: { name: 'Story' }, assignee: null, priority: null, project: { key: 'PROJ', name: 'Project' }, created: '2025-01-02', updated: '2025-01-02', resolutiondate: null, timeoriginalestimate: null, timespent: null, subtasks: [], labels: [] } },
          ],
        },
      });
      // Page 2: 1 issue
      mockGet.mockResolvedValueOnce({
        data: {
          total: 3,
          startAt: 2,
          maxResults: 2,
          issues: [
            { id: '3', key: 'PROJ-3', fields: { summary: 'Issue 3', status: { name: 'Open' }, issuetype: { name: 'Task' }, assignee: null, priority: null, project: { key: 'PROJ', name: 'Project' }, created: '2025-01-03', updated: '2025-01-03', resolutiondate: null, timeoriginalestimate: null, timespent: null, subtasks: [], labels: [] } },
          ],
        },
      });

      const issues = [];
      for await (const issue of client.searchIssues('project = PROJ', ['summary'])) {
        issues.push(issue);
      }

      expect(issues).toHaveLength(3);
      expect(mockGet).toHaveBeenCalledTimes(2);
    });

    it('s\'arrête si la page retournée est vide', async () => {
      mockGet.mockResolvedValueOnce({
        data: { total: 10, startAt: 0, maxResults: 2, issues: [] },
      });

      const issues = [];
      for await (const issue of client.searchIssues('project = PROJ', ['summary'])) {
        issues.push(issue);
      }

      expect(issues).toHaveLength(0);
      expect(mockGet).toHaveBeenCalledTimes(1);
    });
  });

  describe('getProjects', () => {
    it('retourne la liste des projets', async () => {
      mockGet.mockResolvedValueOnce({
        data: { values: [{ id: '10001', key: 'PROJ', name: 'My Project', projectTypeKey: 'software' }] },
      });

      const projects = await client.getProjects();

      expect(projects).toHaveLength(1);
      expect(projects[0].key).toBe('PROJ');
    });
  });
});
