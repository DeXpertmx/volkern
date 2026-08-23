#!/usr/bin/env node
/**
 * Auditoría del entrenamiento de Telegram:
 * 1. Intents definidos (lib/agents/intents/*.ts)
 * 2. Mapeo INTENT_TO_SKILL (lib/agents/skill-orchestrator.ts)
 * 3. Skills registrados (lib/skills/index.ts)
 *
 * Salida: intents sin skill, skills registrados sin intent (huérfanos).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

// ── 1. Intents ──────────────────────────────────────────────────────────────
const intents = new Map() // name -> archivo
for (const f of readdirSync(join(ROOT, 'lib/agents/intents')).filter(f => f.endsWith('.ts'))) {
  const src = readFileSync(join(ROOT, 'lib/agents/intents', f), 'utf8')
  const re = /name:\s*'([a-z_][a-z0-9_]*)'/g
  let m
  while ((m = re.exec(src)) !== null) {
    if (!intents.has(m[1])) intents.set(m[1], f)
  }
}

// ── 2. INTENT_TO_SKILL ─────────────────────────────────────────────────────
const orch = readFileSync(join(ROOT, 'lib/agents/skill-orchestrator.ts'), 'utf8')
const decl = orch.indexOf('const INTENT_TO_SKILL: Record<string, string> = {')
const mapSrc = orch.slice(decl, orch.indexOf('};', decl))
const intentToSkill = new Map()
const re2 = /'([a-z_][a-z0-9_]*)'\s*:\s*'([a-z_][a-z0-9_]*)'/g
let m2
while ((m2 = re2.exec(mapSrc)) !== null) intentToSkill.set(m2[1], m2[2])

// ── 3. Skills registrados ──────────────────────────────────────────────────
const skillsSrc = readFileSync(join(ROOT, 'lib/skills/index.ts'), 'utf8')
const regStart = skillsSrc.indexOf('export const skills = {')
const regSrc = skillsSrc.slice(regStart, skillsSrc.indexOf('};', regStart))
const registered = new Set()
const re3 = /^\s{2}([a-z_][a-z0-9_]*):\s*[a-zA-Z_$][\w$]*/gm
let m3
while ((m3 = re3.exec(regSrc)) !== null) registered.add(m3[1])

// ── Resultados ─────────────────────────────────────────────────────────────
const intentsWithoutSkill = [...intents.keys()].filter(i => !intentToSkill.has(i))
const orphans = [...registered].filter(s => ![...intentToSkill.values()].includes(s))

console.log('═══════════ RECUENTO ENTRENAMIENTO TELEGRAM ═══════════')
console.log(`Intents definidos:        ${intents.size}`)
console.log(`Entradas INTENT_TO_SKILL: ${intentToSkill.size}`)
console.log(`Skills registrados:      ${registered.size}`)
console.log(`Skills únicos mapeados:  ${new Set(intentToSkill.values()).size}`)
console.log('')

console.log(`\n── A) INTENTS SIN SKILL (${intentsWithoutSkill.length}) — se clasifican pero fallarían al ejecutar ──`)
for (const i of intentsWithoutSkill) console.log(`   • ${i}  (${intents.get(i)})`)

console.log(`\n── B) SKILLS REGISTRADOS SIN INTENT (${orphans.length}) — existen pero NO se pueden disparar por Telegram ──`)
for (const s of orphans) console.log(`   • ${s}`)

console.log(`\n── C) INTENTS QUE SÍ TIENEN SKILL (${intents.size - intentsWithoutSkill.length}) ──`)
for (const i of [...intents.keys()].sort()) {
  if (intentToSkill.has(i)) console.log(`   • ${i} → ${intentToSkill.get(i)}`)
}
