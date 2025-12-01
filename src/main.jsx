import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import Plotly from 'plotly.js-dist-min';
import { buildDataset } from './data.js';
import './index.css';

function FilterRow({ schools, yearGroups, waves, filters, onChange }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <label className="daisy-select space-y-1">
        <span>School</span>
        <select
          value={filters.school || 'all'}
          onChange={(e) => onChange({ ...filters, school: e.target.value })}
        >
          <option value="all">All</option>
          {schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
            </option>
          ))}
        </select>
      </label>
      <label className="daisy-select space-y-1">
        <span>Yeargroup</span>
        <select
          value={filters.yearGroup || 'all'}
          onChange={(e) => onChange({ ...filters, yearGroup: e.target.value })}
        >
          <option value="all">All</option>
          {yearGroups.map((yg) => (
            <option key={yg} value={yg}>
              {yg}
            </option>
          ))}
        </select>
      </label>
      <label className="daisy-select space-y-1">
        <span>Wave</span>
        <select value={filters.wave || 'all'} onChange={(e) => onChange({ ...filters, wave: e.target.value })}>
          <option value="all">All</option>
          {waves.map((wv) => (
            <option key={wv} value={wv}>
              {wv}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function DataTable({ columns, rows }) {
  return (
    <div className="table-wrapper">
      <table className="table table-zebra w-full">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="text-sm text-base-content/70">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="hover:bg-base-200/70">
              {columns.map((col) => (
                <td key={col.key} className="text-sm">
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DatasetSection({ title, description, columns, rows, children }) {
  return (
    <div className="section-card">
      <details open className="space-y-3">
        <summary className="flex items-center gap-2">
          <span className="text-primary">◆</span>
          {title}
        </summary>
        <p className="small-note">{description}</p>
        {children}
        <DataTable columns={columns} rows={rows} />
      </details>
    </div>
  );
}

function MetadataPanel({ metadata }) {
  return (
    <div className="section-card">
      <h2 className="text-xl font-semibold">Data access and categorisation</h2>
      <div className="grid-panels">
        {metadata.map((item) => (
          <div key={item.entity} className="meta-card">
            <div className="card-body">
              <h3 className="card-title text-base">{item.entity}</h3>
              <div className="inline-tags">
                {item.access.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-sm">
                <span className="font-semibold">Category:</span> {item.category}
              </p>
              <p className="text-sm">
                <span className="font-semibold">Purpose:</span> {item.purpose}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EntityMatrix({ matrix }) {
  const headers = [
    { key: 'pid', label: 'PID' },
    { key: 'pseudo', label: 'Pseudonymous' },
    { key: 'anonRe', label: 'Anonymous (re-identifiable)' },
    { key: 'anon', label: 'Anonymous (fully)' },
  ];

  return (
    <div className="section-card">
      <h2 className="text-xl font-semibold">Data kinds by entity & categorisation</h2>
      <DataTable
        columns={[
          { key: 'entity', label: 'Entity' },
          ...headers.map((h) => ({
            key: h.key,
            label: h.label,
            render: (value) => (
              <div className="inline-tags">
                {value.map((item) => (
                  <span key={item} className="tag">
                    {item}
                  </span>
                ))}
              </div>
            ),
          })),
        ]}
        rows={matrix}
      />
    </div>
  );
}

function SurveyChart({ responses, surveys, waves, schools, yearGroups }) {
  const [surveyId, setSurveyId] = useState(surveys[0].id);
  const [view, setView] = useState('yeargroup');
  const [school, setSchool] = useState(schools[0].id);
  const [yearGroup, setYearGroup] = useState(yearGroups[0]);
  const chartRef = useRef(null);

  const filtered = useMemo(
    () => responses.filter((resp) => resp.surveyId === surveyId),
    [responses, surveyId],
  );

  useEffect(() => {
    if (!chartRef.current) return;
    const survey = surveys.find((s) => s.id === surveyId);
    const orderedWaves = [...waves];

    const computeItemStats = (items) => {
      const scores = items.map((i) => i.score);
      const mean = scores.reduce((a, b) => a + b, 0) / (scores.length || 1);
      const variance = scores.reduce((acc, val) => acc + (val - mean) ** 2, 0) / (scores.length || 1);
      const ci = 1.96 * Math.sqrt(variance / (scores.length || 1));
      return { mean: Number(mean.toFixed(2)), ci: Number(ci.toFixed(2)) };
    };

    const traces = [];

    if (view === 'cross-school') {
      for (const s of schools) {
        const byWave = orderedWaves.map((wave) => {
          const set = filtered.filter((f) => f.schoolId === s.id && f.wave === wave);
          const totals = set.map((r) => r.total);
          const mean = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
          const ci = totals.length
            ? 1.96 * (Math.sqrt(totals.reduce((acc, val) => acc + (val - mean) ** 2, 0) / (totals.length || 1)) /
                Math.sqrt(totals.length))
            : 0;
          return { mean: Number(mean.toFixed(2)), ci: Number(ci.toFixed(2)) };
        });
        traces.push({
          x: orderedWaves,
          y: byWave.map((d) => d.mean),
          error_y: { type: 'data', array: byWave.map((d) => d.ci), visible: true },
          name: `${s.name} Total`,
          mode: 'lines+markers',
        });
      }
    } else {
      const filterFn = (resp) => {
        if (view === 'yeargroup') {
          return resp.schoolId === school && resp.yearGroup === yearGroup;
        }
        return resp.schoolId === school;
      };

      const dataPool = filtered.filter(filterFn);
      const items = survey.items;
      const wavesMap = new Map();
      for (const wave of orderedWaves) {
        wavesMap.set(wave, dataPool.filter((d) => d.wave === wave));
      }

      const totalsTrace = {
        x: orderedWaves,
        y: orderedWaves.map((wave) => {
          const entries = wavesMap.get(wave);
          const totals = entries.map((d) => d.total);
          const mean = totals.reduce((a, b) => a + b, 0) / (totals.length || 1);
          return Number(mean.toFixed(2));
        }),
        error_y: {
          type: 'data',
          array: orderedWaves.map((wave) => {
            const entries = wavesMap.get(wave);
            const totals = entries.map((d) => d.total);
            const mean = totals.reduce((a, b) => a + b, 0) / (totals.length || 1);
            const variance = totals.reduce((acc, val) => acc + (val - mean) ** 2, 0) / (totals.length || 1);
            const ci = 1.96 * Math.sqrt(variance / (totals.length || 1));
            return Number(ci.toFixed(2));
          }),
          visible: true,
        },
        name: 'Survey total',
        mode: 'lines+markers',
      };
      traces.push(totalsTrace);

      for (let i = 0; i < items; i += 1) {
        const label = `${survey.name} Item ${i + 1}`;
        const stats = orderedWaves.map((wave) => {
          const entries = wavesMap.get(wave).flatMap((d) => (d.items[i] ? [d.items[i]] : []));
          return computeItemStats(entries);
        });
        traces.push({
          x: orderedWaves,
          y: stats.map((s) => s.mean),
          error_y: { type: 'data', array: stats.map((s) => s.ci), visible: true },
          name: label,
          mode: 'lines',
        });
      }
    }

    Plotly.react(
      chartRef.current,
      traces,
      {
        title: `${surveys.find((s) => s.id === surveyId)?.name || ''} by wave`,
        yaxis: { title: 'Mean score', zeroline: false },
        xaxis: { title: 'Wave' },
        legend: { orientation: 'h' },
        margin: { t: 40, r: 10, l: 50, b: 40 },
      },
      { responsive: true },
    );
  }, [filtered, view, surveyId, school, yearGroup, surveys, waves, schools]);

  const surveyOptions = useMemo(() => surveys.map((s) => ({ value: s.id, label: s.name })), [surveys]);

  return (
    <div className="section-card">
      <h2 className="text-xl font-semibold">Survey trend explorer</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <label className="daisy-select space-y-1">
          <span>Survey</span>
          <select value={surveyId} onChange={(e) => setSurveyId(e.target.value)}>
            {surveyOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="daisy-select space-y-1">
          <span>View</span>
          <select value={view} onChange={(e) => setView(e.target.value)}>
            <option value="yeargroup">Yeargroup</option>
            <option value="school">School (all years)</option>
            <option value="cross-school">Across schools</option>
          </select>
        </label>
        {view !== 'cross-school' && (
          <label className="daisy-select space-y-1">
            <span>School</span>
            <select value={school} onChange={(e) => setSchool(e.target.value)}>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {view === 'yeargroup' && (
          <label className="daisy-select space-y-1">
            <span>Yeargroup</span>
            <select value={yearGroup} onChange={(e) => setYearGroup(e.target.value)}>
              {yearGroups.map((yg) => (
                <option key={yg} value={yg}>
                  {yg}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="chart-box mt-4">
        <div ref={chartRef} className="h-[420px]" />
      </div>
      <p className="small-note">Lines show mean scores with 95% confidence intervals. Switch view to compare totals vs items and across schools.</p>
    </div>
  );
}

function App() {
  const dataset = useMemo(() => buildDataset(20241201), []);
  const [filters, setFilters] = useState({ school: 'all', yearGroup: 'all', wave: 'all' });

  const filterRows = (rows, map) =>
    rows
      .filter((row) => {
        const schoolMatch = filters.school === 'all' || row.schoolId === filters.school;
        const yearMatch = filters.yearGroup === 'all' || row.yearGroup === filters.yearGroup;
        const waveMatch = filters.wave === 'all' || row.wave === filters.wave;
        return schoolMatch && yearMatch && waveMatch;
      })
      .map(map || ((r) => r));

  const schoolLookup = useMemo(
    () => Object.fromEntries(dataset.schools.map((s) => [s.id, s.name])),
    [dataset.schools],
  );

  const credentialColumns = [
    { key: 'schoolId', label: 'School', render: (value) => schoolLookup[value] || value },
    { key: 'area', label: 'Data Protection Area' },
    { key: 'id', label: 'ID' },
    { key: 'password', label: 'Password' },
  ];

  const studentCredentialColumns = [
    { key: 'schoolId', label: 'School', render: (value) => schoolLookup[value] || value },
    { key: 'yearGroup', label: 'Yeargroup' },
    { key: 'studentId', label: 'Student ID' },
    { key: 'id', label: 'Login ID' },
    { key: 'password', label: 'Password' },
    { key: 'note', label: 'Notes' },
  ];

  const surveyColumns = [
    { key: 'schoolId', label: 'School', render: (v) => schoolLookup[v] || v },
    { key: 'yearGroup', label: 'Yeargroup' },
    { key: 'wave', label: 'Wave' },
    { key: 'surveyName', label: 'Survey' },
    { key: 'uid', label: 'UID' },
    {
      key: 'total',
      label: 'Total Score',
      render: (value) => <span className="badge badge-primary badge-outline">{value}</span>,
    },
    {
      key: 'items',
      label: 'Items',
      render: (items) => (
        <div className="inline-tags">
          {items.map((i) => (
            <span key={i.item} className="tag">
              {i.item}: {i.score}
            </span>
          ))}
        </div>
      ),
    },
  ];

  const rewriteColumns = [
    { key: 'schoolId', label: 'School', render: (v) => schoolLookup[v] || v },
    { key: 'studentId', label: 'Student ID' },
    { key: 'uid', label: 'UID' },
  ];

  const aggregateColumns = [
    { key: 'schoolId', label: 'School', render: (v) => schoolLookup[v] || v },
    { key: 'yearGroup', label: 'Yeargroup' },
    { key: 'wave', label: 'Wave' },
    { key: 'surveyName', label: 'Survey' },
    { key: 'n', label: 'N' },
    { key: 'mean', label: 'Mean Total' },
    { key: 'ci', label: '95% CI' },
    { key: 'notes', label: 'Notes', render: (v) => v || '—' },
  ];

  return (
    <div className="min-h-screen">
      <header className="header-bar">
        <div className="app-shell py-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <h1>IB Oxford data handling mockup</h1>
              <p className="hero-copy">
                Seeded, reproducible mock data to help stakeholders explore what is collected, how it is categorised, and how it
                flows between entities.
              </p>
            </div>
            <div className="badge-seed">Demo dataset (seed {dataset.seed})</div>
          </div>
        </div>
      </header>

      <main className="app-shell">
        <div className="section-card">
          <h2 className="text-xl font-semibold">Filters</h2>
          <FilterRow
            schools={dataset.schools}
            yearGroups={dataset.yearGroups}
            waves={dataset.waves}
            filters={filters}
            onChange={setFilters}
          />
          <p className="small-note">Filters apply to the tables below to make walkthroughs easier.</p>
        </div>

        <MetadataPanel metadata={dataset.metadata} />
        <EntityMatrix matrix={dataset.entityMatrix} />

        <DatasetSection
          title="ID + Password combinations"
          description="Credentials that are not assigned to an individual student, scoped by school and area."
          columns={credentialColumns}
          rows={filterRows(dataset.credentials)}
        />

        <DatasetSection
          title="ID + Password + Student combinations"
          description="Student-facing credentials including yeargroup alignment."
          columns={studentCredentialColumns}
          rows={filterRows(dataset.studentCredentials)}
        />

        <DatasetSection
          title="ID Rewrite Map"
          description="Maps student IDs to UIDs for pseudonymisation."
          columns={rewriteColumns}
          rows={filterRows(dataset.rewriteMap)}
        />

        <DatasetSection
          title="Labelled student survey responses"
          description="Survey data labelled with student ID and wave."
          columns={surveyColumns}
          rows={filterRows(dataset.surveyResponses)}
        />

        <DatasetSection
          title="Relabelled student survey responses"
          description="Survey data with student IDs rewritten to UIDs."
          columns={surveyColumns}
          rows={filterRows(dataset.relabelledSurveyResponses)}
        />

        <DatasetSection
          title="Static aggregated data"
          description="Yeargroup-level aggregates by wave with confidence intervals."
          columns={aggregateColumns}
          rows={filterRows(dataset.staticAggregated)}
        />

        <DatasetSection
          title="Dynamic aggregated data"
          description="Aggregates intended for responsive queries with suppression logic."
          columns={aggregateColumns}
          rows={filterRows(dataset.dynamicAggregated)}
        />

        <SurveyChart
          responses={dataset.surveyResponses}
          surveys={dataset.surveys}
          waves={dataset.waves}
          schools={dataset.schools}
          yearGroups={dataset.yearGroups}
        />
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);