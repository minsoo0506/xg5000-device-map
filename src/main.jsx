import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './style.css';
import RelationshipCanvas from './RelationshipCanvas.jsx';
import ProjectTree from './ProjectTree.jsx';
import labels from './strings.js';
import { demo } from './demo.js';
import { diagnostic, warningText } from './diagnostics.js';

function loadProject(file) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./project.worker.js', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data.project);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message));
    };
    worker.postMessage(file);
  });
}

function Settings({ dialog, language, setLanguage, theme, setTheme, t }) {
  return (
    <dialog ref={dialog}>
      <div className="dialog-heading">
        <h2>{t.settings}</h2>
        <button onClick={() => dialog.current.close()}>{t.close}</button>
      </div>
      <label>
        {t.language}
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
        >
          <option value="ko">한국어</option>
          <option value="ja">日本語</option>
          <option value="en">English</option>
        </select>
      </label>
      <label>
        {t.theme}
        <select
          value={theme}
          onChange={(event) => setTheme(event.target.value)}
        >
          <option value="light">{t.light}</option>
          <option value="dark">{t.dark}</option>
        </select>
      </label>
      <details className="guide">
        <summary>{t.manual}</summary>
        <ol>
          {t.help.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>
    </dialog>
  );
}

function App() {
  const [project, setProject] = useState(demo);
  const [nativeProject, setNativeProject] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState('M100');
  const [depth, setDepth] = useState(1);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState(
    () => localStorage.getItem('language') || 'ko',
  );
  const [theme, setTheme] = useState(() =>
    localStorage.getItem('theme') === 'dark' ? 'dark' : 'light',
  );
  const t = labels[language] || labels.ko;
  const dialog = useRef(null);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('language', language);
    localStorage.setItem('theme', theme);
  }, [language, theme]);

  function openProject(next, address, native = false) {
    setNativeProject(native);
    setProject(next);
    setSelected(address);
    setDepth(1);
    setRevision((value) => value + 1);
    setError(null);
  }

  async function openFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setLoading(true);
    try {
      const next = await loadProject(file);
      const native = file.name.toLowerCase().endsWith('.xgwx');
      if (!next.devices.length && !next.configurations?.length) {
        setError({ empty: true, project: next, native });
        return;
      }
      openProject(next, next.devices[0]?.address || '', native);
    } catch (err) {
      setError({ message: err.message });
    } finally {
      setLoading(false);
    }
  }

  function formatWarning(message, source = project, native = nativeProject) {
    return native ? warningText(message, language, source.programs) : message;
  }
  const errorText = error?.empty
    ? [
        t.noDevices,
        ...(error.project.warnings || []).map((message) =>
          formatWarning(message, error.project, error.native),
        ),
      ].join(' ')
    : diagnostic(error?.message || '', language);
  return (
    <div className="app">
      <header>
        <div>
          <span className="brand">
            XG <em>MAP</em>
          </span>
          <span className="header-sub">{t.title}</span>
        </div>
        <div className="actions">
          <button disabled={loading} onClick={() => openProject(demo, 'M100')}>
            {t.example}
          </button>
          <label className="primary">
            {loading ? t.loading : t.open}
            <input
              disabled={loading}
              type="file"
              accept=".xgwx,.json"
              onChange={openFile}
            />
          </label>
          <button
            className="gear"
            aria-label={t.settings}
            title={t.settings}
            onClick={() => dialog.current.showModal()}
          >
            ⚙
          </button>
        </div>
      </header>
      <main>
        <ProjectTree
          key={revision}
          project={project}
          selected={selected}
          onSelect={setSelected}
          t={t}
          nativeProject={nativeProject}
          language={language}
        />
        <section className="workspace">
          <div className="workspace-head">
            <div>
              <small>{t.relationship}</small>
              <h1>
                {selected || t.noDevices}{' '}
                <span>
                  {project.devices.find((d) => d.address === selected)?.comment}
                </span>
              </h1>
            </div>
            <div className="depth">
              <span>{t.depth}</span>
              <button
                onClick={() => setDepth(depth - 1)}
                disabled={depth === 1}
                aria-label={t.depth + ' −'}
              >
                −
              </button>
              <b>{depth}</b>
              <button
                onClick={() => setDepth(depth + 1)}
                disabled={depth === 5}
                aria-label={t.depth + ' +'}
              >
                +
              </button>
            </div>
          </div>
          {error && (
            <div role="alert" className="error">
              {t.failed} · {errorText}
            </div>
          )}
          {!!project.warnings?.length && (
            <details className="analysis-report">
              <summary>
                {t.warnings} ({project.warnings.length})
              </summary>
              <ul>
                {project.warnings.map((message, i) => (
                  <li key={i}>{formatWarning(message)}</li>
                ))}
              </ul>
            </details>
          )}
          {selected && (
            <RelationshipCanvas
              key={revision}
              {...{ project, selected, depth, language, theme, nativeProject }}
              example={project === demo}
              onSelect={setSelected}
            />
          )}
        </section>
      </main>
      <Settings {...{ dialog, language, setLanguage, theme, setTheme, t }} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
