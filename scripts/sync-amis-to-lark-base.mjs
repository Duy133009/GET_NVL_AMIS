import fs from 'node:fs/promises';

const DEFAULTS = {
  MISA_APP_ID: 'b389320a-d4d5-4b61-a70a-36ff1d258df8',
  MISA_ORG_COMPANY_CODE: 'congtydemoketnoiact',
  MISA_DICTIONARY_TYPE: '2',
  MISA_SKIP: '0',
  MISA_TAKE: '1000',
  MISA_LAST_SYNC_TIME: '2000-01-25 14:15:02',
  LARK_CODE_FIELD: 'Mã_NVL',
  LARK_NAME_FIELD: 'Tên_NVL',
  LARK_PAGE_SIZE: '500',
  LARK_BATCH_DELAY_MS: '150',
};

const ENV = new Proxy(process.env, {
  get(target, prop) {
    if (typeof prop !== 'string') return undefined;
    const value = target[prop];
    if (value == null || value === '') {
      return DEFAULTS[prop];
    }
    return value;
  },
});

function requireEnv(name) {
  const value = ENV[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function parseJsonMaybe(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function httpJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} for ${url}\n${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}`,
    );
  }

  return body;
}

function unwrapMisaEnvelope(payload) {
  const firstPass = parseJsonMaybe(payload?.Data ?? payload?.data ?? payload);
  return parseJsonMaybe(firstPass);
}

function normalizeToArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function extractInventoryItems(rawPayload) {
  const unwrapped = unwrapMisaEnvelope(rawPayload);
  const dataArray = normalizeToArray(unwrapped?.Data ?? unwrapped?.data ?? unwrapped);
  const items = [];

  for (const entry of dataArray) {
    const parsedEntry = parseJsonMaybe(entry?.Data ?? entry?.data ?? entry);
    const normalizedEntry = parseJsonMaybe(parsedEntry);

    if (Array.isArray(normalizedEntry)) {
      for (const subEntry of normalizedEntry) {
        if (subEntry && typeof subEntry === 'object') items.push(subEntry);
      }
      continue;
    }

    if (normalizedEntry && typeof normalizedEntry === 'object') {
      items.push(normalizedEntry);
    }
  }

  return items
    .filter((item) => item && typeof item === 'object')
    .filter((item) => item.inventory_item_code);
}

async function getMisaAccessToken() {
  const payload = {
    app_id: requireEnv('MISA_APP_ID'),
    access_code: requireEnv('MISA_ACCESS_CODE'),
    org_company_code: requireEnv('MISA_ORG_COMPANY_CODE'),
  };

  const response = await httpJson('https://actapp.misa.vn/api/oauth/actopen/connect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = unwrapMisaEnvelope(response);
  const accessToken = data?.access_token ?? response?.access_token;

  if (!accessToken) {
    throw new Error(`Cannot read MISA access token from response: ${JSON.stringify(response, null, 2)}`);
  }

  return accessToken;
}

async function getMisaInventoryItems(misaAccessToken) {
  const payload = {
    data_type: Number(ENV.MISA_DICTIONARY_TYPE),
    branch_id: null,
    skip: Number(ENV.MISA_SKIP),
    take: Number(ENV.MISA_TAKE),
    app_id: requireEnv('MISA_APP_ID'),
    last_sync_time: ENV.MISA_LAST_SYNC_TIME,
  };

  const response = await httpJson('https://actapp.misa.vn/apir/sync/actopen/get_dictionary', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MISA-AccessToken': misaAccessToken,
    },
    body: JSON.stringify(payload),
  });

  return extractInventoryItems(response);
}

async function getLarkTenantAccessToken() {
  const payload = {
    app_id: requireEnv('LARK_APP_ID'),
    app_secret: requireEnv('LARK_APP_SECRET'),
  };

  const response = await httpJson('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const accessToken = response?.tenant_access_token;
  if (!accessToken) {
    throw new Error(`Cannot read Lark tenant_access_token from response: ${JSON.stringify(response, null, 2)}`);
  }

  return accessToken;
}

function fieldValueToString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item == null) return '';
        if (typeof item === 'string') return item;
        if (typeof item === 'number' || typeof item === 'boolean') return String(item);
        if (typeof item === 'object' && 'text' in item) return String(item.text ?? '');
        return '';
      })
      .join(' ')
      .trim();
  }

  if (typeof value === 'object') {
    if ('text' in value) return String(value.text ?? '').trim();
    if ('name' in value) return String(value.name ?? '').trim();
  }

  return '';
}

async function getExistingLarkCodes(tenantAccessToken) {
  const appToken = requireEnv('LARK_BASE_APP_TOKEN');
  const tableId = requireEnv('LARK_TABLE_ID');
  const codeField = ENV.LARK_CODE_FIELD;
  const pageSize = Number(ENV.LARK_PAGE_SIZE);

  const existingCodes = new Set();
  let pageToken = '';

  do {
    const url = new URL(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    );
    url.searchParams.set('page_size', String(pageSize));
    if (pageToken) url.searchParams.set('page_token', pageToken);

    const response = await httpJson(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tenantAccessToken}`,
      },
    });

    const items = response?.data?.items ?? [];
    for (const item of items) {
      const rawValue = item?.fields?.[codeField];
      const code = fieldValueToString(rawValue);
      if (code) existingCodes.add(code);
    }

    pageToken = response?.data?.has_more ? response?.data?.page_token ?? '' : '';
  } while (pageToken);

  return existingCodes;
}

