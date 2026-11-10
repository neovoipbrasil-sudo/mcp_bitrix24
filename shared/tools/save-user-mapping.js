import { z } from 'zod';
import { saveUserMapping, suggestUserMapping } from '../utils/user-mapping.js';

export const saveUserMappingSchema = z.object({
  source_users: z.array(z.object({
    ID: z.string(),
    NAME: z.string().optional(),
    LAST_NAME: z.string().optional(),
    EMAIL: z.string().optional(),
  })).describe('Lista de usuarios de la instancia origen'),
  dest_users: z.array(z.object({
    ID: z.string(),
    NAME: z.string().optional(),
    LAST_NAME: z.string().optional(),
    EMAIL: z.string().optional(),
  })).describe('Lista de usuarios de la instancia destino'),
  output_file: z.string().describe('Ruta donde guardar el JSON de mapeo'),
});

export async function saveUserMappingTool({ source_users, dest_users, output_file }) {
  const mapping = suggestUserMapping(source_users, dest_users);

  const unmapped = source_users.filter(u => !mapping[u.ID]);

  saveUserMapping(mapping, output_file);

  return {
    saved_to: output_file,
    mapped_count: Object.keys(mapping).length,
    unmapped_count: unmapped.length,
    mapping,
    unmapped_users: unmapped.map(u => ({
      id: u.ID,
      name: `${u.NAME || ''} ${u.LAST_NAME || ''}`.trim(),
      email: u.EMAIL,
    })),
    summary: `${Object.keys(mapping).length} usuarios mapeados, ${unmapped.length} sin correspondencia en destino`,
    note: unmapped.length > 0
      ? 'Los usuarios sin mapeo deberán asignarse manualmente. Las automatizaciones que los referencien tendrán advertencias al aplicar.'
      : null,
  };
}
