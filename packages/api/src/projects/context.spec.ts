import { getChatProjectContextKey, resolveChatProjectContext } from './context';
import { PARTIAL_RESOLVED_CONVERSATION } from '../agents/guard';

const project = {
  _id: 'project-a',
  instructions: 'Use the project policy.',
  contextRevision: 3,
  file_ids: ['file-a'],
};

describe('resolveChatProjectContext', () => {
  it('uses existing conversation membership over a request project override', async () => {
    const getChatProject = jest.fn().mockResolvedValue(project);
    const context = await resolveChatProjectContext(
      {
        userId: 'user-a',
        conversationId: 'conversation-a',
        requestedProjectId: 'project-b',
        resolvedConversation: { conversationId: 'conversation-a', chatProjectId: 'project-a' },
      },
      { getConvo: jest.fn(), getChatProject },
    );

    expect(context?.projectId).toBe('project-a');
    expect(getChatProject).toHaveBeenCalledWith('user-a', 'project-a');
    expect(getChatProject).toHaveBeenCalledTimes(1);
  });

  it('preserves an authoritative unscoped conversation', async () => {
    const getChatProject = jest.fn();
    await expect(
      resolveChatProjectContext(
        {
          userId: 'user-a',
          conversationId: 'conversation-a',
          requestedProjectId: 'project-a',
          resolvedConversation: { conversationId: 'conversation-a', chatProjectId: null },
        },
        { getConvo: jest.fn(), getChatProject },
      ),
    ).resolves.toBeNull();
    expect(getChatProject).not.toHaveBeenCalled();
  });

  it('does not reassign legacy conversations that have no membership field', async () => {
    await expect(
      resolveChatProjectContext(
        {
          userId: 'user-a',
          conversationId: 'conversation-a',
          requestedProjectId: 'project-a',
          resolvedConversation: { conversationId: 'conversation-a' },
        },
        { getConvo: jest.fn(), getChatProject: jest.fn().mockResolvedValue(project) },
      ),
    ).resolves.toBeNull();
  });

  it('reloads partial event snapshots instead of inheriting their stale Project', async () => {
    const partial = {
      conversationId: 'conversation-a',
      chatProjectId: 'stale-project',
      [PARTIAL_RESOLVED_CONVERSATION]: true,
    };
    const context = await resolveChatProjectContext(
      {
        userId: 'user-a',
        conversationId: 'conversation-a',
        resolvedConversation: partial,
      },
      {
        getConvo: jest.fn().mockResolvedValue({
          conversationId: 'conversation-a',
          chatProjectId: 'project-a',
        }),
        getChatProject: jest.fn().mockResolvedValue(project),
      },
    );
    expect(context?.projectId).toBe('project-a');
  });

  it('rejects a Project from a different or missing tenant scope', async () => {
    for (const projectTenant of ['tenant-b', undefined]) {
      await expect(
        resolveChatProjectContext(
          { userId: 'user-a', tenantId: 'tenant-a', requestedProjectId: 'project-a' },
          {
            getConvo: jest.fn(),
            getChatProject: jest.fn().mockResolvedValue({ ...project, tenantId: projectTenant }),
          },
        ),
      ).rejects.toThrow('Project context unavailable');
    }
  });

  it('rejects an unauthorized requested project for a new conversation', async () => {
    await expect(
      resolveChatProjectContext(
        { userId: 'user-a', requestedProjectId: 'project-a' },
        { getConvo: jest.fn(), getChatProject: jest.fn().mockResolvedValue(null) },
      ),
    ).rejects.toThrow('Project context unavailable');
  });

  it('changes its stable key when revision or resources change without exposing instructions', () => {
    const first = getChatProjectContextKey({
      projectId: 'project-a',
      contextRevision: 1,
      instructions: 'secret one',
      file_ids: ['file-a'],
    });
    const second = getChatProjectContextKey({
      projectId: 'project-a',
      contextRevision: 2,
      instructions: 'secret two',
      file_ids: ['file-b'],
    });

    expect(first).not.toContain('secret');
    expect(first).not.toBe(second);
  });
});
