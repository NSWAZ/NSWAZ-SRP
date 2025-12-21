import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import AdmZip from "adm-zip";
import readline from "readline";

const SDE_URL = "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip";
const OUTPUT_DIR = path.join(process.cwd(), "server/data/sde");
const TEMP_DIR = path.join(process.cwd(), "temp_sde");

const SHIP_CATEGORY_ID = 6;

interface SdeCategory {
  categoryID: number;
  categoryName: string;
  categoryNameKo: string;
}

interface SdeGroup {
  groupID: number;
  categoryID: number;
  groupName: string;
  groupNameKo: string;
}

interface ShipData {
  typeID: number;
  typeName: string;
  typeNameKo: string;
  groupID: number;
  groupName: string;
  groupNameKo: string;
  categoryID: number;
  categoryName: string;
  basePrice: number;
  volume?: number;
  marketGroupID?: number;
}

interface ShipCatalog {
  version: string;
  generatedAt: string;
  totalShips: number;
  ships: Record<number, ShipData>;
  groupIndex: Record<string, number[]>;
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith("https") ? https : http;
    
    const request = protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlinkSync(dest);
          downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    });
    
    request.on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function parseCategories(filePath: string): Promise<Map<number, SdeCategory>> {
  const result = new Map<number, SdeCategory>();
  
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      const categoryID = record._key;
      const categoryName = record.name?.en || "";
      const categoryNameKo = record.name?.ko || categoryName;
      
      result.set(categoryID, {
        categoryID,
        categoryName,
        categoryNameKo,
      });
    } catch (e) {}
  }
  
  return result;
}

async function parseGroups(filePath: string): Promise<Map<number, SdeGroup>> {
  const result = new Map<number, SdeGroup>();
  
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      const groupID = record._key;
      const categoryID = record.categoryID;
      const groupName = record.name?.en || "";
      const groupNameKo = record.name?.ko || groupName;
      
      result.set(groupID, {
        groupID,
        categoryID,
        groupName,
        groupNameKo,
      });
    } catch (e) {}
  }
  
  return result;
}

interface TypeRecord {
  typeID: number;
  groupID: number;
  typeName: string;
  typeNameKo: string;
  basePrice: number;
  volume?: number;
  marketGroupID?: number;
  published: boolean;
}

async function parseTypes(filePath: string): Promise<Map<number, TypeRecord>> {
  const result = new Map<number, TypeRecord>();
  
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      const typeID = record._key;
      const groupID = record.groupID;
      const typeName = record.name?.en || "";
      const typeNameKo = record.name?.ko || typeName;
      const basePrice = record.basePrice || 0;
      const volume = record.volume;
      const marketGroupID = record.marketGroupID;
      const published = record.published !== false;
      
      result.set(typeID, {
        typeID,
        groupID,
        typeName,
        typeNameKo,
        basePrice,
        volume,
        marketGroupID,
        published,
      });
    } catch (e) {}
  }
  
  return result;
}

interface SrpLimitsTier {
  name: string;
  maxPayout: number;
  classes: string[];
}

interface SrpLimitsData {
  version: string;
  description: string;
  tiers: SrpLimitsTier[];
}

function validateSrpLimits(groupIndex: Record<string, number[]>) {
  const srpLimitsPath = path.join(process.cwd(), "server/staticData/srpLimits.json");
  
  if (!fs.existsSync(srpLimitsPath)) {
    console.log("\n⚠️  srpLimits.json not found, skipping validation");
    return;
  }
  
  console.log("\n=== Validating srpLimits.json ===");
  
  const srpLimits: SrpLimitsData = JSON.parse(fs.readFileSync(srpLimitsPath, "utf-8"));
  const catalogGroupNames = new Set(Object.keys(groupIndex));
  
  // Build map of class -> tiers
  const classToTiers: Record<string, string[]> = {};
  const allDefinedClasses = new Set<string>();
  
  for (const tier of srpLimits.tiers) {
    for (const className of tier.classes) {
      allDefinedClasses.add(className);
      if (!classToTiers[className]) {
        classToTiers[className] = [];
      }
      classToTiers[className].push(tier.name);
    }
  }
  
  let hasErrors = false;
  
  // Check 1: All catalog group names should be defined in srpLimits
  const missingFromLimits: string[] = [];
  for (const groupName of catalogGroupNames) {
    if (!allDefinedClasses.has(groupName)) {
      missingFromLimits.push(groupName);
    }
  }
  
  if (missingFromLimits.length > 0) {
    hasErrors = true;
    console.log("\n❌ Classes in catalog but NOT defined in srpLimits.json:");
    for (const name of missingFromLimits.sort()) {
      console.log(`   - ${name}`);
    }
  }
  
  // Check 2: Each class should only be in one tier
  const duplicateTiers: Array<{ className: string; tiers: string[] }> = [];
  for (const [className, tiers] of Object.entries(classToTiers)) {
    if (tiers.length > 1) {
      duplicateTiers.push({ className, tiers });
    }
  }
  
  if (duplicateTiers.length > 0) {
    hasErrors = true;
    console.log("\n❌ Classes defined in multiple tiers:");
    for (const { className, tiers } of duplicateTiers) {
      console.log(`   - ${className}: [${tiers.join(", ")}]`);
    }
  }
  
  // Bonus: Check for classes in srpLimits that don't exist in catalog
  const extraInLimits: string[] = [];
  for (const className of allDefinedClasses) {
    if (!catalogGroupNames.has(className)) {
      extraInLimits.push(className);
    }
  }
  
  if (extraInLimits.length > 0) {
    console.log("\n⚠️  Classes in srpLimits.json but NOT in ship catalog (may be outdated):");
    for (const name of extraInLimits.sort()) {
      console.log(`   - ${name}`);
    }
  }
  
  if (!hasErrors) {
    console.log("\n✅ All validations passed!");
    console.log(`   - ${catalogGroupNames.size} ship classes found`);
    console.log(`   - All classes are defined in srpLimits.json`);
    console.log(`   - No duplicate tier assignments`);
  }
}

