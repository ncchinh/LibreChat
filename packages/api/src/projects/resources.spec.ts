import mongoose from 'mongoose';
import { FileContext } from 'librechat-data-provider';
import { createModels } from '@librechat/data-schemas';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IChatProject, IMongoFile } from '@librechat/data-schemas';
import {
  getChatProjectFileAvailability,
  listChatProjectFileViews,
  resolveChatProjectFiles,
  type GetProjectFiles,
} from './resources';

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let File: mongoose.Model<IMongoFile>;
let modelsToCleanup: string[] = [];

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const models = createModels(mongoose);
  modelsToCleanup = Object.keys(models);
  Object.assign(mongoose.models, models);
  File = mongoose.models.File as mongoose.Model<IMongoFile>;
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  for (const modelName of modelsToCleanup) {
    if (mongoose.models[modelName]) {
      delete mongoose.models[modelName];
    }
  }
});

afterEach(async () => {
  await File.deleteMany({});
});

const file = (
  file_id: string,
  user: string,
  overrides: Partial<IMongoFile> = {},
): Partial<IMongoFile> => ({
  file_id,
  user: new mongoose.Types.ObjectId(user),
  filename: `${file_id}.txt`,
  filepath: `/tmp/${file_id}`,
  bytes: 12,
  object: 'file',
  type: 'text/plain',
  usage: 0,
  source: 'local',
  embedded: true,
  context: FileContext.message_attachment,
  text: 'must never be loaded',
  ...overrides,
});

describe('ChatProject resource hydration', () => {
  it('only marks canonical unscoped message attachments ready', () => {
    expect(
      getChatProjectFileAvailability(
        file('ready', new mongoose.Types.ObjectId().toString()) as IMongoFile,
      ),
    ).toBe('ready');
    expect(
      getChatProjectFileAvailability(
        file('agent', new mongoose.Types.ObjectId().toString(), {
          context: FileContext.agents,
        }) as IMongoFile,
      ),
    ).toBe('unavailable');
    expect(
      getChatProjectFileAvailability(
        file('not-indexed', new mongoose.Types.ObjectId().toString(), {
          embedded: false,
        }) as IMongoFile,
      ),
    ).toBe('unavailable');
    expect(
      getChatProjectFileAvailability(
        file('expired', new mongoose.Types.ObjectId().toString(), {
          expiredAt: new Date(Date.now() - 1),
        }) as IMongoFile,
      ),
    ).toBe('unavailable');
  });

  it('hydrates ready runtime files and safe unavailable views from canonical Mongo records', async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const tenantId = 'tenant-a';
    await File.create(file('ready', owner, { tenantId }));
    await File.create(file('expired', owner, { tenantId, expiredAt: new Date(Date.now() - 1) }));
    await File.create(file('agent-scoped', owner, { tenantId, context: FileContext.agents }));
    await File.create(file('foreign', new mongoose.Types.ObjectId().toString(), { tenantId }));

    const getFiles: GetProjectFiles = async (filter, _sort, select) =>
      (await File.find(filter)
        .select(select ?? {})
        .lean()) as unknown as IMongoFile[];
    const project = {
      file_ids: ['ready', 'expired', 'agent-scoped', 'foreign', 'missing'],
      tenantId,
    } as Pick<IChatProject, 'file_ids' | 'tenantId'>;

    const runtimeFiles = await resolveChatProjectFiles({
      project,
      userId: owner,
      tenantId,
      getFiles,
    });
    expect(runtimeFiles.map((runtimeFile) => runtimeFile.file_id)).toEqual(['ready']);
    expect(runtimeFiles[0]).not.toHaveProperty('text');

    const views = await listChatProjectFileViews({
      project,
      userId: owner,
      tenantId,
      getFiles,
    });
    expect(views).toEqual([
      {
        file_id: 'ready',
        filename: 'ready.txt',
        type: 'text/plain',
        bytes: 12,
        availability: 'ready',
      },
      {
        file_id: 'expired',
        filename: 'expired.txt',
        type: 'text/plain',
        bytes: 12,
        availability: 'unavailable',
      },
      {
        file_id: 'agent-scoped',
        availability: 'unavailable',
      },
      { file_id: 'foreign', availability: 'unavailable' },
      { file_id: 'missing', availability: 'unavailable' },
    ]);
  });
});
