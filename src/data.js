const schools = [
  { id: 'oxford-high', name: 'Oxford High' },
  { id: 'cherwell', name: 'Cherwell School' },
  { id: 'magdalen', name: 'Magdalen College School' }
];

const yearGroups = ['Year 9', 'Year 10', 'Year 11'];
const waves = ['Wave 1', 'Wave 2', 'Wave 3'];
const surveys = [
  { id: 'phq9', name: 'PHQ-9', items: 9 },
  { id: 'gad7', name: 'GAD-7', items: 7 }
];

function createSeededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function sample(array, random) {
  return array[Math.floor(random() * array.length)];
}

function buildStudents(random) {
  let counter = 1000;
  const students = [];
  for (const school of schools) {
    for (const yearGroup of yearGroups) {
      const cohortSize = 8 + Math.floor(random() * 6);
      for (let i = 0; i < cohortSize; i++) {
        students.push({
          id: `${school.id.toUpperCase()}-${counter++}`,
          schoolId: school.id,
          yearGroup,
          name: `Student ${counter}`
        });
      }
    }
  }
  return students;
}

function buildCredentials(students, random) {
  const authArea = 'Authentication';
  const allCredentials = [];
  for (const school of schools) {
    const base = Math.floor(random() * 90000) + 10000;
    allCredentials.push({
      schoolId: school.id,
      area: authArea,
      id: `${school.id}-admin`,
      password: `Pass-${base}`
    });
  }

  const studentCreds = students.map((student, index) => ({
    schoolId: student.schoolId,
    area: authArea,
    id: `U-${student.id}`,
    password: `pw-${Math.floor(random() * 9999)}`,
    studentId: student.id,
    yearGroup: student.yearGroup,
    note: index % 3 === 0 ? 'Set by local admin' : 'Issued centrally'
  }));

  return { allCredentials, studentCreds };
}

function buildRewriteMap(students, random) {
  return students.map((student, idx) => ({
    schoolId: student.schoolId,
    studentId: student.id,
    uid: `UID-${(idx + 1).toString().padStart(5, '0')}`
  }));
}

function buildSurveyResponses(students, random) {
  const responses = [];
  for (const student of students) {
    for (const wave of waves) {
      if (random() < 0.15) continue; // some missing data
      for (const survey of surveys) {
        const items = Array.from({ length: survey.items }, (_, idx) => ({
          item: `${survey.name} Item ${idx + 1}`,
          score: Math.floor(random() * 4)
        }));
        const total = items.reduce((acc, item) => acc + item.score, 0);
        responses.push({
          surveyId: survey.id,
          surveyName: survey.name,
          studentId: student.id,
          schoolId: student.schoolId,
          yearGroup: student.yearGroup,
          wave,
          total,
          items
        });
      }
    }
  }
  return responses;
}

function mean(array) {
  return array.reduce((a, b) => a + b, 0) / (array.length || 1);
}

function stddev(array) {
  if (array.length <= 1) return 0;
  const m = mean(array);
  return Math.sqrt(array.reduce((acc, val) => acc + (val - m) ** 2, 0) / (array.length - 1));
}

function ci95(values) {
  if (values.length === 0) return 0;
  return 1.96 * (stddev(values) / Math.sqrt(values.length));
}

function aggregateStatic(responses) {
  const grouped = new Map();
  for (const resp of responses) {
    const key = [resp.schoolId, resp.yearGroup, resp.wave, resp.surveyId].join('|');
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(resp);
  }

  const aggregates = [];
  for (const [key, group] of grouped.entries()) {
    const [schoolId, yearGroup, wave, surveyId] = key.split('|');
    const totals = group.map((g) => g.total);
    aggregates.push({
      schoolId,
      yearGroup,
      wave,
      surveyId,
      surveyName: group[0].surveyName,
      n: totals.length,
      mean: Number(mean(totals).toFixed(2)),
      ci: Number(ci95(totals).toFixed(2))
    });
  }
  return aggregates;
}

function aggregateDynamic(responses) {
  const aggregates = aggregateStatic(responses);
  return aggregates.map((agg) => ({
    ...agg,
    suppressed: agg.n < 5,
    notes: agg.n < 5 ? 'Suppressed: fewer than 5 records' : 'Ready for responsive queries'
  }));
}

function relabelResponses(responses, map) {
  const byStudent = new Map(map.map((m) => [m.studentId, m.uid]));
  return responses.map((resp) => ({
    ...resp,
    uid: byStudent.get(resp.studentId) || 'UNKNOWN'
  }));
}

function buildMetadataSummary() {
  return [
    {
      entity: 'Oxford University',
      access: ['Aggregated data', 'Cross-school comparisons', 'Anonymised survey stats'],
      category: 'Anonymous (fully)',
      purpose: 'Research and monitoring'
    },
    {
      entity: 'Trusted Third Party (TTP)',
      access: ['ID rewrite maps', 'Pseudonymous survey data', 'Aggregation logic'],
      category: 'Pseudonymous',
      purpose: 'Linkage and safe release'
    },
    {
      entity: 'Schools',
      access: ['Student credentials', 'School-level surveys', 'Operational reports'],
      category: 'PID and Pseudonymous',
      purpose: 'Local pastoral support'
    }
  ];
}

function buildEntityMatrix() {
  return [
    { entity: 'Oxford University', pid: [], pseudo: ['Relabelled survey responses'], anonRe: ['Static aggregated data', 'Dynamic aggregated data'], anon: ['Cross-school survey trends'] },
    { entity: 'Trusted Third Party', pid: [], pseudo: ['ID rewrite map'], anonRe: ['Relabelled survey responses'], anon: [] },
    { entity: 'Schools', pid: ['ID + Password + Student'], pseudo: ['ID Rewrite Map'], anonRe: ['Relabelled survey responses'], anon: ['Static aggregated data'] }
  ];
}

export function buildDataset(seed = 42) {
  const random = createSeededRandom(seed);
  const students = buildStudents(random);
  const { allCredentials, studentCreds } = buildCredentials(students, random);
  const rewriteMap = buildRewriteMap(students, random);
  const surveysRaw = buildSurveyResponses(students, random);
  const relabelled = relabelResponses(surveysRaw, rewriteMap);
  const staticAggregated = aggregateStatic(relabelled);
  const dynamicAggregated = aggregateDynamic(relabelled);

  const unassignedCredentials = allCredentials.map((item) => ({
    ...item,
    dataProtectionArea: 'Data Protection Area 1'
  }));

  return {
    seed,
    schools,
    yearGroups,
    waves,
    surveys,
    students,
    credentials: unassignedCredentials,
    studentCredentials: studentCreds.map((cred) => ({ ...cred, dataProtectionArea: 'Data Protection Area 1' })),
    surveyResponses: relabelled,
    rewriteMap,
    relabelledSurveyResponses: relabelled.map((resp) => ({
      schoolId: resp.schoolId,
      uid: resp.uid,
      surveyId: resp.surveyId,
      surveyName: resp.surveyName,
      wave: resp.wave,
      yearGroup: resp.yearGroup,
      total: resp.total,
      items: resp.items
    })),
    staticAggregated,
    dynamicAggregated,
    metadata: buildMetadataSummary(),
    entityMatrix: buildEntityMatrix()
  };
}