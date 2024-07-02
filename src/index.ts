import * as cheerio from "cheerio";
import axios from "axios";
import { promises as fs } from "fs";
import * as path from "path";
import { createObjectCsvWriter } from "csv-writer";

interface Mosque {
  description?: string;
  address?: string;
  url?: string;
  quickFacts: string[];
  governance: string[];
  prayerTimings: {
    fajr?: Date;
    snrs?: Date;
    dhur?: Date;
    asr?: Date;
    magh?: Date;
    isha?: Date;
  };
}

async function scrape(): Promise<Mosque[]> {
  const DOMAIN = "https://www.salatomatic.com";
  const SUB = "/sub/United-States/Alabama/Birmingham/AvcK8i3L3C";
  const mosques: Mosque[] = [];

  try {
    const birminghamSubURL = `${DOMAIN}${SUB}`;
    const { data } = await axios.get(birminghamSubURL);
    const $ = cheerio.load(data);

    const mosqueURLs: string[] = [];

    // retrieve all the individual mosque urls
    const $divs = $(".titleBS");
    $divs.each((index, div) => {
      const $links = $(div).find("a");
      $links.each((i, link) => {
        const href = $(link).attr("href");
        mosqueURLs.push(`${DOMAIN}${href}`);
      });
    });

    // scrape each mosque url
    for (const url of mosqueURLs) {
      let mosque: Mosque = {
        url: url,
        quickFacts: [],
        governance: [],
        prayerTimings: {},
      };

      try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        const $divs = $(".bodyLink");
        mosque.address = cleanText($divs.eq(0).text());
        mosque.description = cleanText($divs.eq(1).text());

        const $tbodies = $("tbody");

        // retrieve quick facts
        const $tbodyQuickFacts = $tbodies.eq(212);
        const $tbodyQuickFactsDivs = $tbodyQuickFacts.find("div");
        $tbodyQuickFactsDivs.each((index, element) => {
          mosque.quickFacts?.push(cleanText($(element).text()));
        });

        // retrieve governance
        const $tbodyGovernance = $tbodies.eq(214);
        const $tbodyGovernanceDivs = $tbodyGovernance.find("div");
        $tbodyGovernanceDivs.each((index, element) => {
          mosque.governance?.push(cleanText($(element).text()));
        });

        // retrieve prayer timings
        const $microLinkDivs = $(".microLink");
        mosque.prayerTimings.fajr = convertToDate(
          cleanText($microLinkDivs.eq(0).text()),
        );
        mosque.prayerTimings.snrs = convertToDate(
          cleanText($microLinkDivs.eq(1).text()),
        );
        mosque.prayerTimings.dhur = convertToDate(
          cleanText($microLinkDivs.eq(2).text()),
        );
        mosque.prayerTimings.asr = convertToDate(
          cleanText($microLinkDivs.eq(3).text()),
        );
        mosque.prayerTimings.magh = convertToDate(
          cleanText($microLinkDivs.eq(4).text()),
        );
        mosque.prayerTimings.isha = convertToDate(
          cleanText($microLinkDivs.eq(5).text()),
        );
      } catch (error) {
        console.error(`Error fetching URL ${url}:`, error);
      }

      mosques.push(mosque);
    }
  } catch (error) {
    console.error("Error fetching the webpage:", error);
  }

  return mosques;
}

function cleanText(text: string): string {
  return text
    .replace(/\n/g, "") // Replace newlines with space
    .replace(/\t/g, "") // Replace tabs with space
    .replace(/\s\s+/g, "") // Replace multiple spaces with single space
    .trim(); // Trim leading and trailing spaces
}

function convertToDate(timeString: string): Date {
  // Regular expression to match the time and the time zone
  const timeRegex = /(\d{2}:\d{2})\s\((\w+)\)/;
  const match = timeString.match(timeRegex);

  if (!match) {
    throw new Error("Invalid time format");
  }

  const [, time, timeZoneAbbr] = match;
  const [hours, minutes] = time.split(":").map(Number);

  // Define a mapping of time zone abbreviations to offsets (in hours)
  const timeZoneOffsets: { [key: string]: number } = {
    UTC: 0,
    GMT: 0,
    EST: -5,
    EDT: -4,
    CST: -6,
    CDT: -5,
    MST: -7,
    MDT: -6,
    PST: -8,
    PDT: -7,
  };

  const offset = timeZoneOffsets[timeZoneAbbr];

  if (offset === undefined) {
    throw new Error("Unknown time zone abbreviation");
  }

  // Create a new Date object
  const date = new Date();
  date.setUTCHours(hours - offset, minutes, 0, 0);

  return date;
}

async function writeToFile(mosques: Mosque[]) {
  const filePath = path.resolve(__dirname, "mosques.json");
  try {
    await fs.writeFile(filePath, JSON.stringify(mosques, null, 2));
    console.log("Mosques data written to mosques.json");
  } catch (error) {
    console.error("Error writing to file:", error);
  }

  const csvFilePath = path.resolve(__dirname, "mosques.csv");
  const csvWriter = createObjectCsvWriter({
    path: csvFilePath,
    header: [
      { id: "url", title: "URL" },
      { id: "description", title: "Description" },
      { id: "address", title: "Address" },
      { id: "quickFacts", title: "Quick Facts" },
      { id: "governance", title: "Governance" },
      { id: "fajr", title: "Fajr" },
      { id: "snrs", title: "Sunrise" },
      { id: "dhur", title: "Dhur" },
      { id: "asr", title: "Asr" },
      { id: "magh", title: "Maghrib" },
      { id: "isha", title: "Isha" },
    ],
  });

  const records = mosques.map((mosque) => ({
    url: mosque.url,
    description: mosque.description,
    address: mosque.address,
    quickFacts: mosque.quickFacts.join(", "),
    governance: mosque.governance.join(", "),
    fajr: mosque.prayerTimings.fajr,
    snrs: mosque.prayerTimings.snrs,
    dhur: mosque.prayerTimings.dhur,
    asr: mosque.prayerTimings.asr,
    magh: mosque.prayerTimings.magh,
    isha: mosque.prayerTimings.isha,
  }));

  try {
    await csvWriter.writeRecords(records);
    console.log("Mosques data written to mosques.csv");
  } catch (error) {
    console.error("Error writing to CSV file:", error);
  }
}

async function main() {
  const mosques: Mosque[] = await scrape();
  await writeToFile(mosques);
}

main();
