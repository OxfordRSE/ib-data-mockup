import React, {useEffect, useMemo, useRef, useState} from 'react';
import ReactDOM from 'react-dom/client';
import Plotly from 'plotly.js-dist-min';
import {buildDataset} from './data.js';
import './index.css';

function clsx(...args) {
  return args
      .flatMap((arg) => {
        if (!arg) return [];
        if (typeof arg === 'string') return [arg];
        if (Array.isArray(arg)) return arg;
        if (typeof arg === 'object') {
          return Object.entries(arg)
              .filter(([, value]) => Boolean(value))
              .map(([key]) => key);
        }
        return [];
      })
      .join(' ');
}

const STORAGE_KEY = 'ib-label-sets';
const DESCRIPTION_LIMIT = 140;

const DEFAULT_LABELS = [
  {
    id: 'pii',
    name: 'PII',
    color: '#b91c1c',
    description: 'Direct identifiers such as names or login credentials.',
  },
  {
    id: 'pseudo',
    name: 'Pseudo',
    color: '#ef4444',
    description: 'Identifiers rewritten but still reversible via a lookup map.',
  },
  {
    id: 'anon-risk',
    name: 'Anon (risk)',
    color: '#fca5a5',
    description: 'Aggregated or masked data that could be re-identified.',
  },
  {
    id: 'anon',
    name: 'Anon',
    color: '#22c55e',
    description: 'Anonymous data with no realistic re-identification path.',
  },
];

const DEFAULT_LABEL_SET = {
  name: 'Sensitivity defaults',
  labels: DEFAULT_LABELS,
  assignments: {
    credentials: ['pii'],
    studentCredentials: ['pii'],
    rewriteMap: ['pseudo'],
    surveyResponses: ['pseudo'],
    relabelledSurveyResponses: ['anon-risk'],
    staticAggregated: ['anon'],
    dynamicAggregated: ['anon-risk'],
  },
};

function loadLabelSets() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch (e) {
    console.warn('Failed to read label sets from storage', e);
    return null;
  }
}

function saveLabelSets(sets) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sets));
}

function encodeDataForParam(data) {
  return btoa(JSON.stringify(data));
}

function decodeDataFromParam(value) {
  return JSON.parse(atob(value));
}

