export class Bitrix24Writer {
  constructor(client) {
    this.client = client;
    this.report = { created: [], updated: [], failed: [], skipped: [] };
  }

  getReport() {
    return this.report;
  }

  async _upsert(method, findMethod, findParams, nameKey, data, entity) {
    try {
      const existing = await this.client.call(findMethod, findParams);
      const list = existing.result ?? [];
      const match = list.find(i => i[nameKey] === data[nameKey]);

      if (match) {
        await this.client.call(`${method}.update`, { id: match.ID, fields: data });
        this.report.updated.push(`${entity}: ${data[nameKey]}`);
      } else {
        await this.client.call(`${method}.add`, { fields: data });
        this.report.created.push(`${entity}: ${data[nameKey]}`);
      }
    } catch (err) {
      this.report.failed.push(`${entity}: ${data[nameKey]} — ${err.message}`);
    }
  }

  async applyCurrencies(currencies) {
    for (const cur of currencies) {
      await this._upsert('crm.currency', 'crm.currency.list', {}, 'CURRENCY', cur, 'currency');
    }
  }

  async applyEntityTypes(spaList) {
    for (const spa of spaList) {
      await this._upsert('crm.type', 'crm.type.list', {}, 'NAME', spa, 'spa_type');
    }
  }

  async applyPipelines(pipelines) {
    for (const [, pipeline] of Object.entries(pipelines)) {
      try {
        const { stages, ...pipelineData } = pipeline;
        const existing = await this.client.call('crm.category.list', {
          entityTypeId: pipelineData.ENTITY_TYPE_ID,
        });
        const match = (existing.result ?? []).find(p => p.NAME === pipelineData.NAME);
        let categoryId;

        if (match) {
          await this.client.call('crm.category.update', { id: match.ID, fields: pipelineData });
          categoryId = match.ID;
          this.report.updated.push(`pipeline: ${pipelineData.NAME}`);
        } else {
          const res = await this.client.call('crm.category.add', {
            entityTypeId: pipelineData.ENTITY_TYPE_ID,
            fields: pipelineData,
          });
          categoryId = res.result;
          this.report.created.push(`pipeline: ${pipelineData.NAME}`);
        }

        if (stages) await this.applyStages(stages, pipelineData.ENTITY_TYPE_ID, categoryId);
      } catch (err) {
        this.report.failed.push(`pipeline: ${pipeline.NAME} — ${err.message}`);
      }
    }
  }

  async applyStages(stages, entityTypeId, categoryId) {
    for (const stage of stages) {
      try {
        const existing = await this.client.call('crm.stage.list', { entityTypeId, categoryId });
        const match = (existing.result ?? []).find(s => s.NAME === stage.NAME);

        if (match) {
          await this.client.call('crm.stage.update', {
            id: match.STATUS_ID,
            fields: stage,
            entityTypeId,
            categoryId,
          });
          this.report.updated.push(`stage: ${stage.NAME}`);
        } else {
          await this.client.call('crm.stage.add', { fields: stage, entityTypeId, categoryId });
          this.report.created.push(`stage: ${stage.NAME}`);
        }
      } catch (err) {
        this.report.failed.push(`stage: ${stage.NAME} — ${err.message}`);
      }
    }
  }

  async applyCustomFields(customFields) {
    const methodMap = {
      deal: 'crm.deal.userfield',
      contact: 'crm.contact.userfield',
      company: 'crm.company.userfield',
      lead: 'crm.lead.userfield',
    };

    for (const [entity, fields] of Object.entries(customFields)) {
      const base = methodMap[entity];
      if (!base) continue;
      for (const field of fields) {
        try {
          const existing = await this.client.call(`${base}.list`, {
            filter: { FIELD_NAME: field.FIELD_NAME },
          });
          const match = (existing.result ?? [])[0];
          if (match) {
            await this.client.call(`${base}.update`, { id: match.ID, fields: field });
            this.report.updated.push(`field [${entity}]: ${field.FIELD_NAME}`);
          } else {
            await this.client.call(`${base}.add`, { fields: field });
            this.report.created.push(`field [${entity}]: ${field.FIELD_NAME}`);
          }
        } catch (err) {
          this.report.failed.push(`field [${entity}]: ${field.FIELD_NAME} — ${err.message}`);
        }
      }
    }
  }

  async applyAutomations(automations, mappedAutomations) {
    const source = mappedAutomations || automations;
    for (const [key, rules] of Object.entries(source)) {
      for (const rule of rules) {
        try {
          await this.client.call('crm.automation.rule.add', { fields: rule });
          this.report.created.push(`automation: ${rule.NAME || key}`);
        } catch (err) {
          this.report.failed.push(`automation: ${rule.NAME || key} — ${err.message}`);
        }
      }
    }
  }

  async applyProductCatalog(catalog) {
    const { measures = [], price_types = [], sections = [], properties = [] } = catalog;

    for (const m of measures) {
      try {
        await this.client.call('catalog.measure.add', { fields: m });
        this.report.created.push(`measure: ${m.SYMBOL}`);
      } catch { this.report.skipped.push(`measure: ${m.SYMBOL}`); }
    }

    for (const pt of price_types) {
      try {
        await this.client.call('catalog.price.type.add', { fields: pt });
        this.report.created.push(`price_type: ${pt.NAME}`);
      } catch { this.report.skipped.push(`price_type: ${pt.NAME}`); }
    }

    for (const sec of sections) {
      try {
        await this.client.call('catalog.section.add', { fields: sec });
        this.report.created.push(`catalog_section: ${sec.NAME}`);
      } catch { this.report.skipped.push(`catalog_section: ${sec.NAME}`); }
    }

    for (const prop of properties) {
      try {
        await this.client.call('catalog.product.property.add', { fields: prop });
        this.report.created.push(`product_property: ${prop.NAME}`);
      } catch { this.report.skipped.push(`product_property: ${prop.NAME}`); }
    }
  }
}
