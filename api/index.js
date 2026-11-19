const connectDB = require('../src/config/db');
const app = require('../src/server');

let dbReady;

module.exports = async (req, res) => {
  if (!dbReady) {
    dbReady = connectDB().catch((error) => {
      dbReady = undefined;
      throw error;
    });
  }
  await dbReady;
  return app(req, res);
};
