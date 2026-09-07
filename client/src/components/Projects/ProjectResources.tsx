import { useId, useMemo, useRef, useState } from 'react';
import { v4 } from 'uuid';
import * as Ariakit from '@ariakit/react';
import { EToolResources, FileContext, MAX_CHAT_PROJECT_FILES } from 'librechat-data-provider';
import {
  ChevronDown,
  FilePlus2,
  Files,
  Info,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  Alert,
  Button,
  DropdownPopup,
  EmptyState,
  FileUpload,
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Spinner,
  TooltipAnchor,
  useToastContext,
} from '@librechat/client';
import type { TChatProjectFile, TFile } from 'librechat-data-provider';
import type { LocalizeFunction } from '~/common';
import {
  useAddProjectFileMutation,
  useGetFiles,
  useProjectFilesQuery,
  useRemoveProjectFileMutation,
  useUploadFileMutation,
} from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';
import { formatBytes } from '~/utils';
type ProjectResourcesProps = {
  project: { _id: string; fileCount?: number };
};

type UploadState = {
  id: string;
  filename: string;
  file: File;
  fileId?: string;
  status: 'processing' | 'failed';
};
function statusLabel(localize: LocalizeFunction, availability: TChatProjectFile['availability']) {
  return availability === 'ready'
    ? localize('com_ui_project_file_ready')
    : localize('com_ui_project_file_unavailable');
}

const isEligibleFile = (file: TFile) =>
  file.embedded === true &&
  file.context === FileContext.message_attachment &&
  (!file.expiredAt || new Date(file.expiredAt).getTime() > Date.now());

