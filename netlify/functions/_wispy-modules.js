const fs = require('fs');
const path = require('path');
const { getContextData } = require('./_wispy-panel-utils');

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const skillsRoot = path.join(workspaceRoot, 'skills');

function loadLocalSkills() {
  try {
    return fs.readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        role: 'skill local',
        status: 'available'
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function getModuleRegistry() {
  const context = getContextData();
  return {
    skills: loadLocalSkills(),
    gpts: Array.isArray(context.gpts) ? context.gpts : [],
    subagents: Array.isArray(context.subagents) ? context.subagents : []
  };
}

module.exports = {
  getModuleRegistry
};
