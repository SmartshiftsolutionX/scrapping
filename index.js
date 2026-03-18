const axios = require("axios");
const fs = require("fs");

// Base configuration (without expired cookies)
const baseConfig = {
  headers: {
    accept: "*/*",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-US,en;q=0.9,fr;q=0.8,ar;q=0.7",
    "content-length": "0",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    origin: "https://www.mubawab.ma",
    priority: "u=0, i",
    referer:
      "https://www.mubawab.ma/cms/posting?t=1773842423808&tsf=1773842423808",
    "sec-ch-ua":
      '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
  },
};

// URLs for both endpoints
const saleUrl =
  "https://www.mubawab.ma/fr/ajax/common/select-all-property-from-transaction?transactionField=sale";
const rentUrl =
  "https://www.mubawab.ma/fr/ajax/common/select-all-property-from-transaction?transactionField=rent";
const vacationUrl =
  "https://www.mubawab.ma/fr/ajax/common/select-all-property-from-transaction?transactionField=vacational";

// Function to fetch fresh XSRF token from UUID endpoint
async function fetchXSRFToken(cookies) {
  try {
    console.log("Fetching fresh XSRF token...");
    const response = await axios.get("https://www.mubawab.ma/controller/uuid", {
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9,fr;q=0.8,ar;q=0.7",
        cookie: cookies,
        referer: "https://www.mubawab.ma/fr/cms/posting",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        "x-requested-with": "XMLHttpRequest",
      },
    });

    console.log("UUID response data:", response.data);
    console.log("UUID response headers:", response.headers);

    // First check if the token is in the response body (as plain text)
    if (response.data && typeof response.data === "string") {
      // Check if the response data itself is the token
      if (response.data.startsWith("eyJ") && response.data.includes(".")) {
        console.log("XSRF token found in response body");
        return response.data;
      }

      // Check if the response body contains the token in a specific format
      const bodyTokenMatch = response.data.match(/XSRF-TOKEN[:=]\s*([^\s\n]+)/);
      if (bodyTokenMatch) {
        console.log("XSRF token found in response body (parsed)");
        return decodeURIComponent(bodyTokenMatch[1]);
      }
    }

    // Then check if the token is in the response headers (as cookies)
    const setCookieHeaders = response.headers["set-cookie"] || [];
    const xsrfCookie = setCookieHeaders.find((cookie) =>
      cookie.startsWith("XSRF-TOKEN="),
    );

    if (xsrfCookie) {
      const xsrfToken = xsrfCookie.split("XSRF-TOKEN=")[1].split(";")[0];
      console.log("Fresh XSRF token obtained from cookies");
      return decodeURIComponent(xsrfToken);
    }

    console.log("No XSRF token found in response body or headers");
    return null;
  } catch (error) {
    console.error("Error fetching XSRF token:", error.message);
    return null;
  }
}

// Function to parse HTML/XML response and convert to JSON
function parsePropertyResponse(responseData) {
  try {
    // Extract the content from the div with id="response"
    const divMatch = responseData.match(/<div id="response">(.*?)<\/div>/s);
    if (!divMatch) {
      return { error: "Could not find response div", raw: responseData };
    }

    const content = divMatch[1];

    // Split by the first bullet to separate transaction type from properties
    const parts = content.split("·");
    if (parts.length < 2) {
      return { error: "Invalid response format", raw: responseData };
    }

    const transactionType = parts[0].trim();
    const propertiesData = parts[1];

    // Parse each property entry
    const properties = propertiesData
      .split("|")
      .map((entry) => {
        const [code, name, count] = entry.split("^");
        return {
          code: code || "",
          name: name ? name.replace(/&amp;/g, "&") : "",
          count: parseInt(count) || 0,
        };
      })
      .filter((prop) => prop.code && prop.name);

    return {
      transactionType,
      properties,
      totalCount: properties.reduce((sum, prop) => sum + prop.count, 0),
    };
  } catch (error) {
    return { error: error.message, raw: responseData };
  }
}

