import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import Plotly from 'plotly.js-dist-min';
import { buildDataset } from './data.js';
import './index.css';

function FilterRow({ schools, yearGroups, waves, filters, onChange, schoolToTtp }) {
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
                  {schoolToTtp && schoolToTtp[school.id] ? ` (${schoolToTtp[school.id]})` : ''}
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

function DatasetSection({ title, description, columns, rows, children, badges = [] }) {
  return (
      <div className="section-card">
        <details open className="space-y-3">
          <summary className="flex items-center gap-2">
            <span className="text-primary">◆</span>
            <span className="flex items-center gap-2">
            {title}
              {badges.length > 0 && (
                  <span className="inline-tags">
                {badges.map((badge) => (
                    <span key={badge} className="badge badge-outline">
                    {badge}
                  </span>
                ))}
              </span>
              )}
          </span>
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

function TtpPanel({ ttps, schools }) {
  const grouped = ttps.map((ttp) => ({
    ...ttp,
    schools: schools.filter((school) => school.ttpId === ttp.id),
  }));

  return (
      <div className="section-card">
        <h2 className="text-xl font-semibold">Trusted third parties and schools</h2>
        <div className="grid-panels">
          {grouped.map((entry) => (
              <div key={entry.id} className="meta-card">
                <div className="card-body">
                  <h3 className="card-title text-base flex items-center gap-2">
                    <span className="badge badge-secondary badge-outline">TTP</span>
                    {entry.name}
                  </h3>
                  <p className="small-note">Schools handled by this TTP</p>
                  <div className="inline-tags">
                    {entry.schools.map((school) => (
                        <span key={school.id} className="tag">
                    {school.name}
                  </span>
                    ))}
                  </div>
                </div>
              </div>
          ))}
        </div>
      </div>
  );
}

/*
* responses are aggregated, so will contain columns like phq9-total
* */
function SurveyChart({ responses, surveys, waves, schools, yearGroups, schoolToTtp }) {
  const [surveyId, setSurveyId] = useState(surveys[0].id);
  const [view, setView] = useState('cross-school'); // 'school' | 'cross-school'
  const [school, setSchool] = useState(schools[0].id);
  const [yearGroup, setYearGroup] = useState(yearGroups[0]);
  const chartRef = useRef(null);

  const stats = useMemo(
      () => responses.map((resp) => ({
        ...resp,
        mean: resp[`${surveyId}-mean`],
        ci95: resp[`${surveyId}-ci95`],
        n: resp[`${surveyId}-n`],
        total: resp[`${surveyId}-n`] * resp[`${surveyId}-mean`],
      })),
      [responses, surveyId],
  );

  useEffect(() => {
    if (!chartRef.current) return;
    const survey = surveys.find((s) => s.id === surveyId);
    const orderedWaves = [...waves];

    const traces = [];

    if (view === 'cross-school') {
      for (const s of schools) {
        const byWave = orderedWaves.map((wave) => {
          // Weighted mean across all yeargroups
          const entries = stats.filter((d) => d.schoolId === s.id && d.wave === wave);
          const total_n = entries.reduce((acc, d) => acc + d.n, 0);
          const total_score = entries.map((d) => d.total * d.n);
          const mean = total_score.reduce((a, b) => a + b, 0) / (total_n || 1);
          const variance = entries.reduce((acc, d) => {
            const itemMean = d.total;
            return acc + d.n * (d.ci95 / 1.96) ** 2 + d.n * (itemMean - mean) ** 2;
          });
          const ci = 1.96 * Math.sqrt(variance / (total_n || 1));
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

      const byWave = orderedWaves.map((wave) => {
        // Weighted mean across all yeargroups
        const entries = stats.filter((d) => d.schoolId === school && d.wave === wave);
        const total_n = entries.reduce((acc, d) => acc + d.n, 0);
        const total_score = entries.map((d) => d.total * d.n);
        const mean = total_score.reduce((a, b) => a + b, 0) / (total_n || 1);
        const variance = entries.reduce((acc, d) => {
          const itemMean = d.total;
          return acc + d.n * (d.ci95 / 1.96) ** 2 + d.n * (itemMean - mean) ** 2;
        });
        const ci = 1.96 * Math.sqrt(variance / (total_n || 1));
        return { mean: Number(mean.toFixed(2)), ci: Number(ci.toFixed(2)) };
      });
      traces.push({
        x: orderedWaves,
        y: byWave.map((d) => d.mean),
        error_y: { type: 'data', array: byWave.map((d) => d.ci), visible: true },
        name: `${school.name} Total`,
        mode: 'lines+markers',
      });
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
  }, [stats, view, surveyId, school, yearGroup, surveys, waves, schools]);

  const surveyOptions = useMemo(() => surveys.map((s) => ({ value: s.id, label: s.name })), [surveys]);

  const selectedSurvey = useMemo(() => surveys.find((s) => s.id === surveyId), [surveyId, surveys]);
  const selectionLabel = useMemo(() => {
    const surveyName = selectedSurvey?.name || 'Survey';
    if (view === 'cross-school') {
      return `${surveyName} totals across all schools (wave-by-wave)`;
    }
    const schoolName = schools.find((s) => s.id === school)?.name || 'Selected school';
    if (view === 'school') {
      return `${surveyName} totals for ${schoolName} across all yeargroups`;
    }
    throw new Error(`Unknown view type: ${view}`);
  }, [selectedSurvey, view, schools, school, yearGroup]);

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
                        {schoolToTtp?.[s.id] ? ` (${schoolToTtp[s.id]})` : ''}
                      </option>
                  ))}
                </select>
              </label>
          )}
        </div>
        <p className="small-note mt-2">Showing {selectionLabel} (labelled survey responses).</p>
        <div className="chart-box mt-4">
          <div ref={chartRef} className="h-[420px]" />
        </div>
        <p className="small-note">Lines show mean scores with 95% confidence intervals. Switch view to compare totals vs items and across schools.</p>
      </div>
  );
}

function App() {
  const dataset = useMemo(() => buildDataset(20241201), []);
  console.log(dataset);
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

  const ttpLookup = useMemo(
      () => Object.fromEntries(dataset.ttps.map((t) => [t.id, t.name])),
      [dataset.ttps],
  );

  const schoolToTtp = useMemo(
      () => Object.fromEntries(dataset.schools.map((s) => [s.id, ttpLookup[s.ttpId] || s.ttpId || ''])),
      [dataset.schools, ttpLookup],
  );

  const credentialColumns = [
    { key: 'ttp', label: 'TTP', render: (_, row) => schoolToTtp[row.schoolId] || '—' },
    { key: 'schoolId', label: 'School', render: (value) => schoolLookup[value] || value },
    { key: 'id', label: 'ID' },
    { key: 'password', label: 'Password' },
  ];

  const studentCredentialColumns = [
    { key: 'ttp', label: 'TTP', render: (_, row) => schoolToTtp[row.schoolId] || '—' },
    { key: 'schoolId', label: 'School', render: (value) => schoolLookup[value] || value },
    { key: 'yearGroup', label: 'Yeargroup' },
    { key: 'name', label: 'Student' },
    { key: 'id', label: 'Login ID' },
    { key: 'password', label: 'Password' },
  ];

  const surveyItemColumns = useMemo(() => {
    const columns = [];
    dataset.surveys.forEach((survey) => {
      columns.push({
        key: `${survey.id}-total`,
        label: `${survey.name} Total`,
        render: (_, row) => Array.from({ length: survey.items }, (_, idx) => row[`${survey.id}-item-${idx + 1}`] || 0).reduce((a, b) => a + b, 0),
      })
      for (let i = 1; i <= survey.items; i += 1) {
        columns.push({
          key: `${survey.id}-item-${i}`,
          label: `${survey.name} Item ${i}`,
          render: (value) => (value ?? value === 0 ? value : '—'),
        });
      }
    });
    return columns;
  }, [dataset.surveys]);
  console.log({ surveyItemColumns });


  const surveyColumns = [
    { key: 'ttp', label: 'TTP', render: (_, row) => schoolToTtp[row.schoolId] || '—' },
    { key: 'schoolId', label: 'School', render: (v) => schoolLookup[v] || v },
    { key: 'yearGroup', label: 'Yeargroup' },
    { key: 'studentId', label: 'Student' },
    { key: 'wave', label: 'Wave' },
    ...surveyItemColumns,
  ];

  const relabelledSurveyColumns = [
    { key: 'ttp', label: 'TTP', render: (_, row) => schoolToTtp[row.schoolId] || '—' },
    { key: 'schoolId', label: 'School', render: (v) => schoolLookup[v] || v },
    { key: 'yearGroup', label: 'Yeargroup' },
    { key: 'uid', label: 'Student' },
    { key: 'wave', label: 'Wave' },
    ...surveyItemColumns,
  ];

  const rewriteColumns = [
    { key: 'ttp', label: 'TTP', render: (_, row) => schoolToTtp[row.schoolId] || '—' },
    { key: 'schoolId', label: 'School', render: (v) => schoolLookup[v] || v },
    { key: 'studentId', label: 'Student ID' },
    { key: 'uid', label: 'UID' },
  ];

  const aggregateColumns = [
    { key: 'ttp', label: 'TTP', render: (_, row) => schoolToTtp[row.schoolId] || '—' },
    { key: 'schoolId', label: 'School', render: (v) => schoolLookup[v] || v },
    { key: 'yearGroup', label: 'Yeargroup' },
    { key: 'wave', label: 'Wave' },
    { key: 'phq9-n', label: 'PHQ9 N' },
    { key: 'phq9-mean', label: 'PHQ9 Mean Total' },
    { key: 'phq9-ci95', label: 'PHQ9 95% CI' },
    { key: 'gad7-n', label: 'GAD7 N' },
    { key: 'gad7-mean', label: 'GAD7 Mean Total' },
    { key: 'gad7-ci95', label: 'GAD7 95% CI' },
  ];

  const mapSurveyRow = (row) => {
    const extras = {};
    (row.items || []).forEach((item) => {
      const match = item.item.match(/Item (\d+)/);
      if (match) {
        extras[`${row.surveyId}-item-${match[1]}`] = item.score;
      }
    });
    return { ...row, ...extras };
  };

  const categoryBadges = {
    credentials: ['PID'],
    studentCredentials: ['PID'],
    rewriteMap: ['Pseudonymous'],
    surveyResponses: ['Pseudonymous'],
    relabelledSurveyResponses: ['Anonymous (re-identifiable)'],
    staticAggregated: ['Anonymous (fully)'],
    dynamicAggregated: ['Anonymous (re-identifiable)'],
  };

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
                schoolToTtp={schoolToTtp}
            />
            <p className="small-note">Filters apply to the tables below to make walkthroughs easier.</p>
          </div>

          <MetadataPanel metadata={dataset.metadata} />
          <EntityMatrix matrix={dataset.entityMatrix} />
          <TtpPanel ttps={dataset.ttps} schools={dataset.schools} />

          <DatasetSection
              title="ID + Password combinations"
              description="Credentials that are not assigned to an individual student, scoped by school and area."
              columns={credentialColumns}
              rows={filterRows(dataset.credentials)}
              badges={categoryBadges.credentials}
          />

          <DatasetSection
              title="ID + Password + Student combinations"
              description="Student-facing credentials including yeargroup alignment."
              columns={studentCredentialColumns}
              rows={filterRows(dataset.studentCredentials)}
              badges={categoryBadges.studentCredentials}
          />

          <DatasetSection
              title="ID Rewrite Map"
              description="Maps student IDs to UIDs for pseudonymisation."
              columns={rewriteColumns}
              rows={filterRows(dataset.rewriteMap)}
              badges={categoryBadges.rewriteMap}
          />

          <DatasetSection
              title="Labelled student survey responses"
              description="Survey data labelled with student ID and wave."
              columns={surveyColumns}
              rows={filterRows(dataset.surveyResponses, mapSurveyRow)}
              badges={categoryBadges.surveyResponses}
          />

          <DatasetSection
              title="Relabelled student survey responses"
              description="Survey data with student IDs rewritten to UIDs."
              columns={relabelledSurveyColumns}
              rows={filterRows(dataset.relabelledSurveyResponses, mapSurveyRow)}
              badges={categoryBadges.relabelledSurveyResponses}
          />

          <DatasetSection
              title="Static aggregated data"
              description="Yeargroup-level aggregates by wave with confidence intervals."
              columns={aggregateColumns}
              rows={filterRows(dataset.staticAggregated)}
              badges={categoryBadges.staticAggregated}
          />

          <DatasetSection
              title="Dynamic aggregated data"
              description="Aggregates intended for responsive queries with suppression logic."
              columns={aggregateColumns}
              rows={filterRows(dataset.dynamicAggregated)}
              badges={categoryBadges.dynamicAggregated}
          />

          <SurveyChart
              responses={dataset.dynamicAggregated}
              surveys={dataset.surveys}
              waves={dataset.waves}
              schools={dataset.schools}
              yearGroups={dataset.yearGroups}
              schoolToTtp={schoolToTtp}
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