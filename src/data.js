const ttps = [
  { id: 'oxford-ttp', name: 'Oxford Secure TTP' },
  { id: 'shanghai-ttp', name: 'Shanghai Harmony TTP' },
];

const ttpNamePools = {
  'oxford-ttp': {
    first: [
      'Alice',
      'Benjamin',
      'Charlotte',
      'Daniel',
      'Eleanor',
      'Finn',
      'Grace',
      'Harriet',
      'Isabelle',
      'Jacob',
      'Lily',
      'Matthew',
      'Nora',
      'Oliver',
      'Penelope',
      'Quentin',
      'Rose',
      'Samuel',
      'Thomas',
      'Victoria'
    ],
    last: [
      'Anderson',
      'Bennett',
      'Carter',
      'Davies',
      'Evans',
      'Foster',
      'Green',
      'Hamilton',
      'Ingram',
      'Johnson',
      'Knight',
      'Lewis',
      'Morgan',
      'Nelson',
      'Owen',
      'Parker',
      'Quinn',
      'Roberts',
      'Stewart',
      'Turner'
    ]
  },
  'shanghai-ttp': {
    first: [
      'An',
      'Bao',
      'Chun',
      'Daiyu',
      'Enlai',
      'Fang',
      'Guang',
      'Haoran',
      'Jiayi',
      'Kai',
      'Ling',
      'Ming',
      'Ning',
      'Peizhi',
      'Qiu',
      'Rong',
      'Shan',
      'Tao',
      'Wei',
      'Ying'
    ],
    last: [
      'Chen',
      'Deng',
      'Fang',
      'Gao',
      'Han',
      'Huang',
      'Jiang',
      'Li',
      'Liu',
      'Ma',
      'Peng',
      'Qian',
      'Sun',
      'Tang',
      'Wang',
      'Xu',
      'Yang',
      'Zeng',
      'Zhang',
      'Zhou'
    ]
  }
};


const schools = [
  { id: 'oxford-high', name: 'Oxford High', ttpId: 'oxford-ttp' },
  { id: 'cherwell', name: 'Cherwell School', ttpId: 'oxford-ttp' },
  { id: 'magdalen', name: 'Magdalen College School', ttpId: 'oxford-ttp' },
  { id: 'pudong-high', name: 'Pudong High School', ttpId: 'shanghai-ttp' },
  { id: 'huangpu-academy', name: 'Huangpu Academy', ttpId: 'shanghai-ttp' }
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
  const usedNames = new Set();
  const schoolToTtp = Object.fromEntries(schools.map((school) => [school.id, school.ttpId]));

  for (const school of schools) {
    for (const yearGroup of yearGroups) {
      const cohortSize = 8 + Math.floor(random() * 6);
      for (let i = 0; i < cohortSize; i++) {
        const ttpId = schoolToTtp[school.id];
        const namePool = ttpNamePools[ttpId] || ttpNamePools['oxford-ttp'];
        let name = '';
        let attempts = 0;
        do {
          name = `${sample(namePool.first, random)} ${sample(namePool.last, random)}`;
          attempts += 1;
        } while (usedNames.has(name) && attempts < 50);

        usedNames.add(name);
        students.push({
          id: `${school.id.toUpperCase()}-${counter++}`,
          schoolId: school.id,
          yearGroup,
          name
        });
      }
    }
  }
  return students;
}

const shortHash = (len = 6) => Math.random().toString(36).substring(2, 2 + len);

function buildCredentials(students, random) {
  const allCredentials = [];
  for (const school of schools) {
    const base = Math.floor(random() * 90000) + 10000;
    const n_required = students.filter((s) => s.schoolId === school.id).length;
    const n = Math.ceil(n_required * 1.25);
    for (let i = 0; i < n; i++) {
      let hash = shortHash();
      while (allCredentials.find((cred) => cred.id === `${school.id}-${hash}`)) {
        hash = shortHash();
      }
      allCredentials.push({
        schoolId: school.id,
        id: `${school.id}-${hash}`,
        password: `${shortHash(4)}-${shortHash(8)}`
      });
    }
  }

  const studentCreds = [];
  students.forEach((student, index) => {
    const myCreds = allCredentials
        .filter((cred) => (cred.schoolId === student.schoolId))
        .filter((cred) => !studentCreds.find((sc) => sc.id === cred.id));
    if (myCreds.length === 0) {
      throw new Error(`Not enough credentials for student ${student.id} in school ${student.schoolId}`);
    }
    const creds = myCreds[0];
    studentCreds.push({
      schoolId: student.schoolId,
      ...creds,
      studentId: student.id,
      name: student.name,
      yearGroup: student.yearGroup
    });
  });

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
    let highResponseActive = random() < 0.1;
    for (const wave of waves) {
      let response = {
        studentId: student.id,
        schoolId: student.schoolId,
        yearGroup: student.yearGroup,
        wave
      };
      if (random() < 0.05) continue; // some missing data
      const elevatedThisWave = highResponseActive || random() < 0.1;
      for (const survey of surveys) {
        let total = 0;
        const items = Object.fromEntries(
            Array.from({ length: survey.items }, (_, idx) => {
              const normalScore = Math.floor(random() * 4);
              const score = elevatedThisWave ? Math.min(3, 2 + Math.floor(random() * 2)) : normalScore;
              total += score;
              return [`${survey.id}-item-${idx}`, score];
            })
        );
        response = {
          ...response, [`${survey.id}-total`]: total, ...items
        }
      }
      responses.push(response)
      if (highResponseActive && random() < 0.5) {
        highResponseActive = false;
      } else if (!highResponseActive && elevatedThisWave && random() < 0.5) {
        highResponseActive = true;
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
    const key = [resp.schoolId, resp.yearGroup, resp.wave].join('|');
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(resp);
  }

  const aggregates = [];
  for (const [key, group] of grouped.entries()) {
    const [schoolId, yearGroup, wave] = key.split('|');
    const stats = {};
    for (const survey of surveys) {
      const totals = group.map(response => response[`${survey.id}-total`] ?? 0);
      stats[`${survey.id}-total`] = totals.reduce((acc, val) => acc + val, 0);
      stats[`${survey.id}-n`] = totals.length;
      stats[`${survey.id}-mean`] = Number(mean(totals)).toFixed(2);
      stats[`${survey.id}-ci95`] = Number(ci95(totals)).toFixed(2);
    }
    aggregates.push({
      schoolId,
      yearGroup,
      wave,
      ...stats
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
    studentId: undefined,
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

  return {
    seed,
    schools,
    yearGroups,
    waves,
    surveys,
    students,
    credentials: allCredentials,
    studentCredentials: studentCreds,
    surveyResponses: surveysRaw,
    rewriteMap,
    relabelledSurveyResponses: relabelled,
    staticAggregated,
    dynamicAggregated,
    metadata: buildMetadataSummary(),
    entityMatrix: buildEntityMatrix(),
    ttps
  };
}