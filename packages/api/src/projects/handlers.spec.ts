import { MAX_CHAT_PROJECT_INSTRUCTIONS_LENGTH } from 'librechat-data-provider';
import type { ChatProjectMethods } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { GetProjectFiles } from './resources';
import { createProjectHandlers } from './handlers';

const projectId = '507f1f77bcf86cd799439011';

function request(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'owner', tenantId: 'tenant-a' },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as never;
}

function response() {
  const result = { statusCode: 200, body: undefined as unknown };
  const res = {
    status: jest.fn((statusCode: number) => {
      result.statusCode = statusCode;
      return res;
    }),
    json: jest.fn((body: unknown) => {
      result.body = body;
      return res;
    }),
  } as unknown as Response;
  return { res, result };
}

function setup(overrides: Record<string, unknown> = {}) {
  const deps = {
    listChatProjects: jest.fn(),
    createChatProject: jest.fn().mockResolvedValue({ _id: projectId }),
    getChatProject: jest.fn().mockResolvedValue({ _id: projectId, file_ids: [] }),
    updateChatProject: jest.fn().mockResolvedValue({ _id: projectId }),
    deleteChatProject: jest.fn().mockResolvedValue({ deletedCount: 1, modifiedCount: 1 }),
    assignConversationToProject: jest.fn(),
    addChatProjectFile: jest.fn().mockResolvedValue({ _id: projectId }),
    removeChatProjectFile: jest.fn().mockResolvedValue({ _id: projectId }),
    getFiles: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as ChatProjectMethods & { getFiles: GetProjectFiles };
  return { handlers: createProjectHandlers(deps), deps };
}

describe('ChatProject handlers', () => {
  it.each([
    ['non-string', 42],
    ['oversized', 'x'.repeat(MAX_CHAT_PROJECT_INSTRUCTIONS_LENGTH + 1)],
  ])('rejects %s instructions on create before persistence', async (_label, instructions) => {
    const { handlers, deps } = setup();
    const { res, result } = response();
    await handlers.createProject(request({ body: { name: 'Project', instructions } }), res);
    expect(result.statusCode).toBe(400);
    expect(deps.createChatProject).not.toHaveBeenCalled();
  });

  it('rejects invalid update instructions before persistence', async () => {
    const { handlers, deps } = setup();
    const { res, result } = response();
    await handlers.updateProject(
      request({ params: { projectId }, body: { instructions: null } }),
      res,
    );
    expect(result.statusCode).toBe(400);
    expect(deps.updateChatProject).not.toHaveBeenCalled();
  });

  it('surfaces atomic resource errors without pretending the attach succeeded', async () => {
    const { handlers } = setup({
      addChatProjectFile: jest.fn().mockRejectedValue(new Error('Project file limit reached')),
    });
    const { res, result } = response();
    await handlers.addProjectFile(
      request({ params: { projectId }, body: { file_id: 'file-1' } }),
      res,
    );
    expect(result.statusCode).toBe(409);
    expect(result.body).toEqual({ error: 'Project file limit reached' });
  });

  it('keeps missing resource references as unavailable placeholders', async () => {
    const { handlers } = setup({
      getChatProject: jest.fn().mockResolvedValue({ _id: projectId, file_ids: ['gone'] }),
    });
    const { res, result } = response();
    await handlers.listProjectFiles(request({ params: { projectId } }), res);
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual([{ file_id: 'gone', availability: 'unavailable' }]);
  });
});