function uniqueInventoryItems(items) {
  const byCode = new Map();

  for (const item of items) {
    const code = fieldValueToString(item.inventory_item_code);
    if (!code) continue;

    if (!byCode.has(code)) {
      byCode.set(code, {
        inventory_item_code: code,
        inventory_item_name: fieldValueToString(item.inventory_item_name),
      });
    }
  }

  return [...byCode.values()];
}

async function createLarkRecord(tenantAccessToken, item) {
  const appToken = requireEnv('LARK_BASE_APP_TOKEN');
  const tableId = requireEnv('LARK_TABLE_ID');
  const codeField = ENV.LARK_CODE_FIELD;
  const nameField = ENV.LARK_NAME_FIELD;

  const payload = {
    fields: {
      [codeField]: item.inventory_item_code,
      [nameField]: item.inventory_item_name || item.inventory_item_code,
    },
  };

  return httpJson(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantAccessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
    },
  );
}

async function appendSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  await fs.appendFile(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  console.log('Starting sync AMIS -> Lark Base');

  const misaAccessToken = await getMisaAccessToken();
  const amisItemsRaw = await getMisaInventoryItems(misaAccessToken);
  const amisItems = uniqueInventoryItems(amisItemsRaw);

  console.log(`Fetched ${amisItemsRaw.length} AMIS rows, ${amisItems.length} unique by inventory_item_code`);

  const larkTenantAccessToken = await getLarkTenantAccessToken();
  const existingCodes = await getExistingLarkCodes(larkTenantAccessToken);

  console.log(`Fetched ${existingCodes.size} existing codes from Lark Base`);

  const missingItems = amisItems.filter((item) => !existingCodes.has(item.inventory_item_code));

  console.log(`Need to create ${missingItems.length} new records`);

  let createdCount = 0;
  const failedCreates = [];
  const delayMs = Number(ENV.LARK_BATCH_DELAY_MS);

  for (const item of missingItems) {
    try {
      await createLarkRecord(larkTenantAccessToken, item);
      createdCount += 1;
      console.log(`Created ${item.inventory_item_code}`);
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failedCreates.push({
        code: item.inventory_item_code,
        message,
      });
      console.error(`Failed ${item.inventory_item_code}: ${message}`);
    }
  }

  const summaryLines = [
    '## AMIS -> Lark Base sync',
    `- AMIS unique items: ${amisItems.length}`,
    `- Existing Lark codes: ${existingCodes.size}`,
    `- Missing items: ${missingItems.length}`,
    `- Created: ${createdCount}`,
    `- Failed: ${failedCreates.length}`,
  ];

  if (failedCreates.length > 0) {
    summaryLines.push('', '### Failed codes');
    for (const failed of failedCreates.slice(0, 50)) {
      summaryLines.push(`- ${failed.code}: ${failed.message}`);
    }
  }

  await appendSummary(summaryLines);

  if (failedCreates.length > 0) {
    throw new Error(`Sync completed with ${failedCreates.length} failed record(s)`);
  }

  console.log('Sync completed successfully');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
