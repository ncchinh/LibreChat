import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TChatProject } from 'librechat-data-provider';
import type * as ReactModule from 'react';
import type { ReactNode } from 'react';
import ProjectInstructionsDialog from './ProjectInstructionsDialog';

const mockMutate = jest.fn();

jest.mock('@librechat/client', () => {
  const React = jest.requireActual<typeof ReactModule>('react');
  return {
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement('button', props, children),
    Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) =>
      React.createElement('label', props, children),
    Textarea: React.forwardRef<
      HTMLTextAreaElement,
      React.TextareaHTMLAttributes<HTMLTextAreaElement>
    >((props, ref) => React.createElement('textarea', { ...props, ref })),
    Spinner: () => React.createElement('span', { 'data-testid': 'spinner' }),
    TooltipAnchor: ({ render }: { render: ReactNode }) => render,
    OGDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? React.createElement(React.Fragment, null, children) : null,
    OGDialogTemplate: ({
      title,
      main,
      buttons,
    }: {
      title: ReactNode;
      main: ReactNode;
      buttons: ReactNode;
    }) =>
      React.createElement('section', { role: 'dialog' }, [
        React.createElement('h2', { key: 'title' }, title),
        React.createElement('div', { key: 'main' }, main),
        React.createElement('div', { key: 'buttons' }, buttons),
      ]),
    useToastContext: () => ({ showToast: jest.fn() }),
  };
});

jest.mock('~/data-provider', () => ({
  useUpdateProjectMutation: () => ({ mutate: mockMutate, isLoading: false }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: { name?: string | number }) => {
    const translations: Record<string, string> = {
      com_ui_project_instructions: 'Instructions',
      com_ui_project_instructions_label: 'Workspace instructions',
      com_ui_project_instructions_help: 'Additional context',
      com_ui_project_instructions_error: 'Could not save project instructions',
      com_ui_save: 'Save',
    };
    return (translations[key] ?? key).replace('{{name}}', String(options?.name ?? ''));
  },
}));

const project = {
  _id: 'project-1',
  name: 'Writing project',
  instructions: 'Use a concise tone.',
  conversationCount: 0,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
} as TChatProject;

describe('ProjectInstructionsDialog', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps the edited draft after a failed save and closes only after success', async () => {
    function Editor() {
      const [open, setOpen] = useState(true);
      return <ProjectInstructionsDialog open={open} onOpenChange={setOpen} project={project} />;
    }
    mockMutate.mockImplementationOnce((_payload, callbacks) =>
      callbacks.onError(new Error('Save unavailable')),
    );
    render(<Editor />);
    const textarea = screen.getByRole('textbox', { name: 'Workspace instructions' });
    fireEvent.change(textarea, { target: { value: 'Keep this unsaved draft.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(textarea).toHaveValue('Keep this unsaved draft.');

    mockMutate.mockImplementationOnce((_payload, callbacks) => callbacks.onSuccess(project));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
