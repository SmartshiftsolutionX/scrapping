# Mubawab.ma Property Scraper

This script scrapes property data from Mubawab.ma for both sale and rent listings.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run the scraper:
```bash
node index.js
```

## Features

- Scrapes both sale and rent property listings
- Uses exact browser headers and request configuration
- Automatically attempts to refresh cookies
- Saves results to timestamped JSON files
- Provides detailed error handling and debugging

## Cookie Management

The script requires valid session cookies to work. If you encounter 403 errors:

1. Open your browser and go to https://www.mubawab.ma/fr/cms/posting
2. Open Developer Tools (F12)
3. Go to the Network tab
4. Trigger the property request on the website
5. Find the POST request to `/fr/ajax/common/select-all-property-from-transaction`
6. Copy the `cookie` header value
7. Update the cookie value in line 51 of `index.js`
8. Also update the `x-xsrf-token` value if it has changed

## Output Files

- `sale-properties-{timestamp}.json` - Contains sale property data
- `rent-properties-{timestamp}.json` - Contains rent property data
- `error-response-{timestamp}.html` - Error responses for debugging (if any)

## Request Configuration

The script replicates the exact browser request:
- **Method**: POST
- **Content-Type**: application/x-www-form-urlencoded; charset=UTF-8
- **Headers**: All browser headers including user-agent, accept, etc.
- **Cookies**: Session cookies for authentication
- **XSRF Token**: CSRF protection token

## URLs

- Sale endpoint: `https://www.mubawab.ma/fr/ajax/common/select-all-property-from-transaction?transactionField=sale`
- Rent endpoint: `https://www.mubawab.ma/fr/ajax/common/select-all-property-from-transaction?transactionField=rent`

## Troubleshooting

1. **403 Forbidden Error**: Update cookies as described above
2. **Network Issues**: Check your internet connection
3. **Rate Limiting**: Wait before making multiple requests
4. **Session Expired**: Clear browser cache and get fresh cookies

## Dependencies

- `axios`: HTTP client for making requests
- `fs`: Node.js file system module (built-in)

## Notes

- Cookies expire and need to be updated periodically
- The script attempts to automatically refresh cookies by visiting the main page
- All requests are made with the same headers as a real browser
- Results are saved in pretty-printed JSON format
