import Editor, { DiffEditor, useMonaco } from '@monaco-editor/react';
import type { editor, IDisposable } from 'monaco-editor';
import { type FC, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

// Themes
import BrillianceBlack from './themes/BrillianceBlack';
import GithubDark from './themes/GithubDark';

type Props = {
  filename: string;
  path?: string;
  height?: string | number;
  language?: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  diff?: boolean;
  original?: string;
};

const CodeEditor: FC<Props> = ({
  height,
  language,
  filename,
  path,
  value,
  onChange,
  readOnly,
  diff,
  original,
}) => {
  // If uncontrolled, define our state control here
  const [controlledValue, setControlledValue] = useState(value);
  const monaco = useMonaco();
  const [lang, setLang] = useState<string | undefined>(language);
  const showDiff = !!(diff && original && lang);
  const diffEditor = useRef<editor.IDiffEditor | null>(null);
  const diffCreation = useRef<IDisposable | null>(null);
  const diffContainerID = useId();

  useLayoutEffect(() => () => {
    diffCreation.current?.dispose();
    diffCreation.current = null;
    const instance = diffEditor.current;
    diffEditor.current = null;
    const models = instance?.getModel();
    // Detach models before disposal; the wrapper otherwise disposes attached models.
    instance?.setModel(null);
    models?.original.dispose();
    models?.modified.dispose();
  }, [showDiff]);

  useEffect(() => {
    if (monaco) {
      // Define all of our themes
      monaco.editor.defineTheme('github-dark', GithubDark);
      monaco.editor.defineTheme('brilliance-black', BrillianceBlack);
    }

    async function detectLanguage() {
      try {
        const detectLangFn = (window as unknown as { detectLanguage?: (opts: { filename: string; contents: string }) => Promise<string | undefined> }).detectLanguage;
        if (!detectLangFn) return;
        const detected: string | undefined = await detectLangFn({
          filename,
          contents: value,
        });
        if (detected) {
          setLang(detected);
        }
      } catch (err: unknown) {
        console.error('Failed to detect language', err);
      }
    }

    if (!lang) {
      detectLanguage().catch((err: unknown) => { console.error(err); });
    }
  }, [monaco, filename, value, lang]);

  /**
   * If we are using controlled, we need to handle the change event
   */
  const handleChange = (val: string) => {
    if (onChange) {
      onChange(val);
      return;
    }

    setControlledValue(val);
  };

  if (showDiff) {
    return (
      <DiffEditor
        wrapperProps={{ id: diffContainerID }}
        beforeMount={(instance) => {
          // Wrapper versions call beforeMount before or after widget creation.
          // Capture either case before the asynchronous onMount notification.
          const capture = (created: editor.IDiffEditor) => {
            if (document.getElementById(diffContainerID)?.contains(created.getContainerDomNode())) {
              diffEditor.current = created;
            }
          };
          diffCreation.current?.dispose();
          diffCreation.current = instance.editor.onDidCreateDiffEditor(capture);
          instance.editor.getDiffEditors().forEach(capture);
        }}
        theme={lang === 'nginx' ? 'nginx-theme-dark' : 'vs-dark'}
        language={lang}
        originalModelPath={path ? `${path.slice(0, path.lastIndexOf('/') + 1)}original-${encodeURIComponent(diffContainerID)}-${path.slice(path.lastIndexOf('/') + 1)}` : undefined}
        modifiedModelPath={path ? `${path.slice(0, path.lastIndexOf('/') + 1)}modified-${encodeURIComponent(diffContainerID)}-${path.slice(path.lastIndexOf('/') + 1)}` : undefined}
        original={original}
        modified={onChange ? value : value || controlledValue}
        height={height ?? '100%'}
        options={{ readOnly, fontSize: 11 }}
      />
    );
  }

  if (lang) {
    return (
      <Editor
        theme={lang === 'nginx' ? 'nginx-theme-dark' : 'vs-dark'}
        language={lang}
        value={
          lang === 'json'
            ? // pretty print it
              JSON.stringify(JSON.parse(value) as unknown, null, 2)
            : onChange ? value : value || controlledValue
        }
        onChange={(v) => {
          handleChange(v || '');
        }}
        height={height ?? '100%'}
        path={path}
        options={{ readOnly, fontSize: 11 }}
      />
    );
  }

  return null;
};

export default CodeEditor;
