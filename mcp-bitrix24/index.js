import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// ── Universales ───────────────────────────────────────────────────────────────
import { callSchema, universalCall, batchSchema, universalBatch } from '../shared/tools/universal-call.js';

// ── CRM Datos ─────────────────────────────────────────────────────────────────
import {
  crmListSchema, crmList,
  crmGetSchema, crmGet,
  crmCreateSchema, crmCreate,
  crmUpdateSchema, crmUpdate,
  crmDeleteSchema, crmDelete,
  crmFieldsSchema, crmFields,
  timelineAddSchema, timelineAdd,
} from '../shared/tools/crm.js';

// ── CRM Config ────────────────────────────────────────────────────────────────
import { connectTestSchema, connectTest } from '../shared/tools/connect-test.js';
import { readConfigSchema, readFullConfig } from '../shared/tools/read-config.js';
import { readEntityTypesSchema, readEntityTypes } from '../shared/tools/read-entity-types.js';
import { readPipelinesSchema, readPipelines } from '../shared/tools/read-pipelines.js';
import { readCustomFieldsSchema, readCustomFields } from '../shared/tools/read-custom-fields.js';
import { readAutomationsSchema, readAutomations } from '../shared/tools/read-automations.js';
import { readProductCatalogSchema, readProductCatalog } from '../shared/tools/read-product-catalog.js';
import { compareConfigsSchema, compareConfigs } from '../shared/tools/compare-configs.js';
import { applyConfigSchema, applyConfig } from '../shared/tools/apply-config.js';
import { saveUserMappingSchema, saveUserMappingTool } from '../shared/tools/save-user-mapping.js';

// ── Tareas ────────────────────────────────────────────────────────────────────
import {
  tasksListSchema, tasksList,
  tasksGetSchema, tasksGet,
  tasksCreateSchema, tasksCreate,
  tasksUpdateSchema, tasksUpdate,
  tasksCompleteSchema, tasksComplete,
} from '../shared/tools/tasks.js';

// ── Usuarios y Departamentos ──────────────────────────────────────────────────
import { usersListSchema, usersList } from '../shared/tools/users-departments.js';
import { departmentsListSchema, departmentsList } from '../shared/tools/users-departments.js';

// ── Disco ─────────────────────────────────────────────────────────────────────
import {
  diskStoragesSchema, diskStorages,
  diskFolderListSchema, diskFolderList,
  diskFileGetSchema, diskFileGet,
  diskFileUploadSchema, diskFileUpload,
} from '../shared/tools/disk.js';

// ── Calendario ────────────────────────────────────────────────────────────────
import { calendarListSchema, calendarList, calendarCreateSchema, calendarCreate } from '../shared/tools/calendar.js';

// ── Feed, Notificaciones, Grupos, BizProc, Telefonía ─────────────────────────
import {
  feedPostSchema, feedPost,
  notifySendSchema, notifySend,
  groupsListSchema, groupsList,
  chatSendSchema, chatSend,
  bizprocListSchema, bizprocList,
  bizprocStartSchema, bizprocStart,
  telephonyCallsSchema, telephonyCalls,
} from '../shared/tools/feed-notifications.js';

// ── Catálogo / Productos ──────────────────────────────────────────────────────
import {
  productsListSchema, productsList,
  productsGetSchema, productsGet,
  productsCreateSchema, productsCreate,
  productsUpdateSchema, productsUpdate,
  productsSectionsSchema, productsSections,
} from '../shared/tools/catalog-products.js';

// ─────────────────────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'bitrix24-config', version: '2.0.0' });

