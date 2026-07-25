import { compareIdentity } from './review-contract.js';

const TABLES = Object.freeze({
  nodes: ['nodeId','x','y','deformedX','deformedY','ux','uy','displacementMagnitude','sourceSemanticHash'],
  elements: ['elementId','elementType','nodeIds','materialId','thickness','outOfPlaneScale','rawResultLocations','sourceSemanticHash'],
  loads: ['loadType','loadId','nodeId','elementId','edgeNodeIds','fx','fy','magnitude','tx','ty','pressure','equivalentResultantX','equivalentResultantY','outwardNormalAuthority','sourceSemanticHash'],
  constraints: ['constraintId','parentConstraintIdentity','nodeId','component','constraintType','prescribedValue','sourceSemanticHash'],
  displacements: ['nodeId','ux','uy','magnitude'],
  reactions: ['nodeId','component','reaction','constraintIdentity'],
  rawStress: ['elementId','elementType','resultLocationId','xi','eta','x','y','ex','ey','gxy','sx','sy','txy','sigmaZ','principal1','principal2','principalAngle','vonMises','strainEnergy','authority'],
  qualification: ['qualificationId','status','authority','sourceArtifactIdentity','sourceArtifactSemanticHash','evidenceReference','message'],
  diagnostics: ['severity','code','sourceArtifactIdentity','message'],
  projectedStress: ['recordType','nodeId','elementId','cornerId','projectionPatchId','stressComponent','value','contributingElementIds','contributingCornerIds','sourceIntegrationPointIds','weights','minimumContributorValue','maximumContributorValue','contributorSpread','authority','authorityWarning'],
  convergence: ['quantityId','quantityType','component','probeId','regionId','levelId','h','value','classification','observedOrderApplicability','observedOrder','richardsonApplicability','richardsonEstimate','stressTrendStatus','governingLocationMigration','singularityAnnotation'],
});

export function createReviewCsvFiles(review, profile) {
  const files = [
    csvFile('tables/nodes.csv', TABLES.nodes, review.geometryReview.nodes, profile),
    csvFile('tables/elements.csv', TABLES.elements, elementRows(review.geometryReview.elements), profile),
    csvFile('tables/loads.csv', TABLES.loads, loadRows(review.loadReview), profile),
    csvFile('tables/constraints.csv', TABLES.constraints, review.constraintReview.rows, profile),
    csvFile('tables/displacements.csv', TABLES.displacements, review.displacementReview.rows, profile),
    csvFile('tables/reactions.csv', TABLES.reactions, review.reactionReview.rows, profile),
    csvFile('tables/raw-stress.csv', TABLES.rawStress, review.rawStressReview.rows, profile),
    csvFile('tables/qualification.csv', TABLES.qualification, review.qualificationSummary.rows, profile),
    csvFile('tables/diagnostics.csv', TABLES.diagnostics, review.diagnostics, profile),
  ];
  if (review.projectedStressReview.status === 'AVAILABLE_NON_AUTHORITATIVE') files.push(csvFile('tables/projected-stress.csv', TABLES.projectedStress, projectedRows(review.projectedStressReview), profile));
  if (review.convergenceReview.status === 'AVAILABLE') files.push(csvFile('tables/convergence.csv', TABLES.convergence, convergenceRows(review.convergenceReview), profile));
  return files;
}

export function createCsv(columns, rows, profile) {
  if (!Array.isArray(columns) || !columns.length || new Set(columns).size !== columns.length) throw new TypeError('CSV columns are invalid.');
  const lines = [columns.map(csvText).join(',')];
  for (const row of rows) lines.push(columns.map((column) => csvText(formatValue(row[column], column, row, profile), typeof row[column] !== 'number')).join(','));
  const content = `${lines.join('\n')}\n`;
  validateCsv(content, columns.length);
  return content;
}

export function validateCsv(content, expectedColumnCount) {
  const rows = parseCsvRows(content);
  if (!rows.length || rows.some((row) => row.length !== expectedColumnCount)) throw new TypeError('CSV schema column count mismatch.');
  return true;
}

function csvFile(path, columns, rows, profile) {
  return { path, content: createCsv(columns, rows, profile), rowCount: rows.length, columns };
}

function elementRows(rows) {
  return rows.map((row) => ({ ...row, nodeIds: row.nodeIds.join('|'), rawResultLocations: row.rawResultLocations.join('|') }));
}

function loadRows(review) {
  const point = review.nodalForces.map((row) => ({ loadType:'NODAL_FORCE', loadId:row.loadId, nodeId:row.nodeId, elementId:null, edgeNodeIds:null, fx:row.fx, fy:row.fy, magnitude:row.magnitude, tx:null, ty:null, pressure:null, equivalentResultantX:row.fx, equivalentResultantY:row.fy, outwardNormalAuthority:null, sourceSemanticHash:row.sourceSemanticHash }));
  const edge = [...review.edgeTractions, ...review.edgePressures].map((row) => ({ ...row, nodeId:null, edgeNodeIds:row.edgeNodeIds.join('|'), fx:null, fy:null, magnitude:null }));
  return [...point, ...edge].sort((a,b)=>compareIdentity(a.loadId,b.loadId));
}

