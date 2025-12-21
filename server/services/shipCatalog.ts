import fs from "fs";
import path from "path";

export interface ShipData {
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

class ShipCatalogService {
  private catalog: ShipCatalog | null = null;
  private shipsByTypeId: Map<number, ShipData> = new Map();
  private shipsByGroup: Map<string, ShipData[]> = new Map();
  private allShips: ShipData[] = [];
  
  async initialize(): Promise<void> {
    const catalogPath = path.join(process.cwd(), "server/staticData/sde/shipCatalog.json");
    
    if (!fs.existsSync(catalogPath)) {
      console.warn("Ship catalog not found. Run 'npx tsx scripts/build-ship-catalog.ts' to generate it.");
      return;
    }
    
    const data = fs.readFileSync(catalogPath, "utf-8");
    this.catalog = JSON.parse(data) as ShipCatalog;
    
    this.shipsByTypeId.clear();
    this.shipsByGroup.clear();
    this.allShips = [];
    
    for (const [typeIdStr, ship] of Object.entries(this.catalog.ships)) {
      const typeId = parseInt(typeIdStr, 10);
      this.shipsByTypeId.set(typeId, ship);
      this.allShips.push(ship);
      
      if (!this.shipsByGroup.has(ship.groupName)) {
        this.shipsByGroup.set(ship.groupName, []);
      }
      this.shipsByGroup.get(ship.groupName)!.push(ship);
    }
    
    this.shipsByGroup.forEach((ships: ShipData[]) => {
      ships.sort((a: ShipData, b: ShipData) => a.typeName.localeCompare(b.typeName));
    });
    
    console.log(`Ship catalog loaded: ${this.catalog.totalShips} ships, version ${this.catalog.version}`);
  }
  
  getShipByTypeId(typeId: number): ShipData | undefined {
    return this.shipsByTypeId.get(typeId);
  }
  
  getShipsByGroup(groupName: string): ShipData[] {
    return this.shipsByGroup.get(groupName) || [];
  }
  
  getAllShips(): ShipData[] {
    return this.allShips;
  }
  
  getAllGroups(): string[] {
    return Array.from(this.shipsByGroup.keys()).sort();
  }
  
  searchShips(query: string): ShipData[] {
    const lowerQuery = query.toLowerCase();
    return this.allShips.filter(ship => 
      ship.typeName.toLowerCase().includes(lowerQuery) ||
      ship.typeNameKo.includes(query) ||
      ship.groupName.toLowerCase().includes(lowerQuery) ||
      ship.groupNameKo.includes(query)
    );
  }
  
  getShipsByGroupCategory(): Record<string, ShipData[]> {
    const result: Record<string, ShipData[]> = {};
    this.shipsByGroup.forEach((ships: ShipData[], groupName: string) => {
      result[groupName] = ships;
    });
    return result;
  }
  
  isLoaded(): boolean {
    return this.catalog !== null;
  }
  
  getVersion(): string | null {
    return this.catalog?.version || null;
  }
  
  getTotalShips(): number {
    return this.catalog?.totalShips || 0;
  }
}

export const shipCatalogService = new ShipCatalogService();