// Function to parse État (condition) data from HTML response
function parseEtatData(responseData) {
  try {
    // Look for the conservation section
    const conservationMatch = responseData.match(
      /<div[^>]*conservation[^>]*>[\s\S]*?<\/div>/,
    );
    if (!conservationMatch) {
      return {
        error: "Could not find conservation section",
        raw: responseData,
      };
    }

    const conservationHtml = conservationMatch[0];

    // Extract the label (should be "État")
    const labelMatch = conservationHtml.match(
      /<label[^>]*class="[^"]*titLabel[^"]*"[^>]*>([^<]*)</,
    );
    const label = labelMatch ? labelMatch[1].trim() : "État";

    // Try multiple regex patterns to extract radio button options
    const options = [];

    // Pattern 1: Match the exact structure from the example
    const pattern1 = conservationHtml.match(
      /<label>\s*<input[^>]*type="radio"[^>]*value="([^"]*)"[^>]*\/>\s*([^<\s]*)\s*<\/label>/g,
    );

    if (pattern1) {
      pattern1.forEach((match) => {
        const valueMatch = match.match(/value="([^"]*)"/);
        const textMatch = match.match(/\/>\s*([^<\s]*)\s*<\/label>/);
        if (valueMatch && textMatch) {
          options.push({
            value: valueMatch[1],
            label: textMatch[1].trim(),
          });
        }
      });
    }

    // Pattern 2: More flexible matching - handle newlines and whitespace
    if (options.length === 0) {
      const pattern2 = conservationHtml.match(
        /<input[^>]*type="radio"[^>]*value="([^"]*)"[^>]*\/>\s*\n\s*([^<]+)/g,
      );

      if (pattern2) {
        pattern2.forEach((match) => {
          const valueMatch = match.match(/value="([^"]*)"/);
          const textMatch = match.match(/\/>\s*\n\s*([^<]+)/);
          if (valueMatch && textMatch) {
            options.push({
              value: valueMatch[1],
              label: textMatch[1].trim(),
            });
          }
        });
      }
    }

    // Pattern 3: Even more flexible - find all radio inputs and their following text
    if (options.length === 0) {
      const radioInputs = conservationHtml.match(
        /<input[^>]*type="radio"[^>]*value="([^"]*)"[^>]*\/>/g,
      );

      if (radioInputs) {
        radioInputs.forEach((radioInput, index) => {
          const valueMatch = radioInput.match(/value="([^"]*)"/);
          if (valueMatch) {
            // Look for text after this radio input
            const afterRadio = conservationHtml.split(radioInput)[1];
            const textMatch = afterRadio.match(/^\s*([^<\s]*)/);
            if (textMatch) {
              options.push({
                value: valueMatch[1],
                label: textMatch[1].trim(),
              });
            }
          }
        });
      }
    }

    // Find checked option
    const checkedMatch = conservationHtml.match(
      /<input[^>]*type="radio"[^>]*checked="checked"[^>]*value="([^"]*)"/,
    );
    const selectedValue = checkedMatch ? checkedMatch[1] : null;

    return {
      fieldName: "conservation",
      label: label,
      options: options,
      selectedValue: selectedValue,
      selectedOption:
        options.find((opt) => opt.value === selectedValue) || null,
    };
  } catch (error) {
    return { error: error.message, raw: responseData };
  }
}

