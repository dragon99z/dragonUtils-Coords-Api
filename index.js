/**
 * This is a sample API server that allows saving and retrieving coordinates and locations
 * for different server IDs. The data is stored in a JSON file.
 */

const express = require('express');
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require('express-validator');
const helmet = require("helmet");
const fsp = require('fs').promises;
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const { createLogger, format } = winston;
const DailyRotateFile = require('winston-daily-rotate-file');

const configData = fs.readFileSync('config.json');
const config = JSON.parse(configData);


const logsPath = 'logs'; // Define the parent logs directory

const transport = new DailyRotateFile({
  dirname: logsPath,
  filename: '%DATE%/%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  utc: true,
  format: format.combine(format.timestamp(), format.json()),
});

const logger = createLogger({
  level: 'info',
  transports: [transport],
});

// Set the maximum number of requests per minute (change the values as needed)
const limiter = rateLimit({
  windowMs: config.rateLimit.delayInSeconds * 1000,
  max: config.rateLimit.maxRequestsPerSecond,
});

const apiKeyMiddleware = (req, res, next) => {
  body('Key').trim().isString()
  const apiKey = req.query.Key

  // Check if the API key is present and valid
  if (!apiKey || !config.apiKeys.includes(apiKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

const app = express();
app.use(express.json());

// Define the trust options for the 'trust proxy' setting
const trustOptions = ['loopback', 'linklocal', 'uniquelocal'];

// Enable 'trust proxy' with the custom trust options
app.set('trust proxy', trustOptions);

// Apply the rate limiter to all routes
app.use(limiter);
app.use(helmet());

// Apply the middleware to all routes
app.use(apiKeyMiddleware);

/**
 * GET /api/addLocation
 * Saves the coordinates, location, and user ID for a given server ID.
 * Request Body: {
 *   serverId: string,
 *   coordinates: string,
 *   location: string,
 *   userId: string
 * }
 * Response Body: {
 *   success: boolean
 * }
 */

app.get('/api/addLocation',[
  apiKeyMiddleware, // Add the apiKeyMiddleware here
  // Validate and sanitize the request body fields
  body('serverId').trim().isString(),
  body('coordinates').trim().isString(),
  body('location').trim().isString(),
  body('userId').trim().isString(),

  // Handle validation errors
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
], async (req, res) => {
  try {
    let { serverId, coordinates, location, userId } = req.query;
    let coords = JSON.parse(coordinates)

    // read existing data from JSON file
    let data = await fsp.readFile('data.json');
    let jsonData = JSON.parse(data);

    if (!jsonData[serverId]) {
      // server ID does not exist, create new object with data
      jsonData[serverId] = {
        locations: [],
        userIds: [],
      };
    }

    // check if the server ID already exists
    if (jsonData[serverId]) {
      let locationExists = false;

      // check if the location already exists for the server ID
      if (Array.isArray(jsonData[serverId])) {
        locationExists = jsonData[serverId].some(
          (item) => item.location === location
        );
      } else if (jsonData[serverId].locations){
        locationExists = jsonData[serverId].locations.some(
          (item) => item.location === location
        );
      }

      // add the user ID to the array if it's not already present
      if (Array.isArray(jsonData[serverId].userIds)) {
        if (!jsonData[serverId].userIds.includes(userId)) {
          jsonData[serverId].userIds.push(userId);
        }
      } else {
        jsonData[serverId].userIds = [userId];
      }

      // location does not exist, add it to the array
      if (Array.isArray(jsonData[serverId].locations)) {
        jsonData[serverId].locations.push({ coords, location, userId });
      } else {
        jsonData[serverId].locations = [{ coords, location, userId }];
      }
    } else {
      // server ID does not exist, create new object with data
      jsonData[serverId] = {
        locations: [{ coords, location, userId }],
        userIds: [userId],
      };
    }

    // write updated data to JSON file
    await fsp.writeFile('data.json', JSON.stringify(jsonData));
    logger.info('Request', { apiKey: req.query.Key, method: req.method, url: req.url });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save data' });
    logger.info('Request', { apiKey: req.query.Key, method: req.method, url: req.url });
  }
});

/**
 * GET /api/removeUser
 * Removes a user ID from a given server ID.
 * Request Body: {
 *   serverId: string,
 *   userId: string
 * }
 * Response Body: {
 *   success: boolean,
 *   message?: string
 * }
 */

app.get('/api/removeUser',[
  apiKeyMiddleware, // Add the apiKeyMiddleware here
  // Validate and sanitize the request body fields
  body('serverId').trim().isString(),
  body('userId').trim().isString(),

  // Handle validation errors
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
], async (req, res) => {
  try {
    let { serverId, userId } = req.query;
    // read existing data from JSON file
    let data = await fsp.readFile('data.json');
    let jsonData = JSON.parse(data);

    // check if the server ID exists
    if (jsonData[serverId]) {
      // check if the user ID exists in the userIds array
      if (Array.isArray(jsonData[serverId].userIds)) {
        const userIdIndex = jsonData[serverId].userIds.indexOf(userId);
        if (userIdIndex !== -1) {
          // remove the user ID from the array
          jsonData[serverId].userIds.splice(userIdIndex, 1);

          // check if the userIds array is empty
          if (jsonData[serverId].userIds.length === 0) {
            // delete the complete serverId
            delete jsonData[serverId];
          }

          // write updated data to JSON file
          await fsp.writeFile('data.json', JSON.stringify(jsonData));

          res.json({ success: true });
          logger.info('Request '+req.method+" "+req.url, { apiKey: req.query.Key, method: req.method, url: req.url });
          return;
        }
      }
    }

    // server ID or user ID not found
    res.json({ success: false, message: 'Server ID or User ID not found' });
    logger.info('Request '+req.method+" "+req.url, { apiKey: req.query.Key, method: req.method, url: req.url });
} catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove data' });
    logger.info('Error '+req.method+" "+req.url, { apiKey: req.query.Key, method: req.method, url: req.url });
  }
});

/**
 * GET /api/coordinates/:serverId
 * Retrieves all coordinates and locations for a given server ID.
 * Request Params: {
 *   serverId: string
 * }
 * Response Body: {
 *   success: boolean,
 *   coordinates?: Array<{ coordinates: string, location: string }>
 *   message?: string
 * }
 */

app.get('/api/coordinates',[
  apiKeyMiddleware, // Add the apiKeyMiddleware here
  // Validate and sanitize the request body fields
  body('serverId').trim().isString(),

  // Handle validation errors
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
], async (req, res) => {
  try {
    let { serverId } = req.query;

    // read existing data from JSON file
    let data = await fsp.readFile('data.json');
    let jsonData = JSON.parse(data);

    // check if the server ID exists
    if (jsonData[serverId]) {
      let coordinates = [];

      // check if the server ID has multiple locations
      if (Array.isArray(jsonData[serverId].locations)) {
        coordinates = jsonData[serverId].locations.map(
          ({ coords, location }) => ({ coords, location })
        );
      } else if (jsonData[serverId] && jsonData[serverId].userIds) {
        coordinates = jsonData[serverId].userIds.map((userId) => ({
          coords: null,
          location: null,
          userId,
        }));
      }

      res.json({ success: true, coordinates });
    } else {
      // server ID not found
      res.json({ success: false, message: 'Server ID not found' });
    }
    logger.info('Request '+req.method+" "+req.url, { apiKey: req.query.Key, method: req.method, url: req.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve data' });
    logger.info('Error '+req.method+" "+req.url, { apiKey: req.query.Key, method: req.method, url: req.url });
  }
});

app.get('/api/addUser',[
  apiKeyMiddleware, // Add the apiKeyMiddleware here
  // Validate and sanitize the request body fields
  body('serverId').trim().isString(),
  body('userId').trim().isString(),

  // Handle validation errors
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
], async (req, res) => {
  try {
    let { serverId, userId } = req.query;
    // read existing data from JSON file
    let data = await fsp.readFile('data.json');
    let jsonData = JSON.parse(data);

    // check if the server ID exists
    if (jsonData[serverId]) {
      // check if the user ID exists in the userIds array
      if (Array.isArray(jsonData[serverId].userIds)) {
        const userIdIndex = jsonData[serverId].userIds.indexOf(userId);
        if (userIdIndex === -1) {
          // add the user ID to the array
          jsonData[serverId].userIds.push(userId);
        }
      }
    }else{
      jsonData[serverId] = {
        userIds: [userId],
      };
    }
    // write updated data to JSON file
    await fsp.writeFile('data.json', JSON.stringify(jsonData));
    res.json({ success: true });
    logger.info('Request '+req.method+" "+req.url, { apiKey: req.query.Key, method: req.method, url: req.url });
    return;
} catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove data' });
    logger.info('Error '+req.method+" "+req.url, { apiKey: req.query.Key, method: req.method, url: req.url });
  }
});

app.get('/api/removeLocation',[
  apiKeyMiddleware, // Add the apiKeyMiddleware here
  // Validate and sanitize the request body fields
  body('serverId').trim().isString(),
  body('userId').trim().isString(),
  body('location').trim().isString(),

  // Handle validation errors
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
], async (req, res) => {
  try {
    let { serverId, userId, location } = req.query;
    // read existing data from JSON file
    let data = await fsp.readFile('data.json');
    let jsonData = JSON.parse(data);

    // check if the server ID exists
    if (jsonData[serverId]) {
      // check if the user ID exists in the userIds array
      if (Array.isArray(jsonData[serverId].userIds)) {
        const userIdIndex = jsonData[serverId].userIds.indexOf(userId);
        if (userIdIndex !== -1) {
          // remove the location and coordinates
          let locationIndex = -1;
          if (Array.isArray(jsonData[serverId].locations)) {
            locationIndex = jsonData[serverId].locations.findIndex(
              (item) => item.location === location
            );
          }

          if (locationIndex !== -1) {
            // remove the location from the array
            jsonData[serverId].locations.splice(locationIndex, 1);

            // check if the locations array is empty
            if (jsonData[serverId].locations.length === 0) {
              // delete the complete serverId
              delete jsonData[serverId];
            }

            // write updated data to JSON file
            await fsp.writeFile('data.json', JSON.stringify(jsonData));

            res.json({ success: true });
            return;
          }
        }
      }
    }

    // server ID, user ID, location, or coordinates not found
    console.log('Server ID, User ID, Location, or Coordinates not found');
    return;
} catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove data' });
    logger.info('Error '+req.method+" "+req.url, { apiKey: req.query.Key, method: req.method, url: req.url });
  }
});

/**
 * Start the server on the specified port.
 */

app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`);
});
