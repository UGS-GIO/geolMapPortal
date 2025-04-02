const functions = require("firebase-functions");
const admin = require("firebase-admin");
const mysql = require("mysql");
const util = require('util');
const cors = require('cors')({ origin: true });
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions/v2");
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

admin.initializeApp();

const secretClient = new SecretManagerServiceClient();

async function accessSecret(secretName) {
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/ut-dnr-ugs-geolmapportal-prod/secrets/${secretName}/versions/latest`,
  });
  return version.payload.data.toString('utf8');
}

// Add some logging to check the retrieved values (excluding password)
async function createPool() {
  const host = await accessSecret('DB_HOST');
  const user = await accessSecret('DB_USER');
  const password = await accessSecret('DB_PASSWORD');
  const database = await accessSecret('DB_NAME');

  return mysql.createPool({
    host,
    user,
    password,
    database,
    debug: true,
    connectionLimit: 10,
    connectTimeout: 20000,  // Increase timeout to 20 seconds
  });
}

let pool;

async function getPool() {
  if (!pool) {
    pool = await createPool();
    pool.query = util.promisify(pool.query);
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });
  }
  return pool;
}

async function connectToDatabase(retries = 3) {
  while (retries > 0) {
    try {
      const pool = await getPool();
      await pool.query('SELECT 1');
      console.log('Database connection successful');
      return pool;
    } catch (error) {
      console.error(`Database connection attempt failed. Retries left: ${retries - 1}`);
      retries--;
      if (retries === 0) throw error;
      await new Promise(res => setTimeout(res, 1000));
    }
  }
}

async function executeMainQuery(pool, sid) {
  const query = `
    SELECT series_id, pub_year, pub_name, quad_name, pub_author, pub_sec_author, pub_url, pub_scale, bookstore_url, pub_thumb, pub_publisher
    FROM UGSpubs
    WHERE series_id IN (?)
  `;
  return await pool.query(query, [sid]);
}

exports.getData = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const pool = await connectToDatabase();
      const sid = req.query.mapid || "'M-179','M-242','M-231','Q-2thru5'";
      const results = await executeMainQuery(pool, sid);

      const urls = results.map(row => ({
        series_id: row.series_id,
        pub_year: row.pub_year,
        pub_name: row.pub_name,
        quad_name: row.quad_name,
        pub_author: row.pub_author,
        pub_sec_author: row.pub_sec_author,
        pub_url: row.pub_url,
        pub_scale: row.pub_scale,
        bsurl: row.bookstore_url,
        pub_thumb: row.pub_thumb,
        pub_preview: row.pub_thumb,
        pub_publisher: row.pub_publisher
      }));

      // Fetch attached data for each publication
      await Promise.all(urls.map(async (url) => {
        const pkey = url.series_id;
        const query2 = `
          SELECT extra_data, pub_url
          FROM AttachedData
          WHERE series_id = ?
          AND (extra_data = 'GIS Data - Zip' OR extra_data = 'GeoTiff - Zip' OR extra_data = 'Lithologic Column' OR extra_data = 'Cross Section')
        `;
        const results2 = await pool.query(query2, [pkey]);

        results2.forEach(row2 => {
          if (row2.extra_data === "GIS Data - Zip") {
            url.gis_data = row2.pub_url;
          } else if (row2.extra_data === "Lithologic Column") {
            url.lith_col = row2.pub_url;
          } else if (row2.extra_data === "Cross Section") {
            url.x_section = row2.pub_url;
          } else if (row2.extra_data === "GeoTiff - Zip") {
            url.geotiff = row2.pub_url;
          }
        });
      }));

      return res.status(200).json(urls); // Return the results to the client
    } catch (error) {
      console.error("Error processing request:", error);
      console.error("Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      return res.status(500).send("Internal Server Error");
    }
  });
});


exports.getArcGISToken = onCall({
  region: "us-central1",
  maxInstances: 10,
  cors: [
    "https://ut-dnr-ugs-geolmapportal-prod.web.app",
    "https://ut-dnr-ugs-geolmapportal-prod.firebaseapp.com",
    "https://geomap.geology.utah.gov",
    "https://ut-dnr-ugs-geolmapportal-dev.web.app",
    "https://ut-dnr-ugs-geolmapportal-dev.firebaseapp.com"
  ]
}, async (request) => {
  try {
    // Get credentials from Secret Manager
    const [usernameVersion] = await secretClient.accessSecretVersion({
      name: 'projects/ut-dnr-ugs-geolmapportal-prod/secrets/geolmap_user/versions/latest'
    });
    const username = usernameVersion.payload.data.toString();

    const [passwordVersion] = await secretClient.accessSecretVersion({
      name: 'projects/ut-dnr-ugs-geolmapportal-prod/secrets/geolmap_pass/versions/latest'
    });
    const password = passwordVersion.payload.data.toString();

    // Generate token for ArcGIS
    const tokenUrl = 'https://webmaps.geology.utah.gov/arcgis/tokens/generateToken';
    const params = new URLSearchParams({
      username: username,
      password: password,
      client: 'referer',
      referer: 'https://geomap.geology.utah.gov',
      expiration: 60,
      f: 'json'
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    });

    const responseText = await response.text();
    let tokenData;

    try {
      tokenData = JSON.parse(responseText);
    } catch (parseError) {
      logger.error('Failed to parse ArcGIS response:', responseText);
      throw new HttpsError('internal', 'Invalid response from ArcGIS service');
    }

    if (!tokenData.token) {
      logger.error('No token in response:', tokenData);
      throw new HttpsError('internal', 'Failed to get ArcGIS token');
    }

    // Only return necessary data
    return {
      token: tokenData.token,
      expires: tokenData.expires
    };

  } catch (error) {
    logger.error('Error in getArcGISTokenR:', error);
    throw new HttpsError('internal', 'Internal server error');
  }
});