// Function to fetch État data for all property types
async function fetchEtatDataForAllTypes(config, allPropertyTypes) {
  const featuresUrl =
    "https://www.mubawab.ma/fr/ajax/desktop/web/public/load-features";
  const etatResults = {};

  console.log("\n=== FETCHING ÉTAT DATA FOR ALL PROPERTY TYPES ===");

  for (const propertyType of allPropertyTypes) {
    try {
      console.log(
        `Fetching État data for: ${propertyType.code} (${propertyType.name})`,
      );

      // Build URL with the property type as adType
      const url = `${featuresUrl}?businessId=&adType=${propertyType.code}&surface=&utilSurface=&outsideSurface=&plotSurface=&price=&currency=&pricePeriod=&conservation=REFORM&numberOfFloors=&landTypes=&constructibility=&delivery=&landStatus=&pieces=&rooms=&baths=&pax=&minNights=&age=&floorType=&floorNumber=&garden=&gardenSurface=&terrace=&terraceSurface=&garage=&parkingPlaces=&elevator=&seaViews=&mountainsViews=&pool=&doorman=&storageRoom=&furnished=&moroccanLounge=&europeanLounge=&satellite=&fireplace=&airConditioning=&heating=&security=&doubleGlazing=&reinforcedDoor=&fullKitchen=&fridge=&oven=&tv=&washer=&microwave=&internet=&orientation=&exteriorFacade=&animals=&cellar=`;

      // Use the same token refresh logic as other requests
      const response = await makeRequestWithTokenRefresh(
        url,
        config,
        `État data for ${propertyType.name}`,
      );

      const etatData = parseEtatData(response.data);

      etatResults[propertyType.code] = etatData;
      console.log(
        `  ✓ ${propertyType.name}: ${etatData.options?.length || 0} options available`,
      );
    } catch (error) {
      console.error(
        `  ✗ Error fetching ${propertyType.code}: ${error.message}`,
      );
      etatResults[propertyType.code] = {
        error: error.message,
        code: propertyType.code,
        name: propertyType.name,
      };
    }
  }

  return etatResults;
}

// Function to update cookies from response headers
function updateCookies(existingConfig, responseHeaders) {
  const setCookieHeaders = responseHeaders["set-cookie"] || [];
  const existingCookies = existingConfig.headers.cookie || "";

  // Parse existing cookies into a map
  const cookieMap = {};
  if (existingCookies) {
    existingCookies.split("; ").forEach((cookie) => {
      const [name, value] = cookie.split("=");
      if (name && value) {
        cookieMap[name] = value;
      }
    });
  }

  // Update with new cookies from response
  setCookieHeaders.forEach((cookieHeader) => {
    const [cookiePair] = cookieHeader.split(";");
    const [name, value] = cookiePair.split("=");
    if (name && value) {
      cookieMap[name] = value;
    }
  });

  // Rebuild cookie string
  const newCookies = Object.entries(cookieMap)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

  const updatedConfig = { ...existingConfig };
  updatedConfig.headers = { ...updatedConfig.headers };
  updatedConfig.headers.cookie = newCookies;

  return updatedConfig;
}

// Helper function to make request with XSRF token refresh
async function makeRequestWithTokenRefresh(url, config, requestType) {
  try {
    // Log the request details before sending
    console.log(`\n=== ${requestType.toUpperCase()} REQUEST DETAILS ===`);
    console.log("URL:", url);
    console.log("Headers being sent:");
    Object.entries(config.headers).forEach(([key, value]) => {
      if (key === "cookie") {
        console.log(
          `  ${key}: [Cookie length: ${value ? value.length : 0} characters]`,
        );
        // Show XSRF token from cookie for verification
        const xsrfMatch = value.match(/XSRF-TOKEN=([^;]+)/);
        if (xsrfMatch) {
          console.log(
            `    XSRF-TOKEN in cookie: ${xsrfMatch[1].substring(0, 50)}...`,
          );
        }
      } else {
        console.log(`  ${key}: ${value}`);
      }
    });
    console.log("=== END REQUEST DETAILS ===\n");

    return await axios.post(url, {}, config);
  } catch (error) {
    if (
      error.response &&
      (error.response.status === 401 || error.response.status === 403)
    ) {
      console.log(
        `${error.response.status} error on ${requestType}, fetching fresh XSRF token...`,
      );

      // Fetch fresh XSRF token
      const freshToken = await fetchXSRFToken(config.headers.cookie);

      if (freshToken) {
        // Update cookies to include fresh XSRF token
        const currentCookies = config.headers.cookie;
        const updatedCookies = currentCookies.replace(
          /XSRF-TOKEN=[^;]*/,
          `XSRF-TOKEN=${encodeURIComponent(freshToken)}`,
        );

        // Update config with fresh token in both header and cookies
        const updatedConfig = {
          ...config,
          headers: {
            ...config.headers,
            "x-xsrf-token": freshToken,
            cookie: updatedCookies,
          },
        };

        console.log(
          `\n=== RETRY ${requestType.toUpperCase()} REQUEST DETAILS ===`,
        );
        console.log("URL:", url);
        console.log("Updated Headers being sent:");
        Object.entries(updatedConfig.headers).forEach(([key, value]) => {
          if (key === "cookie") {
            console.log(
              `  ${key}: [Cookie length: ${value ? value.length : 0} characters]`,
            );
            // Show XSRF token from cookie for verification
            const xsrfMatch = value.match(/XSRF-TOKEN=([^;]+)/);
            if (xsrfMatch) {
              console.log(
                `    XSRF-TOKEN in cookie: ${xsrfMatch[1].substring(0, 50)}...`,
              );
            }
          } else {
            console.log(`  ${key}: ${value}`);
          }
        });
        console.log("=== END RETRY REQUEST DETAILS ===\n");

        console.log(
          `Retrying ${requestType} with fresh token in both header and cookies...`,
        );
        return await axios.post(url, {}, updatedConfig);
      } else {
        console.log("Could not fetch fresh XSRF token");
      }
    }
    throw error;
  }
}

