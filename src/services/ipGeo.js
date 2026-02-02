import superagent from 'superagent';

/**
 * Lookup geolocation for an IP using ip-api.com (fallback to ipapi.co)
 * Returns { ip, state, country } or null on failure
 */
export async function lookupIp(ip) {
  try {
    if (!ip) {
      console.info('[ipGeo] No IP provided, returning null');
      return null;
    }

    // If ip looks like IPv6 local (::1) or localhost, return null
    if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
      console.info('[ipGeo] Local/private IP detected, skipping geo lookup');
      return null;
    }

    // Try ip-api.com first (more reliable free tier)
    try {
      console.info('[ipGeo] Calling ip-api.com');
      const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=query,region,country`;
      const res = await superagent.get(url).timeout({ response: 5000, deadline: 10000 });
      const data = res.body || {};

      // Do not log raw response to avoid leaking details

      if (data.status === 'fail') {
        throw new Error('ip-api.com returned status=fail: ' + (data.message || 'unknown'));
      }

      const result = {
        ip: data.query || ip,
        state: data.region ? String(data.region).trim() : null,
        country: data.country ? String(data.country).trim() : null
      };

      console.info('[ipGeo] Parsed result from ip-api.com');
      return result;
    } catch (primaryErr) {
      console.warn('[ipGeo] ip-api.com failed, trying fallback');

      // Fallback to ipapi.co
      try {
        const url = `https://ipapi.co/${encodeURIComponent(ip)}/json/`;
        console.info('[ipGeo] Calling ipapi.co fallback');
        const res = await superagent.get(url).timeout({ response: 5000, deadline: 10000 });
        const data = res.body || {};
        // Do not log raw response from fallback

        // Try multiple field name variations
        const state = data.region || data.region_code || data.state || data.subdivision || null;
        const country = data.country_name || data.country || data.country_code || null;

        const result = {
          ip: data.ip || ip,
          state: state ? String(state).trim() : null,
          country: country ? String(country).trim() : null
        };

        console.info('[ipGeo] Parsed result from ipapi.co');
        return result;
      } catch (fallbackErr) {
        console.error('[ipGeo] Both services failed. Primary error:', primaryErr.message, 'Fallback error:', fallbackErr.message);
        return null;
      }
    }
  } catch (err) {
    console.error('[ipGeo] Unexpected error while looking up IP:', err.message);
    return null;
  }
}

export default { lookupIp };
