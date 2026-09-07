# Persistent Chat Projects

Chat Projects are private workspaces for reusable context, not Agents or automatic memory.
A Project contains its name and description, model-facing instructions, references to searchable
files, and conversations. It does not select a model, grant tools, change credentials, or retrieve
other conversations in the Project.

## Working in a Project

1. Create a Project and open its workspace.
2. Use **Instructions** for guidance that should apply across its conversations. The description
   remains a human-facing summary; it is not sent as Project instructions.
3. Under **Files**, use **Add files** to upload from your device or choose from your searchable files.
4. Start a conversation from the Project. Choose the model or Agent as usual.
5. The conversation's Project indicator links back to the workspace, where instructions and
   reference availability can be inspected and edited.

When `RAG_API_URL` is configured, Instructions and Files appear together above the chat list.
Otherwise, Files is hidden and Instructions fills the row. Their info icons explain how context
is used on hover or keyboard focus. Long instructions wrap within a scrollable preview.

Saved instructions apply to future turns, including turns in already-existing conversations.
Editing instructions does not rewrite historical messages. Moving a conversation to another
Project changes future context to the destination; removing it stops Project context. A turn
already running may finish with its starting context. Its save must not undo a Project move.

## Instructions and Agents

Project instructions use the existing per-run additional-instructions mechanism. They are
user-authored guidance explicitly subordinate to system/platform, model/Agent, and tool policies.
They supplement, rather than replace, the selected Agent or model's instructions. Existing
runtime guidance such as skills and tool policies remains in the same instruction assembly.
Project instructions are not concatenated into the visible user message or saved onto the Agent.

Conversation graph agents receive Project context; auxiliary memory extraction agents do not.
Projects do not change tool permissions, MCP authorization, approvals, execution environments,
provider credentials, RBAC, or administration settings. Existing model-bound content checks apply.

## Reference files

Project associations refer to canonical File records by `file_id`. Adding the same file to another
Project does not copy its binary or index. Removing a Project association, or deleting a Project,
does not delete the original file. An explicit original-file deletion or retention expiry makes
its remaining Project references unavailable.

The initial supported representation is **File Search**:

- Project uploads use the existing `/api/files` upload/indexing path with `endpoint=agents`,
  `message_file=true`, and `tool_resource=file_search`. This preserves the original in configured
  storage and uses the existing RAG index.
- Only the owner's indexed, unscoped message-attachment files are eligible for reuse. Files
  accessible only through an Agent permission are not eligible.
- Agent-specific knowledge indexes are not accepted. Their external retrieval entity is scoped
  to an Agent and is not recorded as reusable provenance on the File record.
- Files enter runtime File Search resources only when File Search is already enabled for that
  model/Agent and permitted by the deployment. Project files never enable a tool themselves.
- Retrieval selects relevant excerpts on demand. A **Ready** reference is not a claim that its
  full contents have been included in a model request. No Project file text is eagerly loaded
  into every turn.
- Hosted Assistants receive Project instructions but do not receive these RAG resources. Their
  provider-managed thread/vector-store resources are a separate representation.

Indexing is synchronous in the existing upload pipeline. **Processing** and **Failed** describe
that upload attempt in the workspace. A failed attempt is not represented as a successfully
attached file. Persisted references are **Ready** when their canonical record is eligible and
indexed, or **Unavailable** when missing, expired, or no longer eligible. These states are not
inferred from the unrelated rich-preview processing status.

Adding a reference consumes any temporary upload hold without extending the deployment's
retention deadline. `expiredAt` remains authoritative. Projects do not create a new retention
policy or storage backend.

## Authority, tenancy, and sharing

Project CRUD and assignment remain owner-only. The database tenant-isolation policy continues to
scope Project, conversation, and File access. Resource association requires both Project and
canonical File ownership in the same tenant; client file names, URLs, extracted text, and tool
settings are not accepted as authoritative resource data.

For an existing conversation, stored `chatProjectId` wins over request-carried Project IDs,
including when the stored conversation is unassigned. A new conversation may select a Project
only after server authorization. Normal turn persistence seeds membership only at insertion;
explicit assignment remains the mechanism for moving an existing conversation.

Public/shared snapshots do not gain private Project metadata, instructions, or file associations.
Sharing visible conversation content can still share material that the model has already quoted
in a response; it does not grant access to the private workspace or original files.

## Durable execution

`contextRevision` advances when normalized instructions or file associations change. Human-facing
metadata edits, conversation-stat updates, and idempotent association writes do not advance it.
Legacy documents normalize to empty instructions, no files, and revision zero without migration.

Event-actor compatibility includes Project identity/revision along with initialized instructions.
Changed context follows the existing incompatible-checkpoint cold reconstruction path.

Paused approval/question runs retain a server-private Project context key. The winning resume
claim re-resolves current conversation membership and Project context. If incompatible, it
terminates that generation and cleans up only its checkpoint namespace, returning HTTP 409 with
`code: PROJECT_CONTEXT_CHANGED`. Start a new turn rather than replaying partially executed tools.
Legacy paused work with no recorded key is not accepted against newly active Project context.

Normal chats, regeneration, scheduled/triggered chats, and durable continuations use the shared
server context resolution. API calls bound to an existing owned conversation inherit its context;
stateless API calls and new API conversations without a Project contract remain unscoped.

## HTTP and data contract

Existing Project requests remain valid without the new optional fields.

| Method | Path                                          | Behavior                                                |
| ------ | --------------------------------------------- | ------------------------------------------------------- |
| POST   | `/api/projects`                               | Create with name, optional description and instructions |
| GET    | `/api/projects/:projectId`                    | Read Project context and resource IDs                   |
| PATCH  | `/api/projects/:projectId`                    | Edit name, description, or instructions                 |
| GET    | `/api/projects/:projectId/files`              | Read safe resource metadata and availability            |
| POST   | `/api/projects/:projectId/files`              | Attach `{ "file_id": "canonical-file-id" }`             |
| DELETE | `/api/projects/:projectId/files/:fileId`      | Detach the reference, not the original                  |
| PUT    | `/api/projects/conversations/:conversationId` | Assign `{ "projectId": "id" }`, or null to remove       |

Instructions are limited to 16,000 characters and Project resources to 50 files. Resource additions
are atomic, idempotent, and bounded even under concurrent writes. Invalid instructions are rejected,
not silently truncated. Inaccessible Projects return not found; unavailable/ineligible file
associations are rejected, and exceeding the resource limit returns a conflict.

Project lists return `hasInstructions` and `fileCount` summaries instead of full instructions and
resource arrays. Project details contain `instructions`, `contextRevision`, and `file_ids`.
A turn reuses its already-authorized conversation and request-scoped Project/file resolution;
there is no process-global Project cache and no unbounded per-turn resource expansion.

## Deliberately outside this change

- Project-specific models, tools, skills, credentials, approval rules, or Agent configuration.
- Cross-chat memory and semantic retrieval across Project conversations.
- Team/shared Project permissions or workspace hierarchies.
- Automatic full-text context, image input, or code-environment file mounting.
- Reuse of Agent-scoped indexes without explicit canonical index provenance.
- A new asynchronous ingestion/retry service or provider vector-store synchronization.

Useful later changes are explicit index provenance for broader source reuse, durable ingestion
status/retry using the existing indexing service, and capability-gated representation selection for
code/provider resources. None should turn Project file associations into capability grants.