async function scrapeMubawab() {
  try {
    console.log("Starting scraping...\n");

    // Start with initial cookies (you'll need to update these)
    let config = {
      ...baseConfig,
      headers: {
        ...baseConfig.headers,
        cookie:
          "di=680da00a-71fd-49f3-a74b-03e9d6fafd1f; __ussess=6b6886b1-2fad-4a20-b8d4-42e44146cf75; __sourcc=NON_PAID%7C%7Chttps%3A%2F%2Fwww.mubawab.ma%2Ffr%2Fcms%2Fposting%3Ft%3D1773841688182; _gcl_au=1.1.1312520465.1773842427; _ga=GA1.1.132831566.1773842427; XSRF-TOKEN=eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJjc3JmVG9rZW4iLCJqdGkiOiJhMjk3MDc1ZC1iYWI4LTQxMzItOTIzZi02Zjk5Yzc2NDg0NjQiLCJleHAiOjE3NzM4NDM4NDF9.WWy04Z0G-vRWuQEhsCVH3M8bqfPLW14tBKomtCQdB2YUH9LG30mPxDYGHgFtT6SHmWNAxnT6UdZB8lMWmPhYvg; JSESSIONID=F3194AB7FA64E45B6D385DA7C1014C23; AWSALB=dRt1me0IQC+QfTmNbGDhtINO7HRsmayffpYJeZKD0bh2qM1lrQ6nnz3/Q6JZUZf657exzs/da6Rl9HYB/gkKAev8d1Y3hJnvf6oVP/3fDe95+c9jYEK8tuSWiJ3T; AWSALBCORS=dRt1me0IQC+QfTmNbGDhtINO7HRsmayffpYJeZKD0bh2qM1lrQ6nnz3/Q6JZUZf657exzs/da6Rl9HYB/gkKAev8d1Y3hJnvf6oVP/3fDe95+c9jYEK8tuSWiJ3T; _ga_MTHQFZL2DG=GS2.1.s1773842427$o1$g1$t1773843838$j59$l0$h0; remember-me=c2Ficmltb3VyYWQyMzglNDBnbWFpbC5jb206MzkyMTMyNzQ4NjY5NzpNRDU6MzExNWJjYjE2MTA5ODU1NzQ0ZDZhZjQxODRlZDRhYWQ",
      },
    };

    // First, try to get fresh cookies by visiting the main page
    console.log("Getting fresh cookies...");
    try {
      const mainPageResponse = await axios.get(
        "https://www.mubawab.ma/fr/cms/posting",
        {
          headers: {
            "user-agent": config.headers["user-agent"],
            accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "accept-language": config.headers["accept-language"],
          },
        },
      );

      // Update config with new cookies
      config = updateCookies(config, mainPageResponse.headers);
      console.log("Fresh cookies obtained");

      // Extract XSRF token from cookies if present
      const cookies = config.headers.cookie;
      const xsrfMatch = cookies.match(/XSRF-TOKEN=([^;]+)/);
      if (xsrfMatch) {
        config.headers["x-xsrf-token"] = decodeURIComponent(xsrfMatch[1]);
        console.log("XSRF token updated");
      }
    } catch (error) {
      console.log("Warning: Could not get fresh cookies, using existing ones");
    }

    // Scrape sale properties
    console.log("Fetching sale properties...");
    const saleResponse = await makeRequestWithTokenRefresh(
      saleUrl,
      config,
      "sale properties",
    );
    console.log("Sale properties fetched successfully");

    // Update cookies from sale response
    config = updateCookies(config, saleResponse.headers);

    // Scrape rent properties
    console.log("Fetching rent properties...");
    const rentResponse = await makeRequestWithTokenRefresh(
      rentUrl,
      config,
      "rent properties",
    );
    console.log("Rent properties fetched successfully");

    // Update cookies from rent response
    config = updateCookies(config, rentResponse.headers);

    // Scrape vacation properties
    console.log("Fetching vacation properties...");
    const vacationResponse = await makeRequestWithTokenRefresh(
      vacationUrl,
      config,
      "vacation properties",
    );
    console.log("Vacation properties fetched successfully\n");

    // Save responses to files
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    // Parse and save sale properties
    const parsedSaleData = parsePropertyResponse(saleResponse.data);
    fs.writeFileSync(
      `sale-properties-${timestamp}.json`,
      JSON.stringify(parsedSaleData, null, 2),
    );

    // Parse and save rent properties
    const parsedRentData = parsePropertyResponse(rentResponse.data);
    fs.writeFileSync(
      `rent-properties-${timestamp}.json`,
      JSON.stringify(parsedRentData, null, 2),
    );

    // Parse and save vacation properties
    const parsedVacationData = parsePropertyResponse(vacationResponse.data);
    fs.writeFileSync(
      `vacation-properties-${timestamp}.json`,
      JSON.stringify(parsedVacationData, null, 2),
    );

    // Also save raw responses for debugging
    fs.writeFileSync(`sale-raw-${timestamp}.html`, saleResponse.data);
    fs.writeFileSync(`rent-raw-${timestamp}.html`, rentResponse.data);
    fs.writeFileSync(`vacation-raw-${timestamp}.html`, vacationResponse.data);

    console.log("Results saved to files:");
    console.log(`- sale-properties-${timestamp}.json`);
    console.log(`- rent-properties-${timestamp}.json`);
    console.log(`- vacation-properties-${timestamp}.json`);
    console.log(`- sale-raw-${timestamp}.html (raw response)`);
    console.log(`- rent-raw-${timestamp}.html (raw response)`);
    console.log(`- vacation-raw-${timestamp}.html (raw response)\n`);

    // Display summary
    console.log("=== SUMMARY ===");
    console.log(
      `Sale transaction type: ${parsedSaleData.transactionType || "N/A"}`,
    );
    console.log(
      `Sale property types: ${parsedSaleData.properties?.length || 0}`,
    );
    console.log(`Sale total count: ${parsedSaleData.totalCount || 0}`);
    console.log(
      `Rent transaction type: ${parsedRentData.transactionType || "N/A"}`,
    );
    console.log(
      `Rent property types: ${parsedRentData.properties?.length || 0}`,
    );
    console.log(`Rent total count: ${parsedRentData.totalCount || 0}`);
    console.log(
      `Vacation transaction type: ${parsedVacationData.transactionType || "N/A"}`,
    );
    console.log(
      `Vacation property types: ${parsedVacationData.properties?.length || 0}`,
    );
    console.log(
      `Vacation total count: ${parsedVacationData.totalCount || 0}\n`,
    );

    // Show property details
    if (parsedSaleData.properties && parsedSaleData.properties.length > 0) {
      console.log("=== SALE PROPERTY TYPES ===");
      parsedSaleData.properties.forEach((prop) => {
        console.log(`- ${prop.name} (${prop.code}): ${prop.count}`);
      });
    }

    if (parsedRentData.properties && parsedRentData.properties.length > 0) {
      console.log("\n=== RENT PROPERTY TYPES ===");
      parsedRentData.properties.forEach((prop) => {
        console.log(`- ${prop.name} (${prop.code}): ${prop.count}`);
      });
    }

    if (
      parsedVacationData.properties &&
      parsedVacationData.properties.length > 0
    ) {
      console.log("\n=== VACATION PROPERTY TYPES ===");
      parsedVacationData.properties.forEach((prop) => {
        console.log(`- ${prop.name} (${prop.code}): ${prop.count}`);
      });
    }

    // Combine all property types from all endpoints
    const allPropertyTypes = [
      ...(parsedSaleData.properties || []),
      ...(parsedRentData.properties || []),
      ...(parsedVacationData.properties || []),
    ];

    // Fetch État data for all property types
    const etatData = await fetchEtatDataForAllTypes(config, allPropertyTypes);

    // Save État data
    fs.writeFileSync(
      `etat-data-${timestamp}.json`,
      JSON.stringify(etatData, null, 2),
    );

    console.log(`\nÉtat data saved to: etat-data-${timestamp}.json`);

    // Show État summary
    const successfulEtatFetches = Object.values(etatData).filter(
      (item) => !item.error,
    );
    const failedEtatFetches = Object.values(etatData).filter(
      (item) => item.error,
    );

    console.log(`\n=== ÉTAT DATA SUMMARY ===`);
    console.log(
      `Successfully fetched: ${successfulEtatFetches.length} property types`,
    );
    console.log(`Failed to fetch: ${failedEtatFetches.length} property types`);

    if (failedEtatFetches.length > 0) {
      console.log("\nFailed fetches:");
      failedEtatFetches.forEach((item) => {
        console.log(`- ${item.name} (${item.code}): ${item.error}`);
      });
    }

    // Show sample État options for first successful property type
    const firstSuccessful = successfulEtatFetches[0];
    if (firstSuccessful && firstSuccessful.options) {
      console.log(
        `\n=== SAMPLE ÉTAT OPTIONS (${firstSuccessful.selectedOption?.label || "N/A"}) ===`,
      );
      firstSuccessful.options.forEach((option) => {
        const isDefault =
          option.value === firstSuccessful.selectedValue ? " (default)" : "";
        console.log(`- ${option.label}${isDefault}`);
      });
    }
  } catch (error) {
    console.error("Error occurred during scraping:", error.message);

    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Status Text:", error.response.statusText);

      // Save error response for debugging
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      fs.writeFileSync(`error-response-${timestamp}.html`, error.response.data);
      console.log(`Error response saved to: error-response-${timestamp}.html`);

      // Check if we got new cookies even in error
      if (error.response.headers["set-cookie"]) {
        console.log(
          "New cookies received in error response - they might be expired",
        );
      }
    }
  }
}

// Function to help users get fresh cookies
function showCookieInstructions() {
  console.log("\n=== COOKIE UPDATE INSTRUCTIONS ===");
  console.log("If you get 403 errors, you need to update the cookies:");
  console.log("1. Open browser developer tools (F12)");
  console.log("2. Go to https://www.mubawab.ma/fr/cms/posting");
  console.log("3. Go to Network tab");
  console.log("4. Make a POST request to the property endpoints");
  console.log('5. Copy the "cookie" header from the request');
  console.log("6. Update the cookie value in the script");
  console.log("7. Also update the x-xsrf-token value\n");
}

// Run the scraper
if (require.main === module) {
  showCookieInstructions();
  scrapeMubawab();
}

module.exports = { scrapeMubawab, baseConfig, showCookieInstructions };