async function buildShipCatalog() {
  console.log("Building ship catalog from EVE SDE...\n");
  
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const zipPath = path.join(TEMP_DIR, "sde.zip");
  
  if (!fs.existsSync(zipPath)) {
    console.log("Downloading EVE SDE (JSONL format)...");
    await downloadFile(SDE_URL, zipPath);
    console.log("Download complete.\n");
  } else {
    console.log("Using cached SDE zip...\n");
  }
  
  console.log("Extracting relevant files...");
  const zip = new AdmZip(zipPath);
  
  const neededFiles = ["types.jsonl", "groups.jsonl", "categories.jsonl"];
  
  for (const fileName of neededFiles) {
    console.log(`  Extracting ${fileName}...`);
    zip.extractEntryTo(fileName, TEMP_DIR, false, true);
  }
  console.log("Extraction complete.\n");
  
  console.log("Parsing categories...");
  const categories = await parseCategories(path.join(TEMP_DIR, "categories.jsonl"));
  console.log(`  Found ${categories.size} categories`);
  
  console.log("Parsing groups...");
  const groups = await parseGroups(path.join(TEMP_DIR, "groups.jsonl"));
  console.log(`  Found ${groups.size} groups`);
  
  const shipGroups = new Map<number, SdeGroup>();
  for (const [groupID, group] of groups) {
    if (group.categoryID === SHIP_CATEGORY_ID) {
      shipGroups.set(groupID, group);
    }
  }
  console.log(`  Found ${shipGroups.size} ship groups`);
  
  console.log("Parsing types (this may take a moment)...");
  const types = await parseTypes(path.join(TEMP_DIR, "types.jsonl"));
  console.log(`  Found ${types.size} types`);
  
  console.log("\nBuilding ship catalog...");
  const ships: Record<number, ShipData> = {};
  const groupIndex: Record<string, number[]> = {};
  
  for (const [typeID, type] of types) {
    if (!shipGroups.has(type.groupID)) continue;
    if (!type.published) continue;
    
    const group = shipGroups.get(type.groupID)!;
    const category = categories.get(group.categoryID);
    
    const shipData: ShipData = {
      typeID: type.typeID,
      typeName: type.typeName,
      typeNameKo: type.typeNameKo,
      groupID: type.groupID,
      groupName: group.groupName,
      groupNameKo: group.groupNameKo,
      categoryID: group.categoryID,
      categoryName: category?.categoryName || "Ship",
      basePrice: type.basePrice,
      volume: type.volume,
      marketGroupID: type.marketGroupID,
    };
    
    ships[typeID] = shipData;
    
    if (!groupIndex[group.groupName]) {
      groupIndex[group.groupName] = [];
    }
    groupIndex[group.groupName].push(typeID);
  }
  
  const catalog: ShipCatalog = {
    version: new Date().toISOString().split("T")[0],
    generatedAt: new Date().toISOString(),
    totalShips: Object.keys(ships).length,
    ships,
    groupIndex,
  };
  
  console.log(`  Found ${catalog.totalShips} ships across ${Object.keys(groupIndex).length} groups`);
  
  const outputPath = path.join(OUTPUT_DIR, "shipCatalog.json");
  fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2));
  console.log(`\nShip catalog saved to: ${outputPath}`);
  
  // Validate srpLimits.json
  validateSrpLimits(groupIndex);
  
  console.log("\nCleaning up temporary files...");
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  
  console.log("\nDone!");
  console.log(`\nShip groups found:`);
  const sortedGroups = Object.entries(groupIndex).sort((a, b) => b[1].length - a[1].length);
  for (const [groupName, typeIds] of sortedGroups.slice(0, 20)) {
    console.log(`  ${groupName}: ${typeIds.length} ships`);
  }
  if (sortedGroups.length > 20) {
    console.log(`  ... and ${sortedGroups.length - 20} more groups`);
  }
}

buildShipCatalog().catch((err) => {
  console.error("Error building ship catalog:", err);
  process.exit(1);
});
