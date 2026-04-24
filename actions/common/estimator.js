// Port of app/migration_estimator.py — keep formulas bit-for-bit identical.

const EFFORTS_TABLE = {
  'Teams':               { base_count: 50,    analysis: 0.5, build: 0.5,  coordination: 1,   monitoring: 0.5,  final_validation: 2,   addition_factor: 3,    loop_number: 50 },
  'Job Role':            { base_count: 100,   analysis: 0.25,build: 0.5,  coordination: 0.5, monitoring: 0.5,  final_validation: 1,   addition_factor: 2,    loop_number: 100 },
  'Companies':           { base_count: 10,    analysis: 0.5, build: 0.25, coordination: 0.5, monitoring: 0.25, final_validation: 1,   addition_factor: 2,    loop_number: 30 },
  'Milestone Path':      { base_count: 10,    analysis: 0.5, build: 0.25, coordination: 1,   monitoring: 0.25, final_validation: 1.5, addition_factor: 2,    loop_number: 20 },
  'Custom Section':      { base_count: 50,    analysis: 0.5, build: 0.25, coordination: 0.5, monitoring: 0.25, final_validation: 1,   addition_factor: 4,    loop_number: 500 },
  'Custom Fields':       { base_count: 200,   analysis: 1.5, build: 0.5,  coordination: 2,   monitoring: 0.25, final_validation: 2,   addition_factor: 4,    loop_number: 400 },
  'Custom Form':         { base_count: 50,    analysis: 1.5, build: 3.5,  coordination: 3,   monitoring: 1.5,  final_validation: 6,   addition_factor: 4,    loop_number: 100 },
  'Users':               { base_count: 1000,  analysis: 1.5, build: 1.5,  coordination: 5,   monitoring: 1.5,  final_validation: 6,   addition_factor: 5,    loop_number: 1000 },
  'Views':               { base_count: 100,   analysis: 1,   build: 1,    coordination: 0.5, monitoring: 0.5,  final_validation: 2,   addition_factor: 1,    loop_number: 200 },
  'Filters':             { base_count: 100,   analysis: 1,   build: 1,    coordination: 1,   monitoring: 1,    final_validation: 3,   addition_factor: 2,    loop_number: 100 },
  'Grouping':            { base_count: 100,   analysis: 1,   build: 1,    coordination: 0.5, monitoring: 0.5,  final_validation: 1,   addition_factor: 1,    loop_number: 200 },
  'Approvals':           { base_count: 10,    analysis: 1,   build: 1,    coordination: 2,   monitoring: 0.5,  final_validation: 3,   addition_factor: 2,    loop_number: 10 },
  'Schedules':           { base_count: 4,     analysis: 0.5, build: 1,    coordination: 1,   monitoring: 0.25, final_validation: 1,   addition_factor: 1,    loop_number: 2 },
  'Timesheet Profiles':  { base_count: 2,     analysis: 0.5, build: 0.5,  coordination: 1,   monitoring: 0.25, final_validation: 1,   addition_factor: 1,    loop_number: 2 },
  'Scorecards':          { base_count: 2,     analysis: 0.5, build: 0.5,  coordination: 1,   monitoring: 0.25, final_validation: 1,   addition_factor: 1,    loop_number: 2 },
  'Portfolios':          { base_count: 10,    analysis: 0.5, build: 0.25, coordination: 0.5, monitoring: 0.25, final_validation: 1,   addition_factor: 2,    loop_number: 500 },
  'Programs':            { base_count: 10,    analysis: 0.5, build: 0.25, coordination: 0.5, monitoring: 0.25, final_validation: 1,   addition_factor: 2,    loop_number: 500 },
  'Templates':           { base_count: 1000,  analysis: 1,   build: 2,    coordination: 2,   monitoring: 2,    final_validation: 7,   addition_factor: 10,   loop_number: 1000 },
  'Projects':            { base_count: 3000,  analysis: 3,   build: 3,    coordination: 8,   monitoring: 6,    final_validation: 12,  addition_factor: 6,    loop_number: 5000 },
  'Template Tasks':      { base_count: 20000, analysis: 3,   build: 3,    coordination: 3,   monitoring: 6,    final_validation: 10,  addition_factor: 10,   loop_number: 5000 },
  'Tasks':               { base_count: 25000, analysis: 4,   build: 3,    coordination: 10,  monitoring: 6,    final_validation: 16,  addition_factor: 10,   loop_number: 25000 },
  'Issues':              { base_count: 10000, analysis: 3,   build: 3,    coordination: 5,   monitoring: 4,    final_validation: 6,   addition_factor: 4,    loop_number: 5000 },
  'Document Folder':     { base_count: 5000,  analysis: 2,   build: 1,    coordination: 3,   monitoring: 2,    final_validation: 4,   addition_factor: 2,    loop_number: 2000 },
  'Documents':           { base_count: 20000, analysis: 5,   build: 4,    coordination: 11,  monitoring: 6,    final_validation: 20,  addition_factor: 6,    loop_number: 10000 },
  'Notes':               { base_count: 50000, analysis: 2,   build: 2,    coordination: 4,   monitoring: 6,    final_validation: 8,   addition_factor: 5,    loop_number: 25000 },
  'Scrum/Kanban Objects':{ base_count: 20,    analysis: 2,   build: 1,    coordination: 4,   monitoring: 1,    final_validation: 6,   addition_factor: 2,    loop_number: 4 },
  'Boards':              { base_count: null,  analysis: 2,   build: 4,    coordination: 4,   monitoring: 6,    final_validation: 6,   addition_factor: null, loop_number: null },
  'Resourcing':          { base_count: 50,    analysis: 2,   build: 4,    coordination: 4,   monitoring: 6,    final_validation: 6,   addition_factor: 2,    loop_number: 50 },
  'Calendars':           { base_count: 30,    analysis: 2,   build: 1.5,  coordination: 4,   monitoring: 1.5,  final_validation: 6,   addition_factor: 2,    loop_number: 10 },
  'Reports':             { base_count: 400,   analysis: 2,   build: 1,    coordination: 4,   monitoring: 1,    final_validation: 6,   addition_factor: 2,    loop_number: 200 },
  'Dashboards':          { base_count: 50,    analysis: 2,   build: 1,    coordination: 2,   monitoring: 1,    final_validation: 4,   addition_factor: 2,    loop_number: 50 }
}

