const PTERO_ACCEPT = 'Application/vnd.pterodactyl.v1+json';

export async function restartServer(env) {
  if (env.PTERODACTYL_RESTART_SCHEDULE_ID) {
    await executeSchedule(env, env.PTERODACTYL_RESTART_SCHEDULE_ID);
    return { mode: 'schedule' };
  }

  await sendPowerSignal(env, 'restart');
  return { mode: 'power' };
}

export async function sendPowerSignal(env, signal) {
  return panelRequest(env, `/api/client/servers/${panelServerId(env)}/power`, {
    method: 'POST',
    body: { signal }
  });
}

export async function executeSchedule(env, scheduleId) {
  return panelRequest(env, `/api/client/servers/${panelServerId(env)}/schedules/${scheduleId}/execute`, {
    method: 'POST'
  });
}

async function panelRequest(env, path, { method, body = null }) {
  const response = await fetch(`${panelBaseUrl(env)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${panelApiKey(env)}`,
      Accept: PTERO_ACCEPT,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : null
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`Panel API returned HTTP ${response.status}`);
    error.status = response.status;
    error.detail = detail.slice(0, 300);
    throw error;
  }

  return response.status === 204 || response.status === 202 ? null : response.json();
}

function panelBaseUrl(env) {
  const value = requiredEnv(env, 'PTERODACTYL_PANEL_URL');
  return value.replace(/\/+$/, '');
}

function panelApiKey(env) {
  return requiredEnv(env, 'PTERODACTYL_API_KEY').replace(/^Bearer\s+/i, '').trim();
}

function panelServerId(env) {
  return requiredEnv(env, 'PTERODACTYL_SERVER_ID');
}

function requiredEnv(env, name) {
  const value = env[name];
  if (!value || String(value).trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return String(value).trim();
}
