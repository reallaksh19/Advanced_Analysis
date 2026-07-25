import { SETTINGS_EVENTS } from '../core/settings-authority/index.js';

export class SettingsView {
  constructor(rootElement, eventBus) { this.rootElement = rootElement; this.eventBus = eventBus; }
  render(model) {
    if (!this.rootElement || !model) return;
    const documentRef = this.rootElement.ownerDocument;
    const section = el(documentRef, 'section', 'settings-consumer');
    section.dataset.role = 'settings-consumer';
    section.append(header(documentRef), identityCard(documentRef, model), activeSettingsCard(documentRef, model, this.eventBus), invalidationCard(documentRef, model), persistenceCard(documentRef, model), classificationCard(documentRef, model), diagnosticsCard(documentRef, model), limitationsCard(documentRef, model));
    this.rootElement.replaceChildren(section);
  }
  destroy() { this.rootElement?.replaceChildren(); }
}
function header(d) { const h = el(d,'header','settings-consumer__header'); const wrap=el(d,'div'); appendText(wrap,el(d,'span','panel-eyebrow'),'Immutable current-runtime authority'); appendText(wrap,el(d,'h1'),'Settings'); h.append(wrap); const p=el(d,'p','settings-consumer__claim'); p.textContent='Editing changes only the proposed profile. Apply is explicit, atomic and non-calculating.'; h.append(p); return h; }
function identityCard(d,m) { const card=cardOf(d,'Profile identity'); const dl=el(d,'dl'); [['Active profile',m.profileIdentity],['Semantic hash',m.profileSemanticHash],['Approved defaults',m.defaultProfileIdentity]].forEach(([k,v])=>{const row=el(d,'div'); appendText(row,el(d,'dt'),k); appendText(row,el(d,'dd'),v); dl.append(row);}); card.append(dl); return card; }
function activeSettingsCard(d,m,bus) { const card=cardOf(d,'Active settings and proposal'); const controls=el(d,'div','settings-consumer__controls'); m.fieldRows.forEach((row)=>{ const label=el(d,'label','settings-field'); appendText(label,el(d,'span'),row.label); const select=el(d,'select'); select.dataset.settingsField=row.settingId; row.allowedValuesOrRange.forEach((value)=>{const option=el(d,'option'); option.value=String(value); option.textContent=String(value); option.selected=value===row.proposedValue; select.append(option);}); select.addEventListener('change',()=>bus.publish(SETTINGS_EVENTS.PROPOSAL_CHANGED,{settingId:row.settingId,value:select.value})); label.append(select); const meta=el(d,'small'); meta.textContent=`Consumers: ${row.runtimeConsumers.join(', ')} · Invalidates: ${row.invalidationTargets.join(', ')}`; label.append(meta); row.fieldErrors.forEach((message)=>appendText(label,el(d,'output','settings-field__error'),message)); controls.append(label); }); const actions=el(d,'div','settings-consumer__actions'); actions.append(button(d,'Reset Proposal',()=>bus.publish(SETTINGS_EVENTS.RESET_REQUESTED,{mode:'ACTIVE'})),button(d,'Reset to Approved Defaults',()=>bus.publish(SETTINGS_EVENTS.RESET_REQUESTED,{mode:'APPROVED_DEFAULTS'})),button(d,'Apply Settings Profile',()=>bus.publish(SETTINGS_EVENTS.APPLY_REQUESTED,{}))); card.append(controls,actions); return card; }
function invalidationCard(d,m) { const card=cardOf(d,'Dependency and invalidation preview'); const s=m.invalidationSummary; card.append(list(d,[`Changed settings: ${join(s.changedSettingIds)}`,`Affected consumers: ${join(s.affectedConsumerIds)}`,`Affected contracts: ${join(s.affectedContractKeys)}`,`Stale prepared evidence: ${join(s.stalePreparedEvidence)}`,`Unaffected evidence: ${join(s.unaffectedEvidence)}`,'Automatic recalculation: prohibited'])); return card; }
function persistenceCard(d,m) { const card=cardOf(d,'Persistence'); const p=m.persistenceSummary||{}; card.append(list(d,[`Key: ${p.key||'unavailable'}`,`Status: ${p.status||'unknown'}`,`Stored profile: ${p.profileId||'none'}`,`Rejected stored value: ${p.rejectedStoredSummary?JSON.stringify(p.rejectedStoredSummary):'none'}`])); return card; }
function classificationCard(d,m) { const card=cardOf(d,'Legacy settings classification'); const table=el(d,'table'); const head=el(d,'tr'); ['Setting','Classification','Evidence'].forEach((x)=>appendText(head,el(d,'th'),x)); const thead=el(d,'thead'); thead.append(head); const body=el(d,'tbody'); m.classificationRows.forEach((row)=>{const tr=el(d,'tr'); [row.settingId,row.classification,row.evidence||row.description||''].forEach((x)=>appendText(tr,el(d,'td'),x)); body.append(tr);}); table.append(thead,body); const wrap=el(d,'div','settings-table-wrap'); wrap.append(table); card.append(wrap); return card; }
function diagnosticsCard(d,m) { const card=cardOf(d,'Diagnostics'); card.append(m.diagnostics.length?list(d,m.diagnostics.map((x)=>`${x.code}: ${x.message}`)):text(d,'No settings diagnostics.')); return card; }
function limitationsCard(d,m) { const card=cardOf(d,'Limitations'); card.append(list(d,m.limitations)); return card; }
function cardOf(d,title) { const section=el(d,'section','settings-card'); appendText(section,el(d,'h2'),title); return section; }
function button(d,label,onClick) { const b=el(d,'button'); b.type='button'; b.textContent=label; b.addEventListener('click',onClick); return b; }
function list(d,rows) { const ul=el(d,'ul'); rows.forEach((row)=>appendText(ul,el(d,'li'),row)); return ul; }
function text(d,value) { const p=el(d,'p','panel-empty'); p.textContent=value; return p; }
function join(rows) { return rows?.length ? rows.join(', ') : 'none'; }
function appendText(parent,child,value) { child.textContent=String(value??''); parent.append(child); }
function el(d,tag,className='') { const node=d.createElement(tag); if(className) node.className=className; return node; }