const FIXED_EFFORT_OBJECTS = {
  'Risk Type': 1,
  'Expense Type': 1,
  'Hour Type': 1,
  'Update Feeds': 2,
  'Admin Console Setup': 0
}

const MANUAL_MULTIPLIER_OBJECTS = {
  'Group': 1.0,
  'Access Level': 0.5,
  'Layout Template': 1.5
}

const COMPLEXITY_THRESHOLD = {
  'Group': 1,
  'Access Level': 1
}

const SETUP_ADMIN_OBJECTS = [
  'Group', 'Teams', 'Job Role',
  'Risk Type', 'Expense Type', 'Hour Type', 'Companies', 'Milestone Path',
  'Access Level', 'Custom Section', 'Custom Fields', 'Custom Form',
  'Layout Template', 'Users', 'Views', 'Filters', 'Approvals',
  'Update Feeds', 'Schedules', 'Timesheet Profiles', 'Scorecards',
  'Admin Console Setup'
]

const TRANSACTIONAL_OBJECTS = [
  'Portfolios', 'Programs', 'Templates', 'Projects', 'Template Tasks',
  'Tasks', 'Issues', 'Documents', 'Notes', 'Scrum/Kanban Objects',
  'Boards', 'Analytics', 'Resourcing', 'Timesheets', 'Calendars',
  'Reports', 'Dashboards'
]

const WF_OBJ_CODE_MAP = {
  'Group': 'group',
  'Teams': 'team',
  'Job Role': 'role',
  'Companies': 'cmpy',
  'Milestone Path': 'mpath',
  'Custom Section': 'prtl',
  'Custom Fields': 'param',
  'Custom Form': 'ctgy',
  'Users': 'user',
  'Approvals': 'arvpth',
  'Schedules': 'sched',
  'Portfolios': 'port',
  'Programs': 'prgm',
  'Templates': 'tmpl',
  'Projects': 'proj',
  'Template Tasks': 'ttsk',
  'Tasks': 'task',
  'Issues': 'optask',
  'Documents': 'docu',
  'Notes': 'note',
  'Reports': 'ptlsec',
  'Dashboards': 'ptl'
}

const DEFAULT_REQUIRED = {}
for (const n of SETUP_ADMIN_OBJECTS) DEFAULT_REQUIRED[n] = true
for (const n of TRANSACTIONAL_OBJECTS) DEFAULT_REQUIRED[n] = true
Object.assign(DEFAULT_REQUIRED, {
  'Risk Type': false, 'Expense Type': false, 'Hour Type': false,
  'Update Feeds': false, 'Admin Console Setup': false,
  'Boards': false, 'Analytics': false, 'Resourcing': false, 'Timesheets': false,
  'Proofing': false
})

const FUSION_SCENARIO_HOURS = 10

function normalizeObjectCounts (raw) {
  const out = {}
  for (const [k, v] of Object.entries(raw || {})) {
    if (v === null || v === undefined || v === '') { out[k] = null; continue }
    const num = Number(v)
    out[k] = Number.isFinite(num) ? Math.trunc(num) : null
  }
  return out
}

