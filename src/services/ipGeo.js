import superagent from 'superagent';

/**
 * Lookup geolocation for an IP using ipapi.co
 * Returns { ip, state, country } or null on failure
 */
export async function lookupIp(ip) {
  try {
    if (!ip) return null;

    // If ip looks like IPv6 local (::1) or localhost, return null
    if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
      return null;
    }

    // ipapi.co supports /json and /{ip}/json
    const url = `https://ipapi.co/${encodeURIComponent(ip)}/json/`;
    const res = await superagent.get(url).timeout({ response: 5000, deadline: 10000 });
    const data = res.body || {};

    const state = data.region || data.region_code || null;
    const country = data.country_name || data.country || null;

    return {
      ip: data.ip || ip,
      state,
      country
    };
  } catch (err) {
    console.warn('[ipGeo] lookup failed for', ip, err.message);
    return null;
  }
}

export default { lookupIp };
