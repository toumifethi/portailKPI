import { prisma } from '@/db/prisma';

/**
 * Lit une valeur de la table app_settings.
 * Retourne la valeur par defaut si la cle n'existe pas.
 */
export async function getAppSetting(key: string, defaultValue: string): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? defaultValue;
}

/**
 * Lit une valeur numerique de la table app_settings.
 */
export async function getAppSettingInt(key: string, defaultValue: number): Promise<number> {
  const raw = await getAppSetting(key, String(defaultValue));
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Lit une valeur booleenne de la table app_settings.
 */
export async function getAppSettingBool(key: string, defaultValue: boolean): Promise<boolean> {
  const raw = await getAppSetting(key, String(defaultValue));
  return raw === 'true' || raw === '1';
}

/**
 * Ecrit ou met a jour une valeur dans app_settings.
 */
export async function setAppSetting(key: string, value: string, description?: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value, ...(description !== undefined ? { description } : {}) },
    create: { key, value, description: description ?? null },
  });
}
