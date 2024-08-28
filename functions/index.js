const functions = require("firebase-functions");
const admin = require("firebase-admin");
const mysql = require("mysql");
const util = require('util');
const cors = require('cors')({ origin: true });

admin.initializeApp();

const pool = mysql.createPool({
  host: '165.239.146.182',
  user: 'weblogs',
  password: 'mysql31415',
  database: 'publications',
  debug: true,
  connectionLimit: 10,
});

pool.query = util.promisify(pool.query);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

async function connectToDatabase(retries = 3) {
  while (retries > 0) {
    try {
      await pool.query('SELECT 1'); // Test the connection
      console.log('Database connection successful');
      return pool;
    } catch (error) {
      console.error(`Database connection attempt failed. Retries left: ${retries - 1}`);
      retries--;
      if (retries === 0) throw error;
      await new Promise(res => setTimeout(res, 1000)); // Wait for 1 second before retrying
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