export default function ProjectResources({ project }: ProjectResourcesProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerMenuRef = useRef<HTMLButtonElement>(null);
  const fileMenuId = useId();
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [uploading, setUploading] = useState<UploadState[]>([]);
  const { data: projectFiles, isLoading, isError, refetch } = useProjectFilesQuery(project._id);
  const {
    data: files = [],
    isLoading: isFilesLoading,
    isError: isFilesError,
    refetch: refetchFiles,
  } = useGetFiles<TFile[]>({ enabled: isPickerOpen });
  const uploadFile = useUploadFileMutation();
  const addFile = useAddProjectFileMutation();
  const removeFile = useRemoveProjectFileMutation();
  const fileCount = projectFiles?.length ?? project.fileCount ?? 0;
  const hasFileCapacity = fileCount < MAX_CHAT_PROJECT_FILES;

  const attachedIds = useMemo(
    () => new Set((projectFiles ?? []).map((file) => file.file_id)),
    [projectFiles],
  );
  const eligibleFiles = useMemo(
    () => files.filter((file) => isEligibleFile(file) && !attachedIds.has(file.file_id)),
    [attachedIds, files],
  );

  const addExistingFile = async (fileId: string) => {
    try {
      await addFile.mutateAsync({ projectId: project._id, file_id: fileId });
      setIsPickerOpen(false);
    } catch {
      showToast({
        message: localize('com_ui_project_file_attach_error'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    }
  };

  const upload = async (selected: File, existingFileId?: string) => {
    const localId = v4();
    setUploading((current) => [
      ...current,
      {
        id: localId,
        filename: selected.name,
        file: selected,
        fileId: existingFileId,
        status: 'processing',
      },
    ]);
    try {
      let fileId = existingFileId;
      if (!fileId) {
        const formData = new FormData();
        formData.append('file', selected);
        formData.append('file_id', localId);
        formData.append('endpoint', 'agents');
        formData.append('message_file', 'true');
        formData.append('tool_resource', EToolResources.file_search);
        const uploaded = await uploadFile.mutateAsync(formData);
        if (!uploaded.file_id || !isEligibleFile(uploaded)) {
          throw new Error('Uploaded file is not eligible for project search');
        }
        fileId = uploaded.file_id;
        setUploading((current) =>
          current.map((item) => (item.id === localId ? { ...item, fileId } : item)),
        );
      }
      await addFile.mutateAsync({ projectId: project._id, file_id: fileId });
      setUploading((current) => current.filter((item) => item.id !== localId));
    } catch {
      setUploading((current) =>
        current.map((item) => (item.id === localId ? { ...item, status: 'failed' } : item)),
      );
    }
  };

  const handleUploadChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (selected) {
      void upload(selected);
    }
  };

  const remove = async (fileId: string) => {
    try {
      await removeFile.mutateAsync({ projectId: project._id, file_id: fileId });
    } catch {
      showToast({
        message: localize('com_ui_project_file_remove_error'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    }
  };

  const retryUpload = (item: UploadState) => {
    setUploading((current) => current.filter((candidate) => candidate.id !== item.id));
    void upload(item.file, item.fileId);
  };

  const dismissUpload = (id: string) => {
    setUploading((current) => current.filter((item) => item.id !== id));
  };

  return (
    <section
      className="min-w-0 rounded-2xl border border-border-light bg-surface-secondary p-4 sm:p-5"
      aria-labelledby="project-resources-heading"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <h2 id="project-resources-heading" className="text-sm font-semibold text-text-primary">
            {localize('com_ui_project_files')}
          </h2>
          <TooltipAnchor
            description={`${localize('com_ui_project_files_help')} ${localize('com_ui_project_files_retrieval_only')}`}
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative size-7 shrink-0 text-text-secondary after:absolute after:-inset-1.5"
                aria-label={localize('com_ui_project_files_info')}
              >
                <Info className="size-3.5" aria-hidden="true" />
              </Button>
            }
          />
        </div>
        <FileUpload ref={inputRef} handleFileChange={handleUploadChange}>
          <DropdownPopup
            portal={true}
            focusLoop={true}
            unmountOnHide={true}
            menuId={fileMenuId}
            isOpen={isFileMenuOpen}
            setIsOpen={setIsFileMenuOpen}
            trigger={
              <Ariakit.MenuButton
                disabled={!hasFileCapacity || uploadFile.isLoading || addFile.isLoading}
                className="aria-expanded:bg-surface-hover"
                render={<Button type="button" variant="outline" size="sm" />}
              >
                <Plus className="size-4" aria-hidden="true" />
                {localize('com_ui_project_add_files')}
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </Ariakit.MenuButton>
            }
            items={[
              {
                label: localize('com_ui_project_upload_file'),
                icon: <Upload className="size-4 text-text-secondary" aria-hidden="true" />,
                onClick: () => inputRef.current?.click(),
              },
              {
                label: localize('com_ui_project_choose_file'),
                icon: <Link2 className="size-4 text-text-secondary" aria-hidden="true" />,
                onClick: () => setIsPickerOpen(true),
                hideOnClick: false,
                ref: pickerMenuRef,
                render: (props) => <button {...props} />,
              },
            ]}
          />
        </FileUpload>
      </div>

      {!hasFileCapacity && (
        <p className="mb-3 text-xs text-text-secondary" role="note">
          {localize('com_ui_project_file_limit', { count: MAX_CHAT_PROJECT_FILES })}
        </p>
      )}
      {isError && (
        <Alert
          variant="error"
          icon={false}
          role="alert"
          className="flex items-center justify-between gap-3"
        >
          <span>{localize('com_ui_project_files_error')}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            {localize('com_ui_retry')}
          </Button>
        </Alert>
      )}
      {!isError && isLoading && (
        <div
          className="flex min-h-16 items-center justify-center rounded-xl border border-border-light bg-surface-secondary"
          role="status"
        >
          <Spinner className="size-4 text-text-secondary" />
          <span className="sr-only">{localize('com_ui_loading')}</span>
        </div>
      )}
      {!isError && !isLoading && (
        <div
          className="h-48 space-y-2 overflow-y-auto"
          role={uploading.length || projectFiles?.length ? 'list' : 'status'}
          aria-live="polite"
          aria-label={localize('com_ui_project_files')}
        >
          {uploading.map((item) => (
            <div
              key={item.id}
              role="listitem"
              className="flex items-center gap-3 rounded-xl border border-border-light bg-surface-secondary px-3.5 py-3"
            >
              {item.status === 'processing' ? (
                <Loader2
                  className="size-4 shrink-0 animate-spin text-text-secondary"
                  aria-hidden="true"
                />
              ) : (
                <FilePlus2 className="size-4 shrink-0 text-text-destructive" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                {item.filename}
              </span>
              <span className="text-xs text-text-secondary">
                {item.status === 'processing'
                  ? localize('com_ui_project_file_processing')
                  : localize('com_ui_project_file_failed')}
              </span>
              {item.status === 'failed' && (
                <>
                  <Button type="button" variant="ghost" size="sm" onClick={() => retryUpload(item)}>
                    {localize('com_ui_retry')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    aria-label={localize('com_ui_project_dismiss_upload', { name: item.filename })}
                    onClick={() => dismissUpload(item.id)}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </>
              )}
            </div>
          ))}
          {projectFiles?.map((file) => (
            <div
              key={file.file_id}
              role="listitem"
              className="flex items-center gap-3 rounded-xl border border-border-light bg-surface-secondary px-3.5 py-3"
            >
              <Paperclip className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
              <TooltipAnchor
                description={file.filename ?? file.file_id}
                render={
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                    {file.filename ?? file.file_id}
                  </span>
                }
              />
              <span
                className={
                  file.availability === 'ready'
                    ? 'text-xs text-text-secondary'
                    : 'text-xs text-text-destructive'
                }
              >
                {statusLabel(localize, file.availability)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label={localize('com_ui_project_remove_file', {
                  name: file.filename ?? file.file_id,
                })}
                onClick={() => void remove(file.file_id)}
                disabled={removeFile.isLoading}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          {!uploading.length && !projectFiles?.length && (
            <EmptyState
              icon={Files}
              description={localize('com_ui_project_no_files')}
              className="h-full border-0"
            />
          )}
        </div>
      )}

      <OGDialog open={isPickerOpen} onOpenChange={setIsPickerOpen} triggerRef={pickerMenuRef}>
        <OGDialogContent className="w-11/12 max-w-lg" showCloseButton={true}>
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_ui_project_choose_file')}</OGDialogTitle>
          </OGDialogHeader>
          <div
            className="mt-3 max-h-80 space-y-2 overflow-y-auto"
            role={!isFilesLoading && !isFilesError && eligibleFiles.length ? 'list' : 'status'}
            aria-label={localize('com_ui_project_choose_file')}
          >
            {isFilesLoading && (
              <div role="status" className="flex justify-center py-6">
                <Spinner className="size-4 text-text-secondary" />
                <span className="sr-only">{localize('com_ui_loading')}</span>
              </div>
            )}
            {isFilesError && (
              <Alert variant="error" role="alert">
                {localize('com_ui_project_files_error')}
                <Button type="button" variant="outline" size="sm" onClick={() => refetchFiles()}>
                  {localize('com_ui_retry')}
                </Button>
              </Alert>
            )}
            {!isFilesLoading && !isFilesError && !eligibleFiles.length && (
              <p className="py-6 text-center text-sm text-text-secondary">
                {localize('com_ui_project_no_eligible_files')}
              </p>
            )}
            {!isFilesLoading &&
              !isFilesError &&
              eligibleFiles.map((file) => (
                <div key={file.file_id} role="listitem">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl border border-border-light bg-surface-secondary px-3.5 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
                    onClick={() => void addExistingFile(file.file_id)}
                    disabled={addFile.isLoading}
                  >
                    <Paperclip className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                      {file.filename}
                    </span>
                    <span className="shrink-0 text-xs text-text-secondary">
                      {formatBytes(file.bytes)}
                    </span>
                  </button>
                </div>
              ))}
          </div>
        </OGDialogContent>
      </OGDialog>
    </section>
  );
}
