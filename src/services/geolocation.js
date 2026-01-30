import axios from 'axios';
import pool from '../config/database.js';

/**
 * Fetch location from IP address and cache it in the database
 * Uses ip-api.com free tier API
 */
export const fetchAndStoreLocationFromIP = async (userId, ipAddress) => {
  try {
    // Skip if no IP address provided
    if (!ipAddress || ipAddress === 'localhost' || ipAddress === '127.0.0.1' || ipAddress === '::1') {
      console.log(`Skipping geolocation for localhost IP: ${ipAddress}`);
      return null;
    }

    // Call geolocation API
    const response = await axios.get(`http://ip-api.com/json/${ipAddress}?fields=status,city,state,country,countryCode`, {
      timeout: 5000
    });

    if (response.data.status === 'success') {
      const { city, state, country, countryCode } = response.data;
      
      // Format location as "City, State, Country" or fallback
      const locationString = city && state ? `${city}, ${state}, ${country}` : 
                            city ? `${city}, ${country}` :
                            country || 'Nigeria';

      // Update user record with geolocation data
      const connection = await pool.getConnection();
      try {
        await connection.query(
          `UPDATE users 
           SET location = ?, current_state = ?, current_country = ?, ip_address = ?
           WHERE id = ?`,
          [locationString, state || city || country, country, ipAddress, userId]
        );
        console.log(`Updated location for user ${userId}: ${locationString}`);
        return {
          location: locationString,
          state: state || city || country,
          country: country,
          ip_address: ipAddress
        };
      } finally {
        connection.release();
      }
    } else {
      console.warn(`Geolocation API failed for IP ${ipAddress}: ${response.data.message}`);
      return null;
    }
  } catch (error) {
    // If geolocation fails, don't throw - just log and continue
    console.warn(`Error fetching geolocation for IP ${ipAddress}:`, error.message);
    return null;
  }
};

/**
 * Get developer location - use existing or fetch from IP if null
 */
export const getDeveloperLocation = async (developer, connection, userIpAddress) => {
  // If location already exists, return it
  if (developer.location && developer.location !== 'Nigeria') {
    return {
      location: developer.location,
      state: developer.current_state || null,
      country: developer.current_country || null
    };
  }

  // If location is null/missing but we have an IP address, fetch it
  if (developer.ip_address || userIpAddress) {
    const ipToUse = developer.ip_address || userIpAddress;
    
    try {
      const response = await axios.get(`http://ip-api.com/json/${ipToUse}?fields=status,city,state,country,countryCode`, {
        timeout: 5000
      });

      if (response.data.status === 'success') {
        const { city, state, country } = response.data;
        const locationString = city && state ? `${city}, ${state}, ${country}` : 
                              city ? `${city}, ${country}` :
                              country || 'Nigeria';

        // Update user record asynchronously without blocking response
        setImmediate(async () => {
          try {
            const conn = await pool.getConnection();
            try {
              await conn.query(
                `UPDATE users 
                 SET location = ?, current_state = ?, current_country = ?, ip_address = ?
                 WHERE id = ?`,
                [locationString, state || city || country, country, ipToUse, developer.id]
              );
              console.log(`Updated location for user ${developer.id}: ${locationString}`);
            } finally {
              conn.release();
            }
          } catch (err) {
            console.error(`Failed to update location for user ${developer.id}:`, err.message);
          }
        });

        return {
          location: locationString,
          state: state || city || country,
          country: country
        };
      }
    } catch (error) {
      console.warn(`Error fetching geolocation for IP ${ipToUse}:`, error.message);
    }
  }

  // Fallback to default
  return {
    location: 'Nigeria',
    state: null,
    country: 'Nigeria'
  };
};
