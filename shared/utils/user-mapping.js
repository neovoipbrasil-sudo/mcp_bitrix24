import { readFileSync, writeFileSync } from 'fs';

export function applyUserMapping(automations, mappingFilePath) {
  if (!mappingFilePath) return automations;

  let mapping;
  try {
    mapping = JSON.parse(readFileSync(mappingFilePath, 'utf-8'));
  } catch {
    return automations;
  }

  const str = JSON.stringify(automations);
  let result = str;
  for (const [sourceId, destId] of Object.entries(mapping)) {
    result = result.replaceAll(`"${sourceId}"`, `"${destId}"`);
    result = result.replaceAll(`:${sourceId}`, `:${destId}`);
  }
  return JSON.parse(result);
}

export function suggestUserMapping(sourceUsers, destUsers) {
  const mapping = {};
  for (const src of sourceUsers) {
    const match =
      destUsers.find(d => d.EMAIL === src.EMAIL) ||
      destUsers.find(d => `${d.NAME} ${d.LAST_NAME}`.trim() === `${src.NAME} ${src.LAST_NAME}`.trim());
    if (match) {
      mapping[src.ID] = match.ID;
    }
  }
  return mapping;
}

export function saveUserMapping(mapping, outputFile) {
  writeFileSync(outputFile, JSON.stringify(mapping, null, 2), 'utf-8');
}
