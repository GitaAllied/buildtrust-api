import superagent from 'superagent';

/**
 * Lookup geolocation for an IP using ip-api.com (fallback to ipapi.co)
 * Returns { ip, state, country } or null on failure
 */
export async function lookupIp(ip) {
  try {
    if (!ip) {
      console.log('[ipGeo] No IP provided, returning null');
      return null;
    }

    // If ip looks like IPv6 local (::1) or localhost, return null
    if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
      console.log('[ipGeo] Local/private IP detected, skipping geo lookup:', ip);
      return null;
    }

    // Try ip-api.com first (more reliable free tier)
    try {
      console.log('[ipGeo] Calling ip-api.com for', ip);
      const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=query,region,country`;
      const res = await superagent.get(url).timeout({ response: 5000, deadline: 10000 });
      const data = res.body || {};

      console.log('[ipGeo] Raw response from ip-api.com:', JSON.stringify(data));

      if (data.status === 'fail') {
        throw new Error('ip-api.com returned status=fail: ' + (data.message || 'unknown'));
      }

      const result = {
        ip: data.query || ip,
        state: data.region ? String(data.region).trim() : null,
        country: data.country ? String(data.country).trim() : null
      };

      console.log('[ipGeo] Parsed result from ip-api.com:', JSON.stringify(result));
      return result;
    } catch (primaryErr) {
      console.warn('[ipGeo] ip-api.com failed:', primaryErr.message, '- Trying ipapi.co as fallback');

      // Fallback to ipapi.co
      try {
        const url = `https://ipapi.co/${encodeURIComponent(ip)}/json/`;
        console.log('[ipGeo] Calling ipapi.co for', ip);
        const res = await superagent.get(url).timeout({ response: 5000, deadline: 10000 });
        const data = res.body || {};

        console.log('[ipGeo] Raw response from ipapi.co:', JSON.stringify(data));

        // Try multiple field name variations
        const state = data.region || data.region_code || data.state || data.subdivision || null;
        const country = data.country_name || data.country || data.country_code || null;

        const result = {
          ip: data.ip || ip,
          state: state ? String(state).trim() : null,
          country: country ? String(country).trim() : null
        };

        console.log('[ipGeo] Parsed result from ipapi.co:', JSON.stringify(result));
        return result;
      } catch (fallbackErr) {
        console.error('[ipGeo] Both services failed. Primary error:', primaryErr.message, 'Fallback error:', fallbackErr.message);
        return null;
      }
    }
  } catch (err) {
    console.error('[ipGeo] Unexpected error for', ip, '-', err.message);
    return null;
  }
}

export default { lookupIp };