function wrap(fn) {
  return async (params) => {
    try {
      const result = await fn(params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const msg = err.response?.data
        ? `${err.message}\nBitrix24: ${JSON.stringify(err.response.data)}`
        : err.message;
      return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
    }
  };
}

// ── Universales ───────────────────────────────────────────────────────────────
server.tool('b24_call',
  'Llama CUALQUIER método REST de la API de Bitrix24. Úsalo cuando no exista un tool específico. ' +
  'Referencia completa: https://dev.1c-bitrix.ru/rest_help/',
  callSchema.shape, wrap(universalCall));

server.tool('b24_batch',
  'Ejecuta múltiples llamadas a la API de Bitrix24 en una sola request HTTP. ' +
  'Los resultados de una llamada pueden usarse como parámetros de la siguiente con $result[alias][campo].',
  batchSchema.shape, wrap(universalBatch));

// ── Conexión ──────────────────────────────────────────────────────────────────
server.tool('b24_test_connection',
  'Verifica la conexión al webhook de Bitrix24 y confirma datos del portal y permisos del usuario.',
  connectTestSchema.shape, wrap(connectTest));

// ── CRM Datos ─────────────────────────────────────────────────────────────────
server.tool('b24_crm_list',
  'Lista registros CRM: deals, contactos, empresas, leads, cotizaciones, o items de SPA. Soporta filtros, selección de campos y paginación automática.',
  crmListSchema.shape, wrap(crmList));

server.tool('b24_crm_get',
  'Obtiene un registro CRM completo por ID: deal, contact, company, lead, o item de SPA.',
  crmGetSchema.shape, wrap(crmGet));

server.tool('b24_crm_create',
  'Crea un nuevo registro CRM: deal, contact, company, lead, cotización, o item de SPA.',
  crmCreateSchema.shape, wrap(crmCreate));

server.tool('b24_crm_update',
  'Actualiza campos de un registro CRM existente.',
  crmUpdateSchema.shape, wrap(crmUpdate));

server.tool('b24_crm_delete',
  'Elimina un registro CRM por ID.',
  crmDeleteSchema.shape, wrap(crmDelete));

server.tool('b24_crm_fields',
  'Lista todos los campos disponibles de una entidad CRM (estándar + personalizados) con sus tipos, etiquetas y configuración.',
  crmFieldsSchema.shape, wrap(crmFields));

server.tool('b24_crm_timeline_add',
  'Agrega un comentario o actividad a la línea de tiempo de un registro CRM.',
  timelineAddSchema.shape, wrap(timelineAdd));

// ── CRM Config ────────────────────────────────────────────────────────────────
server.tool('b24_read_full_config',
  'Lee TODA la configuración estructural de la instancia: entidades, pipelines, etapas, campos, automatizaciones, catálogo y usuarios. Exporta a JSON.',
  readConfigSchema.shape, wrap(readFullConfig));

server.tool('b24_read_entity_types',
  'Lee todos los tipos de entidad CRM y SPA (Smart Process Automation) con sus atributos.',
  readEntityTypesSchema.shape, wrap(readEntityTypes));

server.tool('b24_read_pipelines',
  'Lee pipelines (funnels) y sus etapas con colores, semántica y orden.',
  readPipelinesSchema.shape, wrap(readPipelines));

server.tool('b24_read_custom_fields',
  'Lee campos personalizados de todas las entidades CRM con su configuración completa.',
  readCustomFieldsSchema.shape, wrap(readCustomFields));

server.tool('b24_read_automations',
  'Lee reglas de automatización (robots y triggers) por etapa con condiciones y acciones.',
  readAutomationsSchema.shape, wrap(readAutomations));

server.tool('b24_read_product_catalog',
  'Lee la estructura de configuración del catálogo de productos: secciones, propiedades, precios y unidades.',
  readProductCatalogSchema.shape, wrap(readProductCatalog));

server.tool('b24_compare_configs',
  'Compara dos archivos JSON de configuración e informa qué existe en origen y no en destino, y viceversa.',
  compareConfigsSchema.shape, wrap(compareConfigs));

server.tool('b24_apply_config',
  'Aplica una configuración exportada a una instancia destino. Crea si no existe, actualiza si existe, nunca elimina.',
  applyConfigSchema.shape, wrap(applyConfig));

server.tool('b24_save_user_mapping',
  'Genera y guarda el mapeo de IDs de usuarios entre dos instancias, necesario para replicar automatizaciones.',
  saveUserMappingSchema.shape, wrap(saveUserMappingTool));

// ── Tareas ────────────────────────────────────────────────────────────────────
server.tool('b24_tasks_list',
  'Lista tareas con filtros por responsable, grupo, estado, vencimiento, etc.',
  tasksListSchema.shape, wrap(tasksList));

server.tool('b24_tasks_get',
  'Obtiene el detalle completo de una tarea por ID.',
  tasksGetSchema.shape, wrap(tasksGet));

server.tool('b24_tasks_create',
  'Crea una nueva tarea con título, descripción, responsable, fecha límite, prioridad y más.',
  tasksCreateSchema.shape, wrap(tasksCreate));

server.tool('b24_tasks_update',
  'Actualiza campos de una tarea existente.',
  tasksUpdateSchema.shape, wrap(tasksUpdate));

server.tool('b24_tasks_complete',
  'Marca una tarea como completada.',
  tasksCompleteSchema.shape, wrap(tasksComplete));

// ── Usuarios y Departamentos ──────────────────────────────────────────────────
server.tool('b24_users_list',
  'Lista usuarios activos con nombre, email, cargo, departamento y estado online.',
  usersListSchema.shape, wrap(usersList));

server.tool('b24_departments_list',
  'Lista departamentos de la estructura organizativa con jerarquía y responsables.',
  departmentsListSchema.shape, wrap(departmentsList));

// ── Disco ─────────────────────────────────────────────────────────────────────
server.tool('b24_disk_storages',
  'Lista todos los storages disponibles (personal, grupos, empresa).',
  diskStoragesSchema.shape, wrap(diskStorages));

server.tool('b24_disk_folder_list',
  'Lista el contenido de una carpeta en el Disk de Bitrix24.',
  diskFolderListSchema.shape, wrap(diskFolderList));

server.tool('b24_disk_file_get',
  'Obtiene información de un archivo incluyendo URL de descarga.',
  diskFileGetSchema.shape, wrap(diskFileGet));

server.tool('b24_disk_file_upload',
  'Sube un archivo a una carpeta del Disk de Bitrix24.',
  diskFileUploadSchema.shape, wrap(diskFileUpload));

// ── Calendario ────────────────────────────────────────────────────────────────
server.tool('b24_calendar_list',
  'Lista eventos de calendario personal, de grupo o de empresa con filtro de fechas.',
  calendarListSchema.shape, wrap(calendarList));

server.tool('b24_calendar_create',
  'Crea un evento en el calendario con participantes, ubicación y recordatorios.',
  calendarCreateSchema.shape, wrap(calendarCreate));

// ── Feed y Comunicación ───────────────────────────────────────────────────────
server.tool('b24_feed_post',
  'Publica un mensaje en el feed de actividad (Live Feed) de Bitrix24, con soporte BB-code.',
  feedPostSchema.shape, wrap(feedPost));

server.tool('b24_notify_send',
  'Envía una notificación personal a un usuario dentro de Bitrix24.',
  notifySendSchema.shape, wrap(notifySend));

server.tool('b24_chat_send',
  'Envía un mensaje a un chat privado o grupal en el IM de Bitrix24.',
  chatSendSchema.shape, wrap(chatSend));

// ── Grupos ────────────────────────────────────────────────────────────────────
server.tool('b24_groups_list',
  'Lista grupos de trabajo (workgroups y proyectos) con filtros por estado y visibilidad.',
  groupsListSchema.shape, wrap(groupsList));

// ── Procesos de Negocio ───────────────────────────────────────────────────────
server.tool('b24_bizproc_list',
  'Lista instancias de procesos de negocio activas, filtradas por entidad o registro.',
  bizprocListSchema.shape, wrap(bizprocList));

server.tool('b24_bizproc_start',
  'Inicia un proceso de negocio (workflow) sobre un documento o registro CRM.',
  bizprocStartSchema.shape, wrap(bizprocStart));

// ── Telefonía ─────────────────────────────────────────────────────────────────
server.tool('b24_telephony_calls',
  'Lista el historial de llamadas con filtros por entidad CRM, usuario, duración y fecha.',
  telephonyCallsSchema.shape, wrap(telephonyCalls));

// ── Catálogo / Productos ──────────────────────────────────────────────────────
server.tool('b24_products_list',
  'Lista productos del catálogo con filtros por sección, precio, estado activo, etc.',
  productsListSchema.shape, wrap(productsList));

server.tool('b24_products_get',
  'Obtiene el detalle completo de un producto por ID.',
  productsGetSchema.shape, wrap(productsGet));

server.tool('b24_products_create',
  'Crea un nuevo producto en el catálogo.',
  productsCreateSchema.shape, wrap(productsCreate));

server.tool('b24_products_update',
  'Actualiza un producto del catálogo.',
  productsUpdateSchema.shape, wrap(productsUpdate));

server.tool('b24_products_sections',
  'Lista las secciones/categorías del catálogo de productos.',
  productsSectionsSchema.shape, wrap(productsSections));

// ─────────────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

// Auto-test de conexión al arrancar
if (process.env.B24_DEFAULT_WEBHOOK) {
  try {
    const { Bitrix24Client } = await import('../shared/bitrix24/client.js');
    const client = new Bitrix24Client(process.env.B24_DEFAULT_WEBHOOK);
    const res = await client.call('profile');
    const name = `${res.result?.NAME || ''} ${res.result?.LAST_NAME || ''}`.trim();
    process.stderr.write(`[bitrix24] ✓ Conectado a ${client.portal} como ${name} | ${Object.keys(server._registeredTools ?? {}).length || 40} tools activos\n`);
  } catch (err) {
    process.stderr.write(`[bitrix24] ✗ No se pudo conectar: ${err.message}\n`);
  }
}