function computeMean(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeStddev(values) {
  if (values.length <= 1) return 0;
  const mean = computeMean(values);
  const variance = values.reduce((acc, val) => acc + (val - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function computeCi95(values) {
  if (values.length === 0) return 0;
  return 1.96 * (computeStddev(values) / Math.sqrt(values.length));
}

function FilterRow({ schools, yearGroups, waves, ethnicities, filters, onChange, schoolToTtp }) {
  return (
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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
          <span>Ethnicity</span>
          <select
              value={filters.ethnicity || 'all'}
              onChange={(e) => onChange({ ...filters, ethnicity: e.target.value })}
          >
            <option value="all">All</option>
            {ethnicities.map((ethnicity) => (
                <option key={ethnicity} value={ethnicity}>
                  {ethnicity}
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
          {rows.map((row, idx) => {
            const suppressed = Boolean(row?.suppressed);
            return (
                <tr key={idx} className={clsx({
                  "hover:bg-base-200/70": !suppressed,
                  "!bg-error/70": suppressed,
                })}>
                  {columns.map((col) => (
                      <td key={col.key} className="text-sm">
                        {col.render ? col.render(row[col.key], row) : row[col.key]}
                      </td>
                  ))}
                </tr>
            );
          })}
          </tbody>
        </table>
      </div>
  );
}

function LabelBadge({ label, onRemove }) {
  return (
      <span
          className="label-chip"
          style={{ backgroundColor: label.color }}
          title={label.description}
      >
        <span className="font-semibold text-sm">{label.name}</span>
        {onRemove && (
            <button className="remove-btn" type="button" onClick={() => onRemove(label.id)} aria-label={`Remove ${label.name}`}>
              ×
            </button>
        )}
      </span>
  );
}

function LabelPicker({ allLabels, selectedIds, onAdd }) {
  const available = allLabels.filter((label) => !selectedIds.includes(label.id));
  const [pending, setPending] = useState(available[0]?.id || '');

  useEffect(() => {
    if (!available.find((l) => l.id === pending)) {
      setPending(available[0]?.id || '');
    }
  }, [available, pending]);

  if (available.length === 0) {
    return <span className="small-note">All labels are applied.</span>;
  }
  return (
      <div className="flex items-center gap-2">
        <select className="select select-bordered select-sm" value={pending} onChange={(e) => setPending(e.target.value)}>
          {available.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
          ))}
        </select>
        <button
            className="btn btn-sm btn-primary"
            type="button"
            onClick={() => pending && onAdd(pending)}
        >
          Add label
        </button>
      </div>
  );
}

function DatasetSection({
  title,
  description,
  columns,
  rows,
  labelOptions,
  assignedLabels,
  onAddLabel,
  onRemoveLabel,
}) {

  return (
      <div className="section-card">
        <details open className="space-y-3">
          <summary className="flex items-center gap-2">
            <span className="text-primary">◆</span>
            <span className="flex items-center gap-2">{title}</span>
          </summary>
          <div className="space-y-2">
            <p className="small-note">{description}</p>
            <div className="label-area">
              <div className="flex items-center gap-2 flex-wrap">
                {assignedLabels.length > 0 ? (
                    assignedLabels.map((label) => (
                        <LabelBadge key={label.id} label={label} onRemove={onRemoveLabel} />
                    ))
                ) : (
                    <span className="small-note">No labels yet.</span>
                )}
              </div>
              {labelOptions.length > 0 && (
                  <LabelPicker allLabels={labelOptions} selectedIds={assignedLabels.map((l) => l.id)} onAdd={onAddLabel} />
              )}
            </div>
          </div>
          <DataTable columns={columns} rows={rows} />
        </details>
      </div>
  );
}

function buildGroupKey(response, groupingFields, schoolToTtp) {
  const extended = { ...response, ttpId: schoolToTtp?.[response.schoolId] || 'All TTPs' };
  return groupingFields.map((field) => extended[field] || 'All').join('|');
}

function aggregateResponses(responses, surveys, groupingFields, suppressionThreshold, schoolToTtp) {
  const grouped = new Map();
  const resolvedFields = Array.from(new Set([...groupingFields, 'wave']));

  responses.forEach((resp) => {
    const key = buildGroupKey(resp, resolvedFields, schoolToTtp);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(resp);
  });

  const aggregates = [];
  for (const [key, group] of grouped.entries()) {
    const sample = group[0] || {};
    const summary = {};

    surveys.forEach((survey) => {
      const totals = group.map((entry) => Number(entry[`${survey.id}-total`]) || 0);
      const totalScore = totals.reduce((a, b) => a + b, 0);
      summary[`${survey.id}-total`] = Number(totalScore.toFixed(2));
      summary[`${survey.id}-n`] = totals.length;
      summary[`${survey.id}-mean`] = Number((totals.length ? totalScore / totals.length : 0).toFixed(2));
      summary[`${survey.id}-ci95`] = Number(computeCi95(totals).toFixed(2));
    });

    const resolveValue = (field, fallback) => {
      if (!resolvedFields.includes(field)) return fallback;
      if (field === 'ttpId') return schoolToTtp?.[sample.schoolId] || fallback;
      return sample[field] ?? fallback;
    };

    const suppressed = summary['phq9-n'] < suppressionThreshold;
    aggregates.push({
      groupKey: key,
      ttpId: resolveValue('ttpId', 'All TTPs'),
      schoolId: resolveValue('schoolId', 'All schools'),
      yearGroup: resolveValue('yearGroup', 'All yeargroups'),
      ethnicity: resolveValue('ethnicity', 'All ethnicities'),
      wave: resolveValue('wave', 'All waves'),
      ...summary,
      suppressed,
      notes: suppressed ? `Suppressed: fewer than ${suppressionThreshold} records` : 'Ready for responsive queries',
    });
  }

  return aggregates;
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
function LabelSetManager({
  labelSets,
  activeSetName,
  onSelectSet,
  onCreateSet,
  onRenameSet,
  onDeleteSet,
  onBackupSet,
  onAddLabel,
  onRemoveLabelDefinition,
  onShare,
}) {
  const activeSet = labelSets.find((set) => set.name === activeSetName) || labelSets[0];
  const [newSetName, setNewSetName] = useState('');
  const [labelName, setLabelName] = useState('');
  const [labelColor, setLabelColor] = useState('#0ea5e9');
  const [labelDescription, setLabelDescription] = useState('');
  const [shareLink, setShareLink] = useState('');

  if (!activeSet) return null;

  return (
      <div className="section-card">
        <h2 className="text-xl font-semibold">Labels, sets, and sharing</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="daisy-select space-y-1">
              <span>Current set</span>
              <select value={activeSetName} onChange={(e) => onSelectSet(e.target.value)}>
                {labelSets.map((set) => (
                    <option key={set.name} value={set.name}>
                      {set.name}
                    </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span className="text-sm font-medium text-base-content/70">Rename set</span>
              <input
                  type="text"
                  className="input input-bordered input-sm w-full"
                  value={activeSetName}
                  onChange={(e) => onRenameSet(e.target.value)}
              />
            </label>
            <div className="flex gap-2 items-end">
              <label className="space-y-1 flex-1">
                <span className="text-sm font-medium text-base-content/70">New set name</span>
                <input
                    type="text"
                    className="input input-bordered input-sm w-full"
                    placeholder="Custom label set"
                    value={newSetName}
                    onChange={(e) => setNewSetName(e.target.value)}
                />
              </label>
              <button className="btn btn-sm btn-secondary" type="button" onClick={() => {
                if (!newSetName.trim()) return;
                onCreateSet(newSetName.trim());
                setNewSetName('');
              }}>
                Create set
              </button>
              </div>
            <div className="flex gap-2">
              <button
                  className="btn btn-sm btn-outline"
                  type="button"
                  onClick={() => onBackupSet()}
              >
                Save backup copy
              </button>
              <button
                  className="btn btn-sm btn-error"
                  type="button"
                  onClick={() => onDeleteSet()}
              >
                Delete set
              </button>
            </div>
            <div className="space-y-2">
              <button className="btn btn-sm" type="button" onClick={() => {
                const link = onShare();
                setShareLink(link);
              }}>
                Copy shareable link
              </button>
              {shareLink && (
                  <div>
                    <p className="small-note break-words">Copied link: {shareLink}</p>
                    <button className="btn btn-neutral btn-outline m-1" onClick={() => setShareLink('')}>Hide</button>
                  </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-3">
            <div className="space-y-2">
              <h3 className="font-semibold text-base">Defined labels</h3>
              <div className="inline-tags">
                {activeSet.labels.length > 0 ? (
                    activeSet.labels.map((label) => (
                        <LabelBadge key={label.id} label={label} onRemove={onRemoveLabelDefinition} />
                    ))
                ) : (
                    <span className="small-note">No labels defined yet.</span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <label className="space-y-1">
                <span className="text-sm font-medium text-base-content/70">Label name</span>
                <input
                    type="text"
                    className="input input-bordered input-sm w-full"
                    value={labelName}
                    onChange={(e) => setLabelName(e.target.value)}
                    placeholder="e.g. Health"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-base-content/70">Colour</span>
                <input
                    type="color"
                    className="input input-bordered input-sm w-full"
                    value={labelColor}
                    onChange={(e) => setLabelColor(e.target.value)}
                />
              </label>
              <label className="space-y-1 md:col-span-3">
                <span className="text-sm font-medium text-base-content/70">Short description (max {DESCRIPTION_LIMIT} chars)</span>
                <input
                    type="text"
                    className="input input-bordered input-sm w-full"
                    value={labelDescription}
                    maxLength={DESCRIPTION_LIMIT}
                    onChange={(e) => setLabelDescription(e.target.value)}
                    placeholder="How should this label be used?"
                />
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button className="btn btn-primary btn-sm" type="button" onClick={() => {
                  if (!labelName.trim()) return;
                  onAddLabel({
                    name: labelName.trim(),
                    color: labelColor,
                    description: labelDescription.trim().slice(0, DESCRIPTION_LIMIT),
                  });
                  setLabelName('');
                  setLabelDescription('');
                }}>
                  Add label
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}

function DynamicAggregatedSection({
  dataset,
  labelOptions,
  assignedLabels,
  onAddLabel,
  onRemoveLabel,
  schoolToTtp,
  schoolLookup,
}) {
  const { surveys, relabelledSurveyResponses, schools, yearGroups, waves } = dataset;
  const ethnicityOptions = useMemo(
      () => Array.from(new Set(relabelledSurveyResponses.map((r) => r.ethnicity))).sort(),
      [relabelledSurveyResponses],
  );

  const groupingOptions = [
    { value: 'school-year-ethnicity', label: 'School + Yeargroup + Ethnicity', fields: ['schoolId', 'yearGroup', 'ethnicity'] },
    { value: 'school-year', label: 'School + Yeargroup', fields: ['schoolId', 'yearGroup'] },
    { value: 'school', label: 'School', fields: ['schoolId'] },
    { value: 'year', label: 'Yeargroup', fields: ['yearGroup'] },
    { value: 'ethnicity', label: 'Ethnicity', fields: ['ethnicity'] },
    { value: 'ttp', label: 'Trusted third party', fields: ['ttpId'] },
    { value: 'all', label: 'All data together', fields: [] },
  ];

  const [filters, setFilters] = useState({
    school: 'all',
    yearGroup: 'all',
    wave: 'all',
    ethnicity: 'all',
    thresholdSurveyId: surveys[0].id,
    comparator: '>',
    surveyValue: '0',
  });
  const [displaySurveyId, setDisplaySurveyId] = useState(surveys[0].id);
  const [grouping, setGrouping] = useState(groupingOptions[0].value);
  const [suppressionThreshold, setSuppressionThreshold] = useState(5);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!surveys.find((s) => s.id === filters.thresholdSurveyId)) {
      setFilters((prev) => ({ ...prev, thresholdSurveyId: surveys[0].id }));
    }
  }, [filters.thresholdSurveyId, surveys]);

  useEffect(() => {
    if (!surveys.find((s) => s.id === displaySurveyId)) {
      setDisplaySurveyId(surveys[0].id);
    }
  }, [displaySurveyId, surveys]);

  const groupingFields = useMemo(
      () => {
        const found = groupingOptions.find((opt) => opt.value === grouping);
        const base = found ? found.fields : groupingOptions[0].fields;
        return Array.from(new Set(['wave', ...base]));
      },
      [grouping],
  );

  const groupingWithoutWave = useMemo(
      () => groupingFields.filter((field) => field !== 'wave'),
      [groupingFields],
  );

  const filteredResponses = useMemo(
      () => relabelledSurveyResponses.filter((resp) => {
        const schoolMatch = filters.school === 'all' || resp.schoolId === filters.school;
        const yearMatch = filters.yearGroup === 'all' || resp.yearGroup === filters.yearGroup;
        const waveMatch = filters.wave === 'all' || resp.wave === filters.wave;
        const ethnicityMatch = filters.ethnicity === 'all' || resp.ethnicity === filters.ethnicity;
        return schoolMatch && yearMatch && waveMatch && ethnicityMatch;
      }),
      [filters, relabelledSurveyResponses],
  );

  const aggregated = useMemo(
      () => aggregateResponses(filteredResponses, surveys, groupingFields, suppressionThreshold, schoolToTtp),
      [filteredResponses, groupingFields, suppressionThreshold, schoolToTtp, surveys],
  );

  const valueFiltered = useMemo(() => {
    const threshold = Number(filters.surveyValue);
    const hasThreshold = filters.surveyValue !== '' && Number.isFinite(threshold);
    return aggregated.filter((row) => {
      const target = Number(row[`${filters.thresholdSurveyId}-mean`]);
      if (!hasThreshold) return true;
      if (filters.comparator === '<') return target < threshold;
      return target > threshold;
    });
  }, [aggregated, filters.comparator, filters.thresholdSurveyId, filters.surveyValue]);

  const unsuppressedKeys = useMemo(
      () => new Set(valueFiltered.filter((row) => !row.suppressed).map((row) => row.groupKey)),
      [valueFiltered],
  );

  const graphResponses = useMemo(
      () => filteredResponses.filter((resp) => unsuppressedKeys.has(buildGroupKey(resp, groupingFields, schoolToTtp))),
      [filteredResponses, groupingFields, schoolToTtp, unsuppressedKeys],
  );

  const sortedAggregates = useMemo(() => {
    const waveOrder = Object.fromEntries(waves.map((w, idx) => [w, idx]));
    return [...valueFiltered].sort((a, b) => (waveOrder[a.wave] ?? 0) - (waveOrder[b.wave] ?? 0));
  }, [valueFiltered, waves]);

  const dynamicColumns = useMemo(() => {
    const survey = surveys.find((s) => s.id === displaySurveyId) || surveys[0];
    const surveyLabel = survey?.name || displaySurveyId;
    const baseColumns = [
      { key: 'ttpId', label: 'TTP' },
      { key: 'schoolId', label: 'School', render: (v) => schoolLookup[v] || v || '—' },
      { key: 'yearGroup', label: 'Yeargroup' },
      { key: 'ethnicity', label: 'Ethnicity' },
      { key: 'wave', label: 'Wave' },
    ];
    const surveyColumns = survey
        ? [
          { key: `${survey.id}-n`, label: `${surveyLabel} N` },
          { key: `${survey.id}-mean`, label: `${surveyLabel} Mean Total` },
          { key: `${survey.id}-ci95`, label: `${surveyLabel} 95% CI` },
        ]
        : [];
    return [...baseColumns, ...surveyColumns, { key: 'notes', label: 'Notes' }];
  }, [displaySurveyId, schoolLookup, surveys]);

  useEffect(() => {
    if (!chartRef.current) return;

    const hasData = graphResponses.length > 0;
    const multipleWaves = filters.wave === 'all';
    const waveList = multipleWaves ? waves.filter((w) => graphResponses.some((resp) => resp.wave === w)) : [filters.wave];

    if (!hasData || waveList.length === 0) {
      Plotly.react(chartRef.current, [], {
        title: 'No unsuppressed data to chart',
        xaxis: { visible: false },
        yaxis: { visible: false },
        annotations: [{ text: 'Adjust filters or suppression threshold to view trends', showarrow: false }],
      }, { responsive: true });
      return;
    }

    const availableWaves = multipleWaves ? waveList : [filters.wave];
    const describeGroupingField = (field) => {
      switch (field) {
        case 'schoolId':
          return 'school';
        case 'yearGroup':
          return 'yeargroup';
        case 'ethnicity':
          return 'ethnicity';
        case 'ttpId':
          return 'trusted third party';
        default:
          return field;
      }
    };
    const formatGroupLabel = (entry) => {
      if (groupingWithoutWave.length === 0) return 'All data';
      const extended = { ...entry, ttpId: schoolToTtp?.[entry.schoolId] || entry.ttpId || 'All TTPs' };
      const parts = groupingWithoutWave.map((field) => {
        if (field === 'schoolId') return schoolLookup[extended.schoolId] || extended.schoolId || 'All schools';
        if (field === 'yearGroup') return extended.yearGroup || 'All yeargroups';
        if (field === 'ethnicity') return extended.ethnicity || 'All ethnicities';
        if (field === 'ttpId') return extended.ttpId || 'All TTPs';
        return extended[field] || 'All';
      });
      return parts.join(' | ');
    };
    const groupingKeyFromEntry = (entry) => {
      if (groupingWithoutWave.length === 0) return 'all';
      const extended = { ...entry, ttpId: schoolToTtp?.[entry.schoolId] || entry.ttpId || 'All TTPs' };
      return groupingWithoutWave.map((field) => extended[field] || 'All').join('|');
    };
    const groupKeyLabels = new Map();
    graphResponses.forEach((resp) => {
      const baseKey = groupingKeyFromEntry(resp);
      if (!groupKeyLabels.has(baseKey)) {
        groupKeyLabels.set(baseKey, formatGroupLabel(resp));
      }
    });
    const singleGroup = groupKeyLabels.size <= 1;
    const traces = [];

    if (!multipleWaves) {
      const itemLabels = [];
      const itemMeans = [];
      const wave = availableWaves[0];
      const activeSurveys = surveys.filter((survey) => survey.id === displaySurveyId) ?? surveys;
      (activeSurveys.length ? activeSurveys : surveys).forEach((survey) => {
        for (let i = 1; i <= survey.items; i += 1) {
          const itemKey = `${survey.id}-item-${i}`;
          const values = graphResponses
              .filter((resp) => resp.wave === wave)
              .map((resp) => Number(resp[itemKey]))
              .filter((val) => Number.isFinite(val));
          itemLabels.push(`${survey.name} Item ${i}`);
          itemMeans.push(values.length ? Number(computeMean(values).toFixed(2)) : null);
        }
      });

      traces.push({
        type: 'bar',
        x: itemLabels,
        y: itemMeans,
        marker: { color: '#2563eb' },
        name: 'Grand mean',
      });

      Plotly.react(chartRef.current, traces, {
        title: `Item means for ${wave}`,
        yaxis: { title: 'Mean score', range: [0, 3.5], zeroline: false },
        xaxis: { title: 'Survey item', automargin: true },
        margin: { t: 50, r: 10, l: 50, b: 120 },
      }, { responsive: true });
      return;
    }

    const wavesForChart = availableWaves;
    const activeSurveys = surveys.filter((survey) => survey.id === displaySurveyId);
    const surveysForChart = activeSurveys.length ? activeSurveys : surveys;

    if (singleGroup) {
      surveysForChart.forEach((survey) => {
        for (let i = 1; i <= survey.items; i += 1) {
          const itemKey = `${survey.id}-item-${i}`;
          const y = wavesForChart.map((wave) => {
            const values = graphResponses
                .filter((resp) => resp.wave === wave)
                .map((resp) => Number(resp[itemKey]))
                .filter((val) => Number.isFinite(val));
            if (values.length === 0) return null;
            return Number(computeMean(values).toFixed(2));
          });
          traces.push({
            x: wavesForChart,
            y,
            mode: 'lines+markers',
            name: `${survey.name} Item ${i}`,
          });
        }
      });
    } else {
      surveysForChart.forEach((survey) => {
        groupKeyLabels.forEach((label, baseKey) => {
          const y = wavesForChart.map((wave) => {
            const totals = graphResponses
                .filter((resp) => resp.wave === wave)
                .filter((resp) => groupingKeyFromEntry(resp) === baseKey)
                .map((resp) => Number(resp[`${survey.id}-total`]))
                .filter((val) => Number.isFinite(val));
            if (totals.length === 0) return null;
            return Number(computeMean(totals).toFixed(2));
          });
          traces.push({
            x: wavesForChart,
            y,
            mode: 'lines+markers',
            name: `${label} (${survey.name})`,
          });
        });

        const grandMean = wavesForChart.map((wave) => {
          const totals = graphResponses
              .filter((resp) => resp.wave === wave)
              .map((resp) => Number(resp[`${survey.id}-total`]))
              .filter((val) => Number.isFinite(val));
          if (totals.length === 0) return null;
          return Number(computeMean(totals).toFixed(2));
        });

        traces.push({
          x: wavesForChart,
          y: grandMean,
          mode: 'lines+markers',
          name: `${survey.name} grand mean`,
          line: { dash: 'dash', width: 3, color: '#111827' },
          marker: { color: '#111827' },
        });
      });
    }

    Plotly.react(chartRef.current, traces, {
      title: groupingWithoutWave.length
          ? `Means by ${groupingWithoutWave.map(describeGroupingField).join(' / ')} across waves`
          : 'Means across waves',
      yaxis: { title: 'Mean total', zeroline: false },
      xaxis: { title: 'Wave' },
      legend: { orientation: 'h' },
      margin: { t: 50, r: 10, l: 60, b: 40 },
    }, { responsive: true });
  }, [displaySurveyId, filters.wave, graphResponses, groupingWithoutWave, schoolLookup, schoolToTtp, surveys, valueFiltered, waves]);

  return (
      <div className="section-card">
        <details open className="space-y-3">
          <summary className="flex items-center gap-2">
            <span className="text-primary">◆</span>
            <span className="flex items-center gap-2">Dynamic aggregated data</span>
          </summary>
          <div className="space-y-3">
            <p className="small-note">Adjust the grouping level, suppression threshold, and numeric filters to explore responsive aggregates. Choose the display survey for table/chart columns; the threshold survey only affects the comparator filter. Suppressed rows remain visible in the table with a red background but are excluded from the chart.</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h3 className="font-semibold text-base">Filters</h3>
                <FilterRow
                    schools={schools}
                    yearGroups={yearGroups}
                    waves={waves}
                    filters={filters}
                    onChange={setFilters}
                    schoolToTtp={schoolToTtp}
                    ethnicities={ethnicityOptions}
                />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-2">
                  <label className="daisy-select space-y-1">
                    <span>Display survey</span>
                    <select value={displaySurveyId} onChange={(e) => setDisplaySurveyId(e.target.value)}>
                      {surveys.map((survey) => (
                          <option key={survey.id} value={survey.id}>
                            {survey.name}
                          </option>
                      ))}
                    </select>
                  </label>
                  <label className="daisy-select space-y-1">
                    <span>Threshold target survey</span>
                    <select value={filters.thresholdSurveyId} onChange={(e) => setFilters((prev) => ({ ...prev, thresholdSurveyId: e.target.value }))}>
                      {surveys.map((survey) => (
                          <option key={survey.id} value={survey.id}>
                            {survey.name}
                          </option>
                      ))}
                    </select>
                  </label>
                  <label className="daisy-select space-y-1">
                    <span>Comparator</span>
                    <select value={filters.comparator} onChange={(e) => setFilters((prev) => ({ ...prev, comparator: e.target.value }))}>
                      <option value=">">&gt;</option>
                      <option value="<">&lt;</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-base-content/70">Survey total threshold</span>
                    <input
                        type="number"
                        className="input input-bordered input-sm w-full"
                        value={filters.surveyValue}
                        onChange={(e) => setFilters((prev) => ({ ...prev, surveyValue: e.target.value }))}
                        placeholder="10"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="daisy-select space-y-1">
                    <span>Grouping level</span>
                    <select value={grouping} onChange={(e) => setGrouping(e.target.value)}>
                      {groupingOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-base-content/70">Suppression threshold</span>
                    <input
                        type="number"
                        min={1}
                        className="input input-bordered input-sm w-full"
                        value={suppressionThreshold}
                        onChange={(e) => setSuppressionThreshold(Number(e.target.value) || 0)}
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-base">Labels</h3>
                <p className="small-note">Apply labels to this dataset to reflect sensitivity decisions.</p>
                <div className="label-area">
                  <div className="flex items-center gap-2 flex-wrap">
                    {assignedLabels.length > 0 ? (
                        assignedLabels.map((label) => (
                            <LabelBadge key={label.id} label={label} onRemove={onRemoveLabel} />
                        ))
                    ) : (
                        <span className="small-note">No labels yet.</span>
                    )}
                  </div>
                  {labelOptions.length > 0 && (
                      <LabelPicker allLabels={labelOptions} selectedIds={assignedLabels.map((l) => l.id)} onAdd={onAddLabel} />
                  )}
                </div>
              </div>
            </div>

            <DataTable columns={dynamicColumns} rows={sortedAggregates} />

            <div className="chart-box mt-4">
              <div ref={chartRef} className="h-[420px]" />
            </div>
          </div>
        </details>
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
  const ethnicityOptions = useMemo(
      () => ['all', ...Array.from(new Set(responses.map((r) => r.ethnicity))).sort()],
      [responses],
  );
  const [ethnicity, setEthnicity] = useState(ethnicityOptions[0]);

  useEffect(() => {
    if (!ethnicityOptions.includes(ethnicity)) {
      setEthnicity(ethnicityOptions[0]);
    }
  }, [ethnicityOptions, ethnicity]);


  const stats = useMemo(
      () => responses.map((resp) => {
        const n = Number(resp[`${surveyId}-n`]) || 0;
        const mean = Number(resp[`${surveyId}-mean`]) || 0;
        const ci95 = Number(resp[`${surveyId}-ci95`]) || 0;
        return {
          ...resp,
          mean,
          ci95,
          n,
        };
      }),
      [responses, surveyId],
  );

  useEffect(() => {
    if (!chartRef.current) return;
    const survey = surveys.find((s) => s.id === surveyId);
    const orderedWaves = [...waves];

    const traces = [];

    const resolvePoint = (entries) => {
      const toPoint = (entry) => ({
        mean: entry?.mean ?? null,
        ci: entry?.ci95 ?? null,
        n: entry?.n ?? 0,
      });
      if (entries.length === 0) return { mean: null, ci: null, n: 0 };
      if (ethnicity !== 'all') {
        return toPoint(entries[0]);
      }
      const totalN = entries.reduce((sum, e) => sum + e.n, 0);
      if (totalN === 0) return { mean: null, ci: null, n: 0 };
      const weightedMean = entries.reduce((sum, e) => sum + e.mean * (e.n / totalN), 0);
      const weightedCi = entries.reduce((sum, e) => sum + e.ci95 * (e.n / totalN), 0);
      return { mean: Number(weightedMean.toFixed(2)), ci: Number(weightedCi.toFixed(2)), n: totalN };
    };

    if (view === 'cross-school') {
      for (const s of schools) {
        const byWave = orderedWaves.map((wave) => resolvePoint(
            stats.filter((d) => d.schoolId === s.id && d.wave === wave && (ethnicity === 'all' || d.ethnicity === ethnicity)),
        ));
        traces.push({
          x: orderedWaves,
          y: byWave.map((d) => d.mean),
          error_y: { type: 'data', array: byWave.map((d) => d.ci), visible: true },
          name: `${s.name} Total`,
          mode: 'lines+markers',
        });
      }
      // Weighted average total line
      const totalByWave = orderedWaves.map((wave) => {
        const entries = stats.filter((d) =>
            d.wave === wave
            && Number.isFinite(d.mean)
            && d.n > 0
            && (ethnicity === 'all' || d.ethnicity === ethnicity));
        return resolvePoint(entries);
      });
      traces.push({
        x: orderedWaves,
        y: totalByWave.map((d) => d.mean),
        error_y: { type: 'data', array: totalByWave.map((d) => d.ci), visible: false },
        name: `All Schools - Total`,
        mode: 'lines+markers',
        line: { dash: 'dashdot', width: 4 },
      });
    } else {
      for (const yg of yearGroups) {
        const byWave = orderedWaves.map((wave) => resolvePoint(stats.filter((d) =>
            d.schoolId === school
            && d.yearGroup === yg
            && d.wave === wave
            && (ethnicity === 'all' || d.ethnicity === ethnicity)
        )));
        traces.push({
          x: orderedWaves,
          y: byWave.map((d) => d.mean),
          error_y: { type: 'data', array: byWave.map((d) => d.ci), visible: true },
          name: `${schools.find((s) => s.id === school)?.name || school} - ${yg}`,
          mode: 'lines+markers',
        });
      }
      // Weighted average total line
      const totalByWave = orderedWaves.map((wave) => {
        const entries = stats.filter((d) =>
            d.schoolId === school
            && d.wave === wave
            && Number.isFinite(d.mean)
            && d.n > 0
            && (ethnicity === 'all' || d.ethnicity === ethnicity));
        return resolvePoint(entries);
      });
      traces.push({
        x: orderedWaves,
        y: totalByWave.map((d) => d.mean),
        error_y: { type: 'data', array: totalByWave.map((d) => d.ci), visible: false },
        name: `${schools.find((s) => s.id === school)?.name || school} - Total`,
        mode: 'lines+markers',
        line: { dash: 'dashdot', width: 4 },
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
  }, [stats, view, surveyId, school, yearGroup, surveys, waves, schools, ethnicity]);

  const surveyOptions = useMemo(() => surveys.map((s) => ({ value: s.id, label: s.name })), [surveys]);

  const selectedSurvey = useMemo(() => surveys.find((s) => s.id === surveyId), [surveyId, surveys]);
  const selectionLabel = useMemo(() => {
    const surveyName = selectedSurvey?.name || 'Survey';
    if (view === 'cross-school') {
      return `${surveyName} totals across all schools (wave-by-wave)`;
    }
    const schoolName = schools.find((s) => s.id === school)?.name || 'Selected school';
    if (view === 'school') {
      return `${surveyName} totals for ${schoolName}`;
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
            <span>Ethnicity</span>
            <select value={ethnicity} onChange={(e) => setEthnicity(e.target.value)}>
              {ethnicityOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt === 'all' ? 'All ethnicities' : opt}
                  </option>
              ))}
            </select>
          </label>
          <label className="daisy-select space-y-1">
            <span>View</span>
            <select value={view} onChange={(e) => setView(e.target.value)}>
              <option value="school">School (by yeargroup)</option>
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

function ItemResponseChart({ responses, surveys, waves, schools, yearGroups, schoolToTtp }) {
  const [surveyId, setSurveyId] = useState(surveys[0].id);
  const [schoolId, setSchoolId] = useState(schools[0].id);
  const [yearGroup, setYearGroup] = useState(yearGroups[0]);
  const [studentUid, setStudentUid] = useState('all');
  const chartRef = useRef(null);

  const survey = useMemo(() => surveys.find((s) => s.id === surveyId), [surveyId, surveys]);

  const itemKeys = useMemo(
      () => Array.from({ length: survey?.items || 0 }, (_, idx) => `${surveyId}-item-${idx + 1}`),
      [survey?.items, surveyId],
  );

  const studentOptions = useMemo(() => {
    const pool = responses
        .filter((r) => r.schoolId === schoolId && r.yearGroup === yearGroup)
        .map((r) => r.uid);
    const unique = Array.from(new Set(pool)).sort();
    return [{ value: 'all', label: 'Yeargroup average' }, ...unique.map((uid) => ({ value: uid, label: uid }))];
  }, [responses, schoolId, yearGroup]);

  useEffect(() => {
    if (!studentOptions.find((opt) => opt.value === studentUid)) {
      setStudentUid('all');
    }
  }, [studentOptions, studentUid]);

  useEffect(() => {
    if (!chartRef.current || !survey) return;

    const orderedWaves = [...waves];
    const base = responses.filter((r) => r.schoolId === schoolId && r.yearGroup === yearGroup);

    const traces = itemKeys.map((key, idx) => {
      const y = orderedWaves.map((wave) => {
        const entries = base.filter((r) => r.wave === wave);
        if (studentUid !== 'all') {
          const studentEntry = entries.find((r) => r.uid === studentUid);
          const val = Number(studentEntry?.[key]);
          return Number.isFinite(val) ? val : null;
        }

        const values = entries
            .map((r) => Number(r[key]))
            .filter((val) => Number.isFinite(val));
        if (values.length === 0) return null;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        return Number(mean.toFixed(2));
      });

      return {
        x: orderedWaves,
        y,
        mode: 'lines+markers',
        name: `${survey.name} Item ${idx + 1}`,
      };
    });

    Plotly.react(
        chartRef.current,
        traces,
        {
          title: `${survey.name} item scores (${studentUid === 'all' ? 'yeargroup mean' : studentUid})`,
          yaxis: { title: 'Item score', range: [0, 3], dtick: 1, zeroline: false },
          xaxis: { title: 'Wave' },
          legend: { orientation: 'h' },
          margin: { t: 50, r: 10, l: 60, b: 40 },
        },
        { responsive: true },
    );
  }, [responses, survey, waves, schoolId, yearGroup, studentUid, itemKeys]);

  return (
      <div className="section-card">
        <h2 className="text-xl font-semibold">Item-level explorer (relabelled responses)</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="daisy-select space-y-1">
            <span>Survey</span>
            <select value={surveyId} onChange={(e) => setSurveyId(e.target.value)}>
              {surveys.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
              ))}
            </select>
          </label>
          <label className="daisy-select space-y-1">
            <span>School</span>
            <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
              {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {schoolToTtp?.[s.id] ? ` (${schoolToTtp[s.id]})` : ''}
                  </option>
              ))}
            </select>
          </label>
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
          <label className="daisy-select space-y-1">
            <span>Student</span>
            <select value={studentUid} onChange={(e) => setStudentUid(e.target.value)}>
              {studentOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
              ))}
            </select>
          </label>
        </div>
        <p className="small-note mt-2">
          View relabelled item scores by yeargroup or drill down to an individual student within that cohort.
        </p>
        <div className="chart-box mt-4">
          <div ref={chartRef} className="h-[420px]" />
        </div>
        <p className="small-note">Each line shows a survey item. Switch to a student to see their trajectory across waves.</p>
      </div>
  );
}


function App() {
  const dataset = useMemo(() => buildDataset(20241201), []);
  console.log(dataset);
  const initialSets = useMemo(() => loadLabelSets() || [DEFAULT_LABEL_SET], []);
  const [labelSets, setLabelSets] = useState(initialSets);
  const [activeSetName, setActiveSetName] = useState(initialSets[0]?.name || DEFAULT_LABEL_SET.name);

  const activeSet = useMemo(
      () => labelSets.find((set) => set.name === activeSetName) || labelSets[0] || DEFAULT_LABEL_SET,
      [labelSets, activeSetName],
  );

  useEffect(() => {
    saveLabelSets(labelSets);
  }, [labelSets]);

  const uniqueName = (base, sets) => {
    let candidate = base;
    let suffix = 0;
    while (sets.some((set) => set.name === candidate)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  };

  const normalizeAssignments = (assignments = {}) => Object.fromEntries(
      Object.entries(assignments)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([section, ids]) => [section, [...ids].sort()]),
  );

  const areSetsEqual = (a, b) => {
    const left = {
      labels: (a.labels || []).map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        description: label.description,
      })),
      assignments: normalizeAssignments(a.assignments || {}),
    };
    const right = {
      labels: (b.labels || []).map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        description: label.description,
      })),
      assignments: normalizeAssignments(b.assignments || {}),
    };
    return JSON.stringify(left) === JSON.stringify(right);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const incomingName = params.get('labelSetName');
    const incomingLabels = params.get('labelSetLabels');
    const incomingAssignments = params.get('labelSetAssignments');

    if (incomingName && incomingLabels) {
      try {
        const parsedLabels = decodeDataFromParam(incomingLabels);
        const parsedAssignments = incomingAssignments ? decodeDataFromParam(incomingAssignments) : {};
        const incomingSet = { name: incomingName, labels: parsedLabels, assignments: parsedAssignments };
        setLabelSets((prev) => {
          const next = [...prev];
          const idx = next.findIndex((set) => set.name === incomingName);
          if (idx !== -1) {
            const existing = next[idx];
            const differs = !areSetsEqual(existing, incomingSet);
            if (differs && existing.name !== DEFAULT_LABEL_SET.name) {
              const backupName = uniqueName(`${existing.name}_backup`, next);
              next[idx] = { ...existing, name: backupName };
            } else if (differs) {
              incomingSet.name = uniqueName(`${incomingName} (imported)`, next);
            } else {
              next.splice(idx, 1);
            }
          }
          const trimmed = next.filter((set) => set.name !== incomingSet.name);
          trimmed.push(incomingSet);
          return trimmed;
        });
        setActiveSetName(incomingSet.name);
      } catch (err) {
        console.warn('Unable to load label set from URL', err);
      }
    }
  }, []);

  const filterRows = (rows, map) => rows.map(map || ((r) => r));

  const ethnicityOptions = useMemo(
      () => Array.from(new Set(dataset.students.map((s) => s.ethnicity))).sort(),
      [dataset.students],
  );

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
    { key: 'ethnicity', label: 'Ethnicity' },
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


  const surveyColumns = [
    { key: 'ttp', label: 'TTP', render: (_, row) => schoolToTtp[row.schoolId] || '—' },
    { key: 'schoolId', label: 'School', render: (v) => schoolLookup[v] || v },
    { key: 'yearGroup', label: 'Yeargroup' },
    { key: 'ethnicity', label: 'Ethnicity' },
    { key: 'studentId', label: 'Student' },
    { key: 'wave', label: 'Wave' },
    ...surveyItemColumns,
  ];

  const relabelledSurveyColumns = [
    { key: 'ttp', label: 'TTP', render: (_, row) => schoolToTtp[row.schoolId] || '—' },
    { key: 'schoolId', label: 'School', render: (v) => schoolLookup[v] || v },
    { key: 'yearGroup', label: 'Yeargroup' },
    { key: 'ethnicity', label: 'Ethnicity' },
    { key: 'uid', label: 'Student' },
    { key: 'wave', label: 'Wave' },
    ...surveyItemColumns,
  ];

  const rewriteColumns = [
    { key: 'ttp', label: 'TTP', render: (_, row) => schoolToTtp[row.schoolId] || '—' },
    { key: 'studentId', label: 'Student ID' },
    { key: 'ethnicity', label: 'Ethnicity' },
    { key: 'schoolId', label: 'School', render: (v) => schoolLookup[v] || v },
    { key: 'uid', label: 'UID' },
  ];

  const aggregateColumns = [
    { key: 'ttp', label: 'TTP', render: (_, row) => schoolToTtp[row.schoolId] || '—' },
    { key: 'schoolId', label: 'School', render: (v) => schoolLookup[v] || v },
    { key: 'yearGroup', label: 'Yeargroup' },
    { key: 'ethnicity', label: 'Ethnicity' },
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

  const ensureAssignments = (sectionKey) => activeSet.assignments?.[sectionKey] || [];
  const resolvedLabels = (sectionKey) => ensureAssignments(sectionKey)
      .map((id) => activeSet.labels.find((label) => label.id === id))
      .filter(Boolean);

  const updateActiveSet = (updater) => {
    setLabelSets((prev) => prev.map((set) => {
      if (set.name !== activeSet.name) return set;
      return updater(set);
    }));
  };

  const addLabelDefinition = ({ name, color, description }) => {
    updateActiveSet((set) => {
      const newLabel = {
        id: `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString(36)}`,
        name,
        color,
        description: description.slice(0, DESCRIPTION_LIMIT),
      };
      return { ...set, labels: [...set.labels, newLabel] };
    });
  };

  const removeLabelDefinition = (labelId) => {
    updateActiveSet((set) => {
      const filteredLabels = set.labels.filter((label) => label.id !== labelId);
      const trimmedAssignments = Object.fromEntries(
          Object.entries(set.assignments || {}).map(([section, ids]) => [section, ids.filter((id) => id !== labelId)]),
      );
      return { ...set, labels: filteredLabels, assignments: trimmedAssignments };
    });
  };

  const addLabelToSection = (sectionKey, labelId) => {
    updateActiveSet((set) => {
      const nextIds = Array.from(new Set([...(set.assignments?.[sectionKey] || []), labelId]));
      return { ...set, assignments: { ...set.assignments, [sectionKey]: nextIds } };
    });
  };

  const removeLabelFromSection = (sectionKey, labelId) => {
    updateActiveSet((set) => {
      const nextIds = (set.assignments?.[sectionKey] || []).filter((id) => id !== labelId);
      return { ...set, assignments: { ...set.assignments, [sectionKey]: nextIds } };
    });
  };

  const createSet = (name) => {
    const existing = labelSets.find((set) => set.name === name);
    if (existing) {
      setActiveSetName(existing.name);
      return;
    }
    const newSet = { name, labels: DEFAULT_LABELS, assignments: {} };
    setLabelSets((prev) => [...prev, newSet]);
    setActiveSetName(name);
  };

  const renameSet = (name) => {
    if (!name.trim()) return;
    setLabelSets((prev) => prev.map((set) => (set.name === activeSet.name ? { ...set, name } : set)));
    setActiveSetName(name);
  };

  const backupSet = () => {
    const candidate = uniqueName(`${activeSet.name}_backup`, labelSets);
    const clone = { ...activeSet, name: candidate };
    setLabelSets((prev) => [...prev, clone]);
  };

  const deleteSet = () => {
    if (labelSets.length <= 1) return;
    const remaining = labelSets.filter((set) => set.name !== activeSet.name);
    setLabelSets(remaining);
    setActiveSetName(remaining[0]?.name || DEFAULT_LABEL_SET.name);
  };

  const buildShareLink = () => {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    url.searchParams.set('labelSetName', activeSet.name);
    url.searchParams.set('labelSetLabels', encodeDataForParam(activeSet.labels));
    url.searchParams.set('labelSetAssignments', encodeDataForParam(activeSet.assignments || {}));
    const share = url.toString();
    navigator.clipboard?.writeText(share).catch(() => {});
    return share;
  };

  const labelOptions = activeSet.labels || [];

  return (
      <div className="min-h-screen">
        <header className="header-bar">
          <div className="app-shell py-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <h1>IB Oxford data handling mockup</h1>
                <p className="hero-copy">
                  Seeded, reproducible mock data to help stakeholders explore what is collected, how it is categorised, and how it flows between entities.
                </p>
              </div>
              <div className="badge-seed">Demo dataset (seed {dataset.seed})</div>
            </div>
          </div>
        </header>

        <main className="app-shell">

          <LabelSetManager
              labelSets={labelSets}
              activeSetName={activeSet.name}
              onSelectSet={setActiveSetName}
              onCreateSet={createSet}
              onRenameSet={renameSet}
              onDeleteSet={deleteSet}
              onBackupSet={backupSet}
              onAddLabel={addLabelDefinition}
              onRemoveLabelDefinition={removeLabelDefinition}
              onShare={buildShareLink}
          />
          <TtpPanel ttps={dataset.ttps} schools={dataset.schools} />

          <DatasetSection
              title="ID + Password combinations"
              description="Credentials that are not assigned to an individual student, scoped by school and area."
              columns={credentialColumns}
              rows={filterRows(dataset.credentials)}
              labelOptions={labelOptions}
              assignedLabels={resolvedLabels('credentials')}
              onAddLabel={(labelId) => addLabelToSection('credentials', labelId)}
              onRemoveLabel={(labelId) => removeLabelFromSection('credentials', labelId)}
          />

          <DatasetSection
              title="ID + Password + Student combinations"
              description="Student-facing credentials including yeargroup alignment."
              columns={studentCredentialColumns}
              rows={filterRows(dataset.studentCredentials)}
              labelOptions={labelOptions}
              assignedLabels={resolvedLabels('studentCredentials')}
              onAddLabel={(labelId) => addLabelToSection('studentCredentials', labelId)}
              onRemoveLabel={(labelId) => removeLabelFromSection('studentCredentials', labelId)}
          />

          <DatasetSection
              title="ID Rewrite Map"
              description="Maps student IDs to UIDs for pseudonymisation."
              columns={rewriteColumns}
              rows={filterRows(dataset.rewriteMap)}
              labelOptions={labelOptions}
              assignedLabels={resolvedLabels('rewriteMap')}
              onAddLabel={(labelId) => addLabelToSection('rewriteMap', labelId)}
              onRemoveLabel={(labelId) => removeLabelFromSection('rewriteMap', labelId)}
          />

          <DatasetSection
              title="Labelled student survey responses"
              description="Survey data labelled with student ID and wave."
              columns={surveyColumns}
              rows={filterRows(dataset.surveyResponses, mapSurveyRow)}
              labelOptions={labelOptions}
              assignedLabels={resolvedLabels('surveyResponses')}
              onAddLabel={(labelId) => addLabelToSection('surveyResponses', labelId)}
              onRemoveLabel={(labelId) => removeLabelFromSection('surveyResponses', labelId)}
          />

          <DatasetSection
              title="Relabelled student survey responses"
              description="Survey data with student IDs rewritten to UIDs."
              columns={relabelledSurveyColumns}
              rows={filterRows(dataset.relabelledSurveyResponses, mapSurveyRow)}
              labelOptions={labelOptions}
              assignedLabels={resolvedLabels('relabelledSurveyResponses')}
              onAddLabel={(labelId) => addLabelToSection('relabelledSurveyResponses', labelId)}
              onRemoveLabel={(labelId) => removeLabelFromSection('relabelledSurveyResponses', labelId)}
          />

          <DatasetSection
              title="Static aggregated data"
              description="Yeargroup-level aggregates by wave with confidence intervals, split by ethnicity and all-ethnicities totals."
              columns={aggregateColumns}
              rows={filterRows([...dataset.staticAggregated, ...dataset.staticAggregatedAgnostic])}
              labelOptions={labelOptions}
              assignedLabels={resolvedLabels('staticAggregated')}
              onAddLabel={(labelId) => addLabelToSection('staticAggregated', labelId)}
              onRemoveLabel={(labelId) => removeLabelFromSection('staticAggregated', labelId)}
          />

          <DynamicAggregatedSection
              dataset={dataset}
              labelOptions={labelOptions}
              assignedLabels={resolvedLabels('dynamicAggregated')}
              onAddLabel={(labelId) => addLabelToSection('dynamicAggregated', labelId)}
              onRemoveLabel={(labelId) => removeLabelFromSection('dynamicAggregated', labelId)}
              schoolLookup={schoolLookup}
          />

          <ItemResponseChart
              responses={dataset.relabelledSurveyResponses}
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