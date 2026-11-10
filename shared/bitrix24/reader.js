import { fetchAllPages } from '../utils/pagination.js';

export class Bitrix24Reader {
  constructor(client) {
    this.client = client;
  }

  async readEntityTypes() {
    const [spaList, statuses, currencies] = await Promise.all([
      fetchAllPages(this.client, 'crm.type.list'),
      fetchAllPages(this.client, 'crm.status.list'),
      fetchAllPages(this.client, 'crm.currency.list'),
    ]);

    const standardTypes = [
      { ID: '1', NAME: 'Lead', ENTITY_TYPE_ID: 1 },
      { ID: '2', NAME: 'Deal', ENTITY_TYPE_ID: 2 },
      { ID: '3', NAME: 'Contact', ENTITY_TYPE_ID: 3 },
      { ID: '4', NAME: 'Company', ENTITY_TYPE_ID: 4 },
    ];

    return {
      standard: standardTypes,
      spa: spaList,
      statuses,
      currencies,
    };
  }

  async readPipelines(entityTypeId = null) {
    const pipelines = {};

    const entityTypes = entityTypeId
      ? [{ ENTITY_TYPE_ID: entityTypeId }]
      : [{ ENTITY_TYPE_ID: 2 }, { ENTITY_TYPE_ID: 1 }];

    for (const et of entityTypes) {
      const id = et.ENTITY_TYPE_ID;
      try {
        let categories;
        if (id === 2) {
          categories = await fetchAllPages(this.client, 'crm.category.list', { entityTypeId: id });
        } else if (id === 1) {
          const res = await this.client.call('crm.lead.status.list');
          categories = [{ ID: 'lead', NAME: 'Lead Pipeline', stages: res.result }];
        } else {
          categories = await fetchAllPages(this.client, 'crm.category.list', { entityTypeId: id });
        }

        for (const cat of categories) {
          const stages = await fetchAllPages(this.client, 'crm.stage.list', {
            entityTypeId: id,
            categoryId: cat.ID,
          });
          pipelines[`${id}_${cat.ID}`] = { ...cat, stages };
        }
      } catch {
        // Entity type may not support pipelines
      }
    }

    return pipelines;
  }

  async readCustomFields(entityTypeId = null) {
    const fields = {};
    const entityMap = {
      deal: 'crm.deal.userfield.list',
      contact: 'crm.contact.userfield.list',
      company: 'crm.company.userfield.list',
      lead: 'crm.lead.userfield.list',
    };

    for (const [entity, method] of Object.entries(entityMap)) {
      if (entityTypeId && entity !== entityTypeId) continue;
      try {
        fields[entity] = await fetchAllPages(this.client, method);
      } catch {
        fields[entity] = [];
      }
    }

    return fields;
  }

  async readAutomations(entityTypeId = null) {
    const automations = {};
    try {
      const rules = await fetchAllPages(this.client, 'crm.automation.rule.list', {
        filter: entityTypeId ? { ENTITY_TYPE_ID: entityTypeId } : {},
      });
      for (const rule of rules) {
        const key = `${rule.ENTITY_TYPE_ID}:${rule.STAGE_ID}`;
        if (!automations[key]) automations[key] = [];
        automations[key].push(rule);
      }
    } catch {
      // bizproc scope may not be available
    }
    return automations;
  }

  async readProductCatalog() {
    const catalog = {};
    try {
      const [catalogs, sections, properties, measures, priceTypes] = await Promise.all([
        fetchAllPages(this.client, 'catalog.catalog.list'),
        fetchAllPages(this.client, 'catalog.section.list'),
        fetchAllPages(this.client, 'catalog.product.property.list'),
        fetchAllPages(this.client, 'catalog.measure.list'),
        fetchAllPages(this.client, 'catalog.price.type.list'),
      ]);
      catalog.catalogs = catalogs;
      catalog.sections = sections;
      catalog.properties = properties;
      catalog.measures = measures;
      catalog.price_types = priceTypes;
    } catch {
      catalog.error = 'Catalog scope not available or not enabled in this plan';
    }
    return catalog;
  }

  async readUsers() {
    return fetchAllPages(this.client, 'user.get', {
      filter: { ACTIVE: true },
      select: ['ID', 'NAME', 'LAST_NAME', 'EMAIL', 'WORK_POSITION', 'UF_DEPARTMENT'],
    });
  }
}