function projectedRows(review) {
  const corners = review.elementCornerValues.flatMap((row) => row.components.map((component) => ({
    recordType:'ELEMENT_CORNER', nodeId:row.nodeId, elementId:row.elementId, cornerId:row.cornerId, projectionPatchId:null,
    stressComponent:component.stressComponent, value:component.value, contributingElementIds:row.elementId,
    contributingCornerIds:`${row.elementId}:${row.cornerId}`, sourceIntegrationPointIds:component.sourceIntegrationPointIds.join('|'),
    weights:component.coefficients.join('|'), minimumContributorValue:null, maximumContributorValue:null, contributorSpread:null,
    authority:row.authority, authorityWarning:row.authorityWarning,
  })));
  const nodes = review.nodalValues.map((row) => ({
    recordType:'NODAL_PATCH', nodeId:row.nodeId, elementId:null, cornerId:null, projectionPatchId:row.projectionPatchId,
    stressComponent:row.stressComponent, value:row.weightedValue, contributingElementIds:row.contributingElementIds.join('|'),
    contributingCornerIds:row.contributingCornerIds.join('|'), sourceIntegrationPointIds:row.sourceIntegrationPointIds.join('|'),
    weights:row.weights.map((item)=>`${item.elementId}:${item.normalizedWeight}`).join('|'), minimumContributorValue:row.minimumContributorValue,
    maximumContributorValue:row.maximumContributorValue, contributorSpread:row.contributorSpread,
    authority:row.authority, authorityWarning:row.authorityWarning,
  }));
  return [...corners,...nodes].sort((a,b)=>compareIdentity(a.recordType,b.recordType)||compareIdentity(a.nodeId||'',b.nodeId||'')||compareIdentity(a.elementId||'',b.elementId||'')||compareIdentity(a.stressComponent,b.stressComponent));
}

function convergenceRows(review) {
  return review.quantities.flatMap((quantity) => (quantity.history || []).map((history) => ({
    quantityId:quantity.quantityId, quantityType:quantity.quantityType, component:quantity.component, probeId:quantity.probeId, regionId:quantity.regionId,
    levelId:history.levelId, h:history.h, value:history.value, classification:quantity.classification,
    observedOrderApplicability:quantity.observedOrder?.applicability || null, observedOrder:quantity.observedOrder?.observedOrder ?? null,
    richardsonApplicability:quantity.richardson?.applicability || null, richardsonEstimate:quantity.richardson?.estimatedValue ?? null,
    stressTrendStatus:quantity.stressTrend?.status || null, governingLocationMigration:quantity.stressTrend?.governingLocationMigration || null,
    singularityAnnotation:quantity.stressTrend?.singularityAnnotation || null,
  }))).sort((a,b)=>compareIdentity(a.quantityId,b.quantityId)||compareIdentity(a.levelId,b.levelId));
}

function formatValue(value, column, row, profile) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'number') return String(value);
  const precision = precisionFor(column, row, profile);
  if (precision === null) return String(Object.is(value,-0)?0:value);
  const rounded = Number(value.toFixed(precision));
  return rounded.toFixed(precision);
}

function precisionFor(column, row, profile) {
  if (['x','y','deformedX','deformedY','xi','eta','h'].includes(column)) return profile.coordinateDisplayPrecision;
  if (['ux','uy','magnitude','displacementMagnitude','prescribedValue'].includes(column)) return profile.displacementDisplayPrecision;
  if (['fx','fy','reaction','equivalentResultantX','equivalentResultantY'].includes(column)) return profile.forceDisplayPrecision;
  if (['tx','ty','pressure','ex','ey','gxy','sx','sy','txy','sigmaZ','principal1','principal2','principalAngle','vonMises','minimumContributorValue','maximumContributorValue','contributorSpread'].includes(column)) return profile.stressDisplayPrecision;
  if (['strainEnergy'].includes(column)) return profile.energyDisplayPrecision;
  if (['value','richardsonEstimate','observedOrder'].includes(column)) return convergencePrecision(row, profile);
  return null;
}

function convergencePrecision(row, profile) {
  if (row.quantityType === 'STRAIN_ENERGY') return profile.energyDisplayPrecision;
  if (row.quantityType === 'DISPLACEMENT_FUNCTIONAL' || ['UX','UY'].includes(row.component)) return profile.displacementDisplayPrecision;
  if (row.quantityType === 'REACTION_RESULTANT') return profile.forceDisplayPrecision;
  return profile.stressDisplayPrecision;
}

function csvText(value, protectFormula = true) {
  let text = String(value ?? '');
  if (protectFormula && /^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replaceAll('"','""')}"`;
  return text;
}

function parseCsvRows(content) {
  const rows=[]; let row=[]; let field=''; let quoted=false;
  for(let i=0;i<content.length;i+=1){const c=content[i];if(quoted){if(c==='"'&&content[i+1]==='"'){field+='"';i+=1;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(field);field='';}else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';}else if(c!=='\r')field+=c;}
  if(quoted)throw new TypeError('CSV contains unterminated quoted field.');
  if(field.length||row.length){row.push(field);rows.push(row);}
  return rows;
}
