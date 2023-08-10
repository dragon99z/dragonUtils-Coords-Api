# dragonUtils-Coords-Api

This is a sample API server that allows saving and retrieving coordinates and locations
for different server IDs. The data is stored in a JSON file.

## Installation

To install the server, run the following command:

```
git clone https://github.com/dragon99z/dragonUtils-Coords-Api.git
npm install
```

## Usage

To start the server, run the following command:

```
node index.js
```

The server will be running on port 3000.

## API Reference

The following is a reference for the API endpoints:

* **POST /api/save**

Saves the coordinates, location, and user ID for a given server ID.

Request Body:

```
{
  serverId: string,
  coordinates: string,
  location: string,
  userId: string
}
```

Response Body:

```
{
  success: boolean
}
```

* **POST /api/remove**

Removes a user ID from a given server ID.

Request Body:

```
{
  serverId: string,
  userId: string
}
```

Response Body:

```
{
  success: boolean,
  message?: string
}
```

* **GET /api/coordinates/:serverId**

Retrieves all coordinates and locations for a given server ID.

Request Params:

```
{
  serverId: string
}
```

Response Body:

```
{
  success: boolean,
  coordinates?: Array<{ coordinates: string, location: string }>
  message?: string
}
```

## Contributing

Contributions are welcome! Please submit a pull request on GitHub.