function computeObjectEffort (name, count, required = true) {
  const setupSet = new Set(SETUP_ADMIN_OBJECTS)
  const result = {
    name,
    count,
    required,
    migration_technique: 'Manual',
    complexity: '',
    analysis: 0, build: 0, coordination: 0,
    monitoring: 0, final_validation: 0,
    complexity_factor: 0,
    total_effort: 0,
    category: setupSet.has(name) ? 'setup' : 'transactional'
  }

  if (name in FIXED_EFFORT_OBJECTS) {
    result.migration_technique = name === 'Update Feeds' ? 'Manual' : 'Fusion'
    if (required) result.total_effort = FIXED_EFFORT_OBJECTS[name]
    return result
  }

  if (name in MANUAL_MULTIPLIER_OBJECTS) {
    result.migration_technique = 'Manual'
    if (count && count > 0) {
      const multiplier = MANUAL_MULTIPLIER_OBJECTS[name]
      result.total_effort = round1(count * multiplier)
      const lookup = EFFORTS_TABLE[name]
      if (lookup && lookup.base_count) {
        const threshold = COMPLEXITY_THRESHOLD[name] ?? 5
        if (count <= lookup.base_count) {
          result.complexity = 'Simple'
        } else {
          const loops = Math.ceil((count - lookup.base_count) / (lookup.loop_number || 1))
          result.complexity = loops <= threshold ? 'Medium' : 'Complex'
        }
      }
    }
    return result
  }

  const lookup = EFFORTS_TABLE[name]
  if (!lookup) return result

  result.migration_technique = 'Fusion'
  if (!count || count <= 0) return result

  const base = lookup.base_count
  const loop = lookup.loop_number
  const addFactor = lookup.addition_factor

  result.analysis = lookup.analysis
  result.build = lookup.build
  result.coordination = lookup.coordination
  result.monitoring = lookup.monitoring
  result.final_validation = lookup.final_validation

  if (base !== null && base !== undefined && base > 0) {
    const threshold = COMPLEXITY_THRESHOLD[name] ?? 5
    if (count <= base) {
      result.complexity = 'Simple'
    } else {
      const loops = Math.ceil((count - base) / (loop || 1))
      result.complexity = loops <= threshold ? 'Medium' : 'Complex'
    }
    if (count > base && loop && addFactor) {
      result.complexity_factor = Math.ceil((count - base) / loop) * addFactor
    }
  }

  result.total_effort = round1(
    result.analysis + result.build + result.coordination +
    result.monitoring + result.final_validation + result.complexity_factor
  )
  return result
}

function computeFullEstimate (objectCounts, options = {}) {
  const { fusionScenarios = 0, excludedObjects = null } = options
  const order = [...SETUP_ADMIN_OBJECTS, ...TRANSACTIONAL_OBJECTS]
  const excluded = new Set(excludedObjects || [])

  const lineItems = order.map(name => {
    let count, required
    if (excluded.has(name)) { count = 0; required = false }
    else { count = objectCounts[name]; required = DEFAULT_REQUIRED[name] ?? true }
    return computeObjectEffort(name, count, required)
  })

  const setupTotal = lineItems.filter(it => it.category === 'setup').reduce((s, it) => s + it.total_effort, 0)
  const transactionalTotal = lineItems.filter(it => it.category === 'transactional').reduce((s, it) => s + it.total_effort, 0)

  const fs = Math.max(0, Math.trunc(fusionScenarios))
  const fusionTotal = fs * FUSION_SCENARIO_HOURS

  const baseSum = Math.ceil(setupTotal) + Math.ceil(transactionalTotal) + Math.ceil(fusionTotal)
  const discoveryDesign = Math.ceil(baseSum * 10) / 100
  const pm = Math.ceil(baseSum * 20) / 100

  const sa = Math.ceil(setupTotal)
  const tr = Math.ceil(transactionalTotal)
  const fu = Math.ceil(fusionTotal)
  const dR = Math.ceil(discoveryDesign)
  const pmR = Math.ceil(pm)
  const grandTotal = sa + tr + fu + dR + pmR

  return {
    line_items: lineItems,
    summary: {
      setup_admin_hours: sa,
      transactional_reporting_hours: tr,
      fusion_integration_hours: fu,
      fusion_scenarios: fs,
      fusion_hours_per_scenario: FUSION_SCENARIO_HOURS,
      discovery_design_hours: dR,
      pm_hours: pmR,
      grand_total_hours: grandTotal
    }
  }
}

function round1 (x) { return Math.round(x * 10) / 10 }

module.exports = {
  SETUP_ADMIN_OBJECTS,
  TRANSACTIONAL_OBJECTS,
  WF_OBJ_CODE_MAP,
  DEFAULT_REQUIRED,
  FIXED_EFFORT_OBJECTS,
  MANUAL_MULTIPLIER_OBJECTS,
  FUSION_SCENARIO_HOURS,
  normalizeObjectCounts,
  computeObjectEffort,
  computeFullEstimate
}
