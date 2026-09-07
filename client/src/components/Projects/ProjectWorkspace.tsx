import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';
import * as Ariakit from '@ariakit/react';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys } from 'librechat-data-provider';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Button,
  DropdownPopup,
  EmptyState,
  Spinner,
  TooltipAnchor,
  useMediaQuery,
} from '@librechat/client';
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  Folder,
  Info,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import type { ConversationListResponse } from 'librechat-data-provider';
import {
  useConversationsInfiniteQuery,
  useGetStartupConfig,
  useProjectQuery,
} from '~/data-provider';
import ProjectInstructionsDialog from './ProjectInstructionsDialog';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import ProjectDeleteDialog from './ProjectDeleteDialog';
import { useLocalize, useNewConvo } from '~/hooks';
import ProjectResources from './ProjectResources';
import { clearMessagesCache, cn } from '~/utils';
import ProjectChatList from './ProjectChatList';
import ProjectEditor from './ProjectEditor';
import store from '~/store';

type ChatSortField = 'updatedAt' | 'createdAt';

export default function ProjectWorkspace() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { projectId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sortBy, setSortBy] = useState<ChatSortField>('updatedAt');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [initialEditField, setInitialEditField] = useState<'name' | 'description'>('name');
  const isEditOpen = editingProjectId === projectId || searchParams.get('edit') === '1';
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const projectMenuId = useId();
  const sortMenuId = useId();
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const titleButtonRef = useRef<HTMLButtonElement>(null);
  const descriptionButtonRef = useRef<HTMLButtonElement>(null);
  const deleteMenuRef = useRef<HTMLButtonElement>(null);
  const { data: project, isLoading: isProjectLoading } = useProjectQuery(projectId);
  const { data: startupConfig } = useGetStartupConfig();
  const isRagEnabled = startupConfig?.ragEnabled === true;
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { newConversation } = useNewConvo();
  const activeProjectId = project?._id;
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  const startEditing = (field: 'name' | 'description') => {
    setInitialEditField(field);
    setEditingProjectId(projectId);
  };

  const finishEditing = () => {
    setEditingProjectId(null);
    if (searchParams.has('edit')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('edit');
      setSearchParams(nextParams, { replace: true });
    }
    requestAnimationFrame(() => {
      const target = initialEditField === 'description' ? descriptionButtonRef : titleButtonRef;
      target.current?.focus();
    });
  };

  const sortOptions = useMemo(
    () => [
      { value: 'updatedAt' as const, label: localize('com_ui_sort_updated') },
      { value: 'createdAt' as const, label: localize('com_ui_sort_created') },
    ],
    [localize],
  );
  const selectedSortLabel =
    sortOptions.find((option) => option.value === sortBy)?.label ?? localize('com_ui_sort_updated');

  const {
    data,
    fetchNextPage,
    isFetchingNextPage,
    isLoading: isConversationsLoading,
  } = useConversationsInfiniteQuery(
    {
      projectId: activeProjectId,
      sortBy,
      sortDirection: 'desc',
    },
    {
      enabled: Boolean(activeProjectId),
      staleTime: 30000,
      cacheTime: 300000,
    },
  );

  const conversations = useMemo(
    () => data?.pages.flatMap((page) => page.conversations) ?? [],
    [data?.pages],
  );

  const hasNextPage = useMemo(() => {
    const pages = data?.pages;
    if (!pages?.length) {
      return false;
    }
    const lastPage: ConversationListResponse = pages[pages.length - 1];
    return lastPage.nextCursor !== null;
  }, [data?.pages]);

  const startProjectChat = useCallback(() => {
    if (!activeProjectId) {
      return;
    }
    clearMessagesCache(queryClient, conversation?.conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);
    navigate(`/c/${Constants.NEW_CONVO}?projectId=${encodeURIComponent(activeProjectId)}`);
    newConversation({ template: { chatProjectId: activeProjectId } });
  }, [activeProjectId, conversation?.conversationId, navigate, newConversation, queryClient]);

  if (isProjectLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-presentation">
        <Spinner className="text-text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-presentation px-6 text-center">
        <p className="text-sm text-text-secondary">{localize('com_ui_project_not_found')}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => navigate('/projects')}>
          {localize('com_ui_all_projects')}
        </Button>
      </div>
    );
  }

  return (
    <main className="flex h-full min-h-0 min-w-0 flex-col overflow-y-auto bg-presentation text-text-primary">
      <header className="sticky top-0 z-10 border-b border-border-light bg-presentation">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4 md:h-16 md:px-6">
          {isSmallScreen ? <OpenSidebar className="size-9 shrink-0" /> : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/projects')}
            className="-ml-1.5 text-text-secondary"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {localize('com_ui_all_projects')}
          </Button>
          <Button
            type="button"
            size="sm"
            className="ml-auto size-9 shrink-0 p-0 sm:w-auto sm:px-3"
            variant="default"
            onClick={startProjectChat}
            aria-label={localize('com_ui_new_chat_in_project', { name: project.name })}
          >
            <Plus className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{localize('com_ui_new_chat')}</span>
          </Button>
          <DropdownPopup
            portal={true}
            focusLoop={true}
            unmountOnHide={true}
            menuId={projectMenuId}
            isOpen={isProjectMenuOpen}
            setIsOpen={setIsProjectMenuOpen}
            finalFocus={isEditOpen ? nameInputRef : undefined}
            trigger={
              <Ariakit.MenuButton
                aria-label={localize('com_ui_project_options')}
                className="shrink-0 aria-expanded:bg-surface-hover"
                render={<Button type="button" variant="ghost" size="icon" />}
              >
                <MoreHorizontal className="size-5" aria-hidden="true" />
              </Ariakit.MenuButton>
            }
            items={[
              {
                label: localize('com_ui_edit_project'),
                icon: <Pencil className="size-4 text-text-secondary" aria-hidden="true" />,
                onClick: () => startEditing('name'),
              },
              {
                label: localize('com_ui_delete_project_action'),
                icon: <Trash2 className="size-4 text-text-secondary" aria-hidden="true" />,
                onClick: () => setIsDeleteOpen(true),
                hideOnClick: false,
                ref: deleteMenuRef,
                render: (props) => <button {...props} />,
              },
            ]}
          />
        </div>
      </header>

      <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-1 flex-col px-4 py-6 md:px-6 md:py-8">
        {isEditOpen ? (
          <ProjectEditor
            key={project._id}
            project={project}
            inputRef={nameInputRef}
            initialField={initialEditField}
            onDone={finishEditing}
          />
        ) : (
          <div className="min-w-0">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface-secondary text-text-secondary">
                <Folder className="size-6" aria-hidden="true" />
              </span>
              <h1 className="min-w-0 flex-1">
                <Button
                  ref={titleButtonRef}
                  type="button"
                  variant="ghost"
                  onClick={() => startEditing('name')}
                  className="h-auto min-h-12 w-full min-w-0 justify-start whitespace-normal px-0 py-1 text-left text-2xl font-semibold tracking-tight"
                >
                  <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere] md:line-clamp-1">
                    {project.name}
                  </span>
                </Button>
              </h1>
            </div>
            <Button
              ref={descriptionButtonRef}
              type="button"
              variant="ghost"
              onClick={() => startEditing('description')}
              className="mt-2 h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal px-0 py-1 text-left text-sm font-normal leading-relaxed text-text-secondary"
            >
              <span className="line-clamp-3 min-w-0 [overflow-wrap:anywhere]">
                {project.description || localize('com_ui_add_description')}
              </span>
            </Button>
          </div>
        )}

        <ProjectDeleteDialog
          open={isDeleteOpen}
          onOpenChange={setIsDeleteOpen}
          project={project}
          triggerRef={deleteMenuRef}
        />
        <ProjectInstructionsDialog
          open={isInstructionsOpen}
          onOpenChange={setIsInstructionsOpen}
          project={project}
        />
        <div
          className={cn('mt-6 grid min-w-0 auto-rows-fr gap-4', isRagEnabled && 'lg:grid-cols-2')}
        >
          <section
            className="min-w-0 rounded-2xl border border-border-light bg-surface-secondary p-4 sm:p-5"
            aria-labelledby="project-instructions-heading"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                <h2
                  id="project-instructions-heading"
                  className="text-sm font-semibold text-text-primary"
                >
                  {localize('com_ui_project_instructions')}
                </h2>
                <TooltipAnchor
                  description={localize('com_ui_project_instructions_future_turns')}
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="relative size-7 shrink-0 text-text-secondary after:absolute after:-inset-1.5"
                      aria-label={localize('com_ui_project_instructions_info')}
                    >
                      <Info className="size-3.5" aria-hidden="true" />
                    </Button>
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={localize('com_ui_project_edit_instructions')}
                onClick={() => setIsInstructionsOpen(true)}
              >
                <Pencil className="size-4" aria-hidden="true" />
                {localize('com_ui_edit')}
              </Button>
            </div>
            <div
              role="region"
              aria-label={localize('com_ui_project_instructions_preview')}
              tabIndex={project.instructions?.trim() ? 0 : undefined}
              className="h-48 overflow-y-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-primary"
            >
              {project.instructions?.trim() ? (
                <p className="whitespace-pre-wrap text-base leading-relaxed text-text-secondary [overflow-wrap:anywhere]">
                  {project.instructions}
                </p>
              ) : (
                <EmptyState
                  icon={NotebookPen}
                  description={localize('com_ui_project_no_instructions')}
                  className="h-full border-0"
                />
              )}
            </div>
          </section>
          {isRagEnabled && <ProjectResources project={project} />}
        </div>

        <section
          className="mt-8 flex min-h-0 flex-1 flex-col"
          aria-labelledby="project-chats-heading"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2
              id="project-chats-heading"
              className="flex items-baseline gap-2 text-sm font-semibold text-text-primary"
            >
              {localize('com_ui_chats')}
              <span className="tabular-nums text-text-secondary">{project.conversationCount}</span>
            </h2>
            <DropdownPopup
              portal={true}
              focusLoop={true}
              unmountOnHide={true}
              menuId={sortMenuId}
              isOpen={isSortMenuOpen}
              setIsOpen={setIsSortMenuOpen}
              trigger={
                <Ariakit.MenuButton
                  aria-label={localize('com_ui_sort_chats_by')}
                  className="aria-expanded:bg-surface-hover"
                  render={<Button type="button" variant="ghost" size="sm" />}
                >
                  <ArrowUpDown className="size-4" aria-hidden="true" />
                  {selectedSortLabel}
                </Ariakit.MenuButton>
              }
              items={sortOptions.map((option) => ({
                label: option.label,
                ariaChecked: sortBy === option.value,
                icon:
                  sortBy === option.value ? (
                    <Check className="size-4 text-text-secondary" aria-hidden="true" />
                  ) : (
                    <span className="size-4" aria-hidden="true" />
                  ),
                onClick: () => setSortBy(option.value),
              }))}
            />
          </div>
          <ProjectChatList
            conversations={conversations}
            isLoading={isConversationsLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            sortBy={sortBy}
            emptyLabel={localize('com_ui_no_project_chats')}
            loadMore={() => fetchNextPage()}
          />
        </section>
      </div>
    </main>
  );
}
