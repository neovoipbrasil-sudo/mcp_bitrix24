import { z } from 'zod';
import { readFileSync } from 'fs';

export const compareConfigsSchema = z.object({
  source_file: z.string().describe('Ruta al archivo JSON de configuración origen'),
  dest_file: z.string().describe('Ruta al archivo JSON de configuración destino'),
});

function diffArrayByName(srcArr, dstArr, nameKey = 'NAME') {
  const srcNames = new Set((srcArr || []).map(i => i[nameKey]));
  const dstNames = new Set((dstArr || []).map(i => i[nameKey]));
  return {
    only_in_source: [...srcNames].filter(n => !dstNames.has(n)),
    only_in_dest: [...dstNames].filter(n => !srcNames.has(n)),
    in_both: [...srcNames].filter(n => dstNames.has(n)),
  };
}

export async function compareConfigs({ source_file, dest_file }) {
  const source = JSON.parse(readFileSync(source_file, 'utf-8'));
  const dest = JSON.parse(readFileSync(dest_file, 'utf-8'));

  const report = {
    source_portal: source.meta?.portal,
    dest_portal: dest.meta?.portal,
    source_exported_at: source.meta?.exported_at,
    dest_exported_at: dest.meta?.exported_at,
    differences: {},
  };

  // Entity types SPA
  report.differences.spa_types = diffArrayByName(
    source.entity_types?.spa,
    dest.entity_types?.spa
  );

  // Pipelines
  const srcPipelineNames = Object.values(source.pipelines || {}).map(p => p.NAME);
  const dstPipelineNames = Object.values(dest.pipelines || {}).map(p => p.NAME);
  report.differences.pipelines = diffArrayByName(
    srcPipelineNames.map(n => ({ NAME: n })),
    dstPipelineNames.map(n => ({ NAME: n }))
  );

  // Custom fields por entidad
  report.differences.custom_fields = {};
  const entities = new Set([
    ...Object.keys(source.custom_fields || {}),
    ...Object.keys(dest.custom_fields || {}),
  ]);
  for (const entity of entities) {
    report.differences.custom_fields[entity] = diffArrayByName(
      source.custom_fields?.[entity] || [],
      dest.custom_fields?.[entity] || [],
      'FIELD_NAME'
    );
  }

  // Currencies
  report.differences.currencies = diffArrayByName(
    source.currencies || [],
    dest.currencies || [],
    'CURRENCY'
  );

  // Automations
  const srcAutoStages = Object.keys(source.automations || {});
  const dstAutoStages = Object.keys(dest.automations || {});
  report.differences.automation_stages = {
    only_in_source: srcAutoStages.filter(s => !dstAutoStages.includes(s)),
    only_in_dest: dstAutoStages.filter(s => !srcAutoStages.includes(s)),
    in_both: srcAutoStages.filter(s => dstAutoStages.includes(s)),
  };

  // Summary
  const hasDiffs = Object.values(report.differences).some(d => {
    if (d.only_in_source?.length || d.only_in_dest?.length) return true;
    if (typeof d === 'object') {
      return Object.values(d).some(sub => sub?.only_in_source?.length || sub?.only_in_dest?.length);
    }
    return false;
  });

  report.has_differences = hasDiffs;
  report.summary = hasDiffs
    ? 'Se encontraron diferencias entre las configuraciones. Revisar el informe antes de aplicar.'
    : 'Las configuraciones son equivalentes en estructura.';

  return report;
}
