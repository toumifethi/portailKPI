import { prisma } from '@/db/prisma';
import { JiraClient } from '../jiraClient';
import { logger } from '@/utils/logger';

/**
 * Types de champs JIRA qui ont des options (valeurs possibles).
 * Pour ces types, on fetch les options via l'API context/option.
 */
const OPTION_FIELD_TYPES = new Set([
  'com.atlassian.jira.plugin.system.customfieldtypes:select',
  'com.atlassian.jira.plugin.system.customfieldtypes:multiselect',
  'com.atlassian.jira.plugin.system.customfieldtypes:radiobuttons',
  'com.atlassian.jira.plugin.system.customfieldtypes:multicheckboxes',
  'com.atlassian.jira.plugin.system.customfieldtypes:cascadingselect',
  'com.pyxis.greenhopper.jira:gh-epic-label', // Catégorie Epic
]);

/** Mapping schema.custom → fieldType simplifié pour l'UI */
function resolveFieldType(schema?: { type: string; custom?: string; items?: string }): string {
  if (!schema) return 'string';

  const custom = schema.custom ?? '';

  if (OPTION_FIELD_TYPES.has(custom)) {
    return schema.type === 'array' ? 'array:option' : 'option';
  }

  switch (schema.type) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'date': return 'date';
    case 'datetime': return 'datetime';
    case 'user': return 'user';
    case 'array':
      if (schema.items === 'string') return 'array:string';
      if (schema.items === 'version') return 'version';
      if (custom.includes('sprint')) return 'sprint';
      return 'array';
    case 'option': return 'option';
    default:
      if (custom.includes('sprint')) return 'sprint';
      if (custom.includes('date')) return 'date';
      return schema.type || 'string';
  }
}

/**
 * Phase : synchronise les champs custom JIRA → tables jira_custom_fields + jira_custom_field_options.
 * Appelée au début de l'import, avant syncIssues.
 */
export async function syncCustomFields(
  jiraClient: JiraClient,
  jiraConnectionId: number,
): Promise<{ fieldsSync: number; optionsSync: number }> {
  logger.info('syncCustomFields: starting', { jiraConnectionId });

  // 1. Récupérer tous les champs de l'instance JIRA
  const allFields = await jiraClient.getAllFields();

  // Filtrer : ne garder que les champs custom
  const customFields = allFields.filter((f) => f.custom);

  let fieldsSync = 0;
  let optionsSync = 0;

  for (const field of customFields) {
    const fieldType = resolveFieldType(field.schema);
    const schemaType = field.schema?.custom ?? null;

    // Upsert le champ custom
    const dbField = await prisma.jiraCustomField.upsert({
      where: {
        jiraFieldId_jiraConnectionId: {
          jiraFieldId: field.id,
          jiraConnectionId,
        },
      },
      create: {
        jiraFieldId: field.id,
        jiraConnectionId,
        name: field.name,
        fieldType,
        schemaType,
        isActive: true,
        lastSyncAt: new Date(),
      },
      update: {
        name: field.name,
        fieldType,
        schemaType,
        isActive: true,
        lastSyncAt: new Date(),
      },
    });

    fieldsSync++;

    // 2. Pour les champs de type option : récupérer les valeurs possibles
    if (fieldType === 'option' || fieldType === 'array:option') {
      try {
        const options = await fetchFieldOptions(jiraClient, field.id);

        for (let pos = 0; pos < options.length; pos++) {
          const opt = options[pos];
          await prisma.jiraCustomFieldOption.upsert({
            where: {
              customFieldId_jiraOptionId: {
                customFieldId: dbField.id,
                jiraOptionId: String(opt.id),
              },
            },
            create: {
              customFieldId: dbField.id,
              jiraOptionId: String(opt.id),
              value: opt.value ?? opt.name ?? String(opt.id),
              isActive: !opt.disabled,
              position: pos,
            },
            update: {
              value: opt.value ?? opt.name ?? String(opt.id),
              isActive: !opt.disabled,
              position: pos,
            },
          });
          optionsSync++;
        }
      } catch (err) {
        // Certains champs ne supportent pas l'API context/option (ex: Epic Link)
        logger.debug('syncCustomFields: could not fetch options for field', {
          fieldId: field.id,
          fieldName: field.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Marquer les champs supprimés côté JIRA comme inactifs
  const activeFieldIds = customFields.map((f) => f.id);
  await prisma.jiraCustomField.updateMany({
    where: {
      jiraConnectionId,
      jiraFieldId: { notIn: activeFieldIds },
      isActive: true,
    },
    data: { isActive: false },
  });

  logger.info('syncCustomFields: completed', { jiraConnectionId, fieldsSync, optionsSync });
  return { fieldsSync, optionsSync };
}

/**
 * Récupère les options d'un champ custom via l'API JIRA contexts + options.
 */
async function fetchFieldOptions(
  jiraClient: JiraClient,
  fieldId: string,
): Promise<Array<{ id: string; value?: string; name?: string; disabled?: boolean }>> {
  // Stratégie 1 : API /field/{fieldId}/context/{contextId}/option (JIRA Cloud)
  try {
    const contexts = await jiraClient.get<{ values: Array<{ id: string }> }>(`/field/${fieldId}/context`);
    const allOptions: Array<{ id: string; value?: string; name?: string; disabled?: boolean }> = [];

    for (const ctx of (contexts.values ?? []).slice(0, 3)) { // Max 3 contextes
      try {
        const opts = await jiraClient.get<{ values: Array<{ id: string; value?: string; disabled?: boolean }> }>(
          `/field/${fieldId}/context/${ctx.id}/option`,
        );
        for (const opt of opts.values ?? []) {
          if (!allOptions.find((o) => o.id === opt.id)) {
            allOptions.push(opt);
          }
        }
      } catch {
        // Contexte sans options
      }
    }

    if (allOptions.length > 0) return allOptions;
  } catch {
    // API context non supportée pour ce champ
  }

  // Stratégie 2 : lire les allowedValues depuis la réponse /field
  // (certains champs les incluent directement)
  return [];
}
