import React, { useMemo, useState } from 'react';
import { diagnostic } from './diagnostics.js';
import { searchDevices } from './graph.js';

function DeviceList({ devices, selected, onSelect, t }) {
  const [limit, setLimit] = useState(100);
  return (
    <div className="list">
      {devices.slice(0, limit).map((device) => (
        <button
          key={device.address}
          className={selected === device.address ? 'active' : ''}
          title={device.comment || device.address}
          onClick={() => onSelect(device.address)}
        >
          <b>{device.address}</b>
          <span>{device.comment}</span>
        </button>
      ))}
      {!devices.length && <p className="empty">{t.none}</p>}
      {devices.length > limit && (
        <button onClick={() => setLimit(limit + 100)}>{t.more}</button>
      )}
    </div>
  );
}

function HardwareBranch({ configurations, field, title, t }) {
  return (
    <details>
      <summary>{title}</summary>
      {configurations.length ? (
        configurations.map((config) => (
          <details className="branch" key={config.id} open>
            <summary>
              {[config.name, config.cpuFamily].filter(Boolean).join(' · ') ||
                'PLC'}
            </summary>
            {field === 'ioModules' && (
              <div className="io-layout">
                {config.cpuFamily && (
                  <div className="cpu-unit">
                    <small>CPU</small>
                    <strong>{config.cpuFamily}</strong>
                  </div>
                )}
                {config.bases?.map((base) => (
                  <div key={base.id} className="base-unit">
                    <strong>
                      {t.base} {base.id}
                    </strong>
                    <small>
                      {t.slot} × {base.slots}
                    </small>
                  </div>
                ))}
              </div>
            )}
            {config[field]?.length ? (
              <ul className="hardware">
                {config[field].map((module, index) => (
                  <li key={index}>
                    <small>
                      {[
                        module.network,
                        module.base != null &&
                          module.base !== '' &&
                          t.base + ' ' + module.base,
                        module.slot != null &&
                          module.slot !== '' &&
                          t.slot + ' ' + module.slot,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                    <strong>{module.name || module.typeCode}</strong>
                  </li>
                ))}
              </ul>
            ) : field !== 'ioModules' || !config.bases?.length ? (
              <p className="empty">{t.empty}</p>
            ) : null}
          </details>
        ))
      ) : (
        <p className="empty">{t.empty}</p>
      )}
    </details>
  );
}

function ProgramBranch({
  program,
  devices,
  selection,
  nativeProject,
  language,
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details
      className="branch"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        {program.name} <small>{devices.length}</small>
      </summary>
      {expanded && <DeviceList devices={devices} {...selection} />}
      {program.error && (
        <p className="empty">
          {nativeProject ? diagnostic(program.error, language) : program.error}
        </p>
      )}
    </details>
  );
}

export default function ProjectTree({
  project,
  selected,
  onSelect,
  t,
  nativeProject,
  language,
}) {
  const [query, setQuery] = useState('');
  const matches = useMemo(
    () => searchDevices(project, query),
    [project, query],
  );
  const programDevices = useMemo(() => {
    const byAddress = new Map(
      project.devices.map((device) => [device.address, device]),
    );
    const programs =
      project.programs ||
      [...new Set(project.rungs.map((rung) => rung.program))].map((name) => ({
        name,
      }));
    const groups = new Map(
      programs.map((p, i) => [p.programId ?? i, new Set()]),
    );
    const byName = new Map(programs.map((p, i) => [p.name, p.programId ?? i]));
    for (const rung of project.rungs) {
      const group = groups.get(rung.programId ?? byName.get(rung.program));
      if (!group) continue;
      rung.reads.forEach((address) => group.add(address));
      rung.writes.forEach((write) => group.add(write.address));
    }
    return programs.map((p, i) => ({
      program: p,
      devices: [...groups.get(p.programId ?? i)].map((a) => byAddress.get(a)),
    }));
  }, [project]);
  const selection = { selected, onSelect, t };
  const configurations = project.configurations || [];
  return (
    <aside>
      <div className="aside-head">
        <small>{t.project}</small>
        <h2>{project.name || t.noName}</h2>
      </div>
      <nav aria-label={t.project}>
        <HardwareBranch
          configurations={configurations}
          field="networkModules"
          title={t.network}
          t={t}
        />
        <HardwareBranch
          configurations={configurations}
          field="ioModules"
          title={t.io}
          t={t}
        />
        <details open>
          <summary>
            {t.variables} <small>{project.devices.length}</small>
          </summary>
          <input
            id="search"
            type="search"
            aria-label={t.search}
            placeholder={t.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <DeviceList devices={matches} {...selection} />
        </details>
        <details>
          <summary>
            {t.programs} <small>{programDevices.length}</small>
          </summary>
          {programDevices.map(({ program, devices }, index) => (
            <ProgramBranch
              key={index}
              program={program}
              devices={devices}
              selection={selection}
              nativeProject={nativeProject}
              language={language}
            />
          ))}
        </details>
      </nav>
    </aside>
  );
